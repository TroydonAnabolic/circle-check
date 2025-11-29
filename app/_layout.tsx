import { SupabaseProvider } from '@/lib/supabase/client';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SupabaseProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(drawer)" />
          <Stack.Screen name="auth" options={{ headerShown: true, title: 'Sign In' }} />
        </Stack>
      </SupabaseProvider>
    </GestureHandlerRootView>
  );
}