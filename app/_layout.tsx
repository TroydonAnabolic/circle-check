import { SupabaseProvider } from '@/lib/supabase/client';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <Stack>
        {/* Index will redirect into /auth or /(tabs) */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* Tabs group (Map, Circles, Profile) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Standalone auth screen */}
        <Stack.Screen name="auth" options={{ title: 'Sign In' }} />
      </Stack>
    </SupabaseProvider>
  );
}