import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

// Use env values
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Provide React Native storage + persistence options
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not needed for native
  },
});

const SupabaseCtx = createContext<SupabaseClient | null>(null);
const SessionCtx = createContext<{ session: Session | null | undefined }>({ session: undefined });

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      console.log('Restored session?', !!data.session);
      setSession(data.session ?? null); // null when signed out
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth event:', event, !!newSession);
      setSession(newSession ?? null); // null on SIGNED_OUT
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <SupabaseCtx.Provider value={supabase}>
      <SessionCtx.Provider value={{ session }}>{children}</SessionCtx.Provider>
    </SupabaseCtx.Provider>
  );
}

export function useSupabase() {
  const c = useContext(SupabaseCtx);
  if (!c) throw new Error('Supabase not initialized');
  return c;
}

export function useSession() {
  return useContext(SessionCtx);
}