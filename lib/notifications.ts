import { SupabaseClient } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure how notifications are handled when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // iOS/Android permission prompt
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.warn("Push notifications permission not granted");
    return null;
  }

  // IMPORTANT: For SDK 51+ provide projectId in dev client/production. In Expo Go, it may auto-detect.
  // If needed, pass: { projectId: 'your-eas-project-id' }
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Android channel (optional)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Store token (upsert by token)
  const { error } = await supabase
    .from("device_tokens")
    .upsert({ token, user_id: userId });
  if (error) {
    console.warn("Failed to save push token", error.message);
    return null;
  }
  return token;
}
