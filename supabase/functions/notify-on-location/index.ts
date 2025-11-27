// Deno Edge Function
// Deploy with: supabase functions deploy notify-on-location
// Secrets needed:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// Optional webhook shared secret:
// - HOOK_SECRET

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.4";

type LocationRow = {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
};

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const hookSecret = Deno.env.get("HOOK_SECRET");

  if (!url || !serviceKey) {
    return new Response("Missing server config", { status: 500 });
  }

  if (hookSecret) {
    const provided = req.headers.get("x-hook-secret");
    if (provided !== hookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = createClient(url, serviceKey);

  const payload = await req.json().catch(() => null);
  // Expect Supabase Realtime Webhook payload:
  // { type, table, schema, record: {...}, old_record: {...}, ... }
  const record: LocationRow | undefined = payload?.record;
  if (!record?.user_id) {
    return new Response("No record", { status: 200 });
  }

  const subjectUserId = record.user_id;
  const subjectLat = record.lat;
  const subjectLng = record.lng;

  // Find subscriptions owned by users who share a circle with subject
  const { data: subs, error: subsErr } = await supabase.rpc(
    "get_relevant_radius_subscriptions",
    { subject_user: subjectUserId }
  );

  if (subsErr) {
    console.error("RPC error", subsErr.message);
    return new Response("RPC error", { status: 200 });
  }

  if (!subs || subs.length === 0) {
    return new Response("No relevant subscriptions", { status: 200 });
  }

  // For each subscription, check inside/outside
  for (const s of subs as Array<{
    subscription_id: string;
    owner_user_id: string;
    center_lat: number;
    center_lng: number;
    radius_m: number;
  }>) {
    const distance = haversineMeters(
      subjectLat,
      subjectLng,
      s.center_lat,
      s.center_lng
    );
    const isInside = distance <= s.radius_m;

    // Load current state
    const { data: state } = await supabase
      .from("entry_states")
      .select("inside")
      .eq("subscription_id", s.subscription_id)
      .eq("subject_user_id", subjectUserId)
      .maybeSingle();

    const wasInside = state?.inside ?? false;

    // Update state
    await supabase.from("entry_states").upsert({
      subscription_id: s.subscription_id,
      subject_user_id: subjectUserId,
      inside: isInside,
      updated_at: new Date().toISOString(),
    });

    // Fire only on enter transition (was outside -> now inside)
    if (!wasInside && isInside) {
      // Load all device tokens for owner
      const { data: tokens } = await supabase
        .from("device_tokens")
        .select("token")
        .eq("user_id", s.owner_user_id);

      interface DeviceToken {
        token: string;
      }

      interface ExpoMessageData {
        subject_user_id: string;
        center_lat: number;
        center_lng: number;
        radius_m: number;
        distance_m: number;
      }

      interface ExpoPushMessage {
        to: string;
        title: string;
        body: string;
        data: ExpoMessageData;
        sound: "default";
      }

      const expoMessages: ExpoPushMessage[] = (
        (tokens as DeviceToken[] | null | undefined) ?? []
      ).map(
        (t: DeviceToken): ExpoPushMessage => ({
          to: t.token,
          title: "Circle Check",
          body: "A circle member just entered your alert area.",
          data: {
            subject_user_id: subjectUserId,
            center_lat: s.center_lat,
            center_lng: s.center_lng,
            radius_m: s.radius_m,
            distance_m: Math.round(distance),
          },
          sound: "default",
        })
      );

      if (expoMessages.length > 0) {
        // Expo push API
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            accept: "application/json",
            "accept-encoding": "gzip, deflate",
            "content-type": "application/json",
          },
          body: JSON.stringify(expoMessages),
        }).catch((e) => console.error("Push send failed", e?.message));
      }
    }
  }

  return new Response("OK", { status: 200 });
});
