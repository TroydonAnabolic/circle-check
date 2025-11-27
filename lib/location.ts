import { SupabaseClient } from "@supabase/supabase-js";

export async function upsertLocation(
  supabase: SupabaseClient,
  loc: { user_id: string; lat: number; lng: number; updated_at: string }
) {
  const { error } = await supabase
    .from("locations")
    .upsert(loc, { onConflict: "user_id" });
  if (error) console.warn("Failed to upsert location", error.message);
}
