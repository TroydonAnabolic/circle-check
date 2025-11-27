import { useEffect, useState } from 'react';
import { View, Text, Switch, Button, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useSupabase, useSession } from '@/lib/supabase/client';
import { upsertLocation } from '@/lib/location';

export default function Profile() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [sharing, setSharing] = useState(false);
    const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);

    useEffect(() => {
        return () => watcher?.remove();
    }, [watcher]);

    const toggleShare = async (val: boolean) => {
        setSharing(val);
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
            <Button title="Sign Out" onPress={() => supabase.auth.signOut()} />
        </View>
    );
}