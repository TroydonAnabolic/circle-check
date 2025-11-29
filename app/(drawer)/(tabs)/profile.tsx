import { upsertLocation } from '@/lib/location';
import { registerPushToken } from '@/lib/notifications';
import { useSession, useSupabase } from '@/lib/supabase/client';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

export default function Profile() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [sharing, setSharing] = useState(false);
    const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);

    useEffect(() => {
        return () => watcher?.remove();
    }, [watcher]);

    useEffect(() => {
        (async () => {
            if (session?.user) {
                await registerPushToken(supabase, session.user.id);
            }
        })();
    }, [session?.user?.id]);

    const toggleShare = async (val: boolean) => {
        setSharing(val);
        if (!session?.user) {
            Alert.alert('Not signed in', 'Please sign in to share location.');
            setSharing(false);
            return;
        }
        if (val) {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Location permission is required.');
                setSharing(false);
                return;
            }
            const sub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
                async (loc) => {
                    if (!session?.user) return;
                    await upsertLocation(supabase, {
                        user_id: session.user.id,
                        lat: loc.coords.latitude,
                        lng: loc.coords.longitude,
                        updated_at: new Date().toISOString(),
                    });
                }
            );
            setWatcher(sub);
        } else {
            watcher?.remove();
            setWatcher(null);
        }
    };

    return (
        <View style={{ flex: 1, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Location Sharing</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text>Share my location with my circles</Text>
                <Switch value={sharing} onValueChange={toggleShare} />
            </View>
        </View>
    );
}