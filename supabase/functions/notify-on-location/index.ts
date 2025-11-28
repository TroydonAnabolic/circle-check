// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("Hello from Functions!");

// Secrets required:
// - SUPABASE_URL
// -
// Optional shared secret (recommended for webhook auth):
// - HOOK_SECRET
//
// Deploy (webhook style, no JWT):
// supabase functions deploy notify-on-location --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.4";
//import "jsr:@supabase/functions-js/edge-runtime.d.ts"

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
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  try {
    console.log("Notify-on-location reading secrets");

    const url = Deno.env.get("EXPO_PUBLIC_SUPABASE_URL");
    console.log("Supabase URL:", url ? "found" : "not found");
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
    console.log(
      "Service role key:",
      serviceKey ? "found: " + serviceKey : "not found"
    );
    const hookSecret = Deno.env.get("HOOK_SECRET");
    console.log("Hook secret:", hookSecret ? "found" : "not found");
    if (!url || !serviceKey) {
      return new Response("Missing server config", { status: 500 });
    }

    if (hookSecret) {
      const provided = req.headers.get("x-hook-secret");
      console.log("Provided hook secret:", provided ? "found" : "not found");
      if (provided !== hookSecret) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = await req.json().catch(() => null);
    const record: LocationRow | undefined = payload?.record;
    if (!record?.user_id) {
      return new Response("No record", { status: 200 });
    }

    const supabase = createClient(url, serviceKey);

    const { data: subs, error: subsErr } = await supabase.rpc(
      "get_relevant_radius_subscriptions",
      { subject_user: record.user_id }
    );
    if (subsErr) {
      console.error("RPC error", subsErr.message);
      return new Response("RPC error", { status: 200 });
    }
    if (!subs || subs.length === 0) {
      return new Response("No relevant subscriptions", { status: 200 });
    }

    // Collect notifications
    const expoMessages: Array<{
      to: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
      sound: "default";
    }> = [];

    for (const s of subs as Array<{
      subscription_id: string;
      owner_user_id: string;
      center_lat: number;
      center_lng: number;
      radius_m: number;
    }>) {
      const distance = haversineMeters(
        record.lat,
        record.lng,
        s.center_lat,
        s.center_lng
      );
      const isInside = distance <= s.radius_m;

      const { data: state } = await supabase
        .from("entry_states")
        .select("inside")
        .eq("subscription_id", s.subscription_id)
        .eq("subject_user_id", record.user_id)
        .maybeSingle();

      const wasInside = state?.inside ?? false;

      // Update inside/outside state
      await supabase.from("entry_states").upsert({
        subscription_id: s.subscription_id,
        subject_user_id: record.user_id,
        inside: isInside,
        updated_at: new Date().toISOString(),
      });

      // Trigger only on enter transition
      if (!wasInside && isInside) {
        const { data: tokens } = await supabase
          .from("device_tokens")
          .select("token")
          .eq("user_id", s.owner_user_id);

        for (const t of tokens ?? []) {
          expoMessages.push({
            to: t.token,
            title: "Circle Check",
            body: "A circle member just entered your alert area.",
            sound: "default",
            data: {
              subject_user_id: record.user_id,
              subscription_id: s.subscription_id,
              center_lat: s.center_lat,
              center_lng: s.center_lng,
              radius_m: s.radius_m,
              distance_m: Math.round(distance),
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }

    if (expoMessages.length > 0) {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(expoMessages),
      }).catch((e) => {
        console.error("Push send failed", e?.message);
        return null;
      });
      if (res && !res.ok) {
        console.error("Expo push response not ok", res.status);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Unhandled error", e);
    return new Response("Error", { status: 500 });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/notify-on-location' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
