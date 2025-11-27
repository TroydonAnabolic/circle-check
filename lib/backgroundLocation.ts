import { SupabaseClient } from "@supabase/supabase-js";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { upsertLocation } from "./location";

export const BACKGROUND_LOCATION_TASK = "BACKGROUND_LOCATION_TASK";

type TaskData = {
  locations?: Location.LocationObject[];
};

let supabaseRef: SupabaseClient | null = null;
let userIdRef: string | null = null;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("Background location task error:", error);
    return;
  }
  if (!supabaseRef || !userIdRef) {
    // Not initialized yet
    return;
  }
  const taskData = data as TaskData;
  const loc = taskData.locations?.[0];
  if (!loc) return;

  try {
    await upsertLocation(supabaseRef, {
      user_id: userIdRef,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("Failed to upsert background location", e?.message);
  }
});

export function initBackgroundLocationContext(
  supabase: SupabaseClient,
  userId: string
) {
  supabaseRef = supabase;
  userIdRef = userId;
}

// Start background updates (returns true if started)
export async function startBackgroundLocation(): Promise<boolean> {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );
  if (hasStarted) return true;

  // Request permissions
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    console.warn("Foreground location not granted");
    return false;
  }

  // Android background permission needed; iOS uses Always
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    console.warn("Background location not granted");
    return false;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    // Balanced accuracy; increase interval/distance to reduce battery usage
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60000, // 60s minimum
    distanceInterval: 25, // 25 meters
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true, // iOS indicator
    foregroundService: {
      notificationTitle: "Circle Check",
      notificationBody: "Sharing your location in the background.",
      notificationColor: "#2196f3",
    },
  });

  return true;
}

export async function stopBackgroundLocation(): Promise<boolean> {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );
  if (!hasStarted) return true;
  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  return true;
}
