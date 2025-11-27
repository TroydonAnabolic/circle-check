import { createContext, useContext, useEffect, useState } from 'react';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SupabaseCtx = createContext<SupabaseClient | null>(null);
const SessionCtx = createContext<{ session: Session | null }>({ session: null });

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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