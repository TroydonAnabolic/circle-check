import { useSession } from '@/lib/supabase/client';
import { Redirect } from 'expo-router';

export default function Index() {
    const { session } = useSession();
    if (session) {
        // Land on the map tab when signed in
        return <Redirect href="/(tabs)/map" />;
    }
    return <Redirect href="/auth" />;
}