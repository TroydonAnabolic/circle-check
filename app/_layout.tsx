import { SupabaseProvider } from '@/lib/supabase/client';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Circle Check' }} />
        <Stack.Screen name="map" options={{ title: 'Map' }} />
        <Stack.Screen name="auth" options={{ title: 'Sign In' }} />
        <Stack.Screen name="circle" options={{ title: 'Your Circles' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile & Sharing' }} />
      </Stack>
    </SupabaseProvider>
  );
}