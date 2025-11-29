import { useSession } from '@/lib/supabase/client';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
    const { session } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (session === undefined) return; // still restoring
        if (session) router.replace('/(drawer)/(tabs)/map');
        else router.replace('/auth');
    }, [session]);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
        </View>
    );
}