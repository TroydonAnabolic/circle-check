import { useSession, useSupabase } from '@/lib/supabase/client';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Linking, Platform, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type LiveLocation = {
    user_id: string;
    lat: number;
    lng: number;
    updated_at: string;
    profiles?: { email: string };
};

export default function MapScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [others, setOthers] = useState<LiveLocation[]>([]);

    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Location permission is required.');
                return;
            }
            const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setMyLoc({ lat: current.coords.latitude, lng: current.coords.longitude });
        })();
    }, []);

    const loadOthers = async () => {
        const { data, error } = await supabase.rpc('get_circle_member_locations', { requester_id: session!.user.id });
        if (error) Alert.alert('Error', error.message);
        else setOthers(data ?? []);
    };

    useEffect(() => {
        if (!session?.user) return;
        loadOthers();
        const channel = supabase
            .channel('locations-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
                loadOthers();
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

    const openDirections = (lat: number, lng: number) => {
        const url = Platform.select({
            ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
            android: `google.navigation:q=${lat},${lng}`,
            default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        });
        if (url) Linking.openURL(url);
    };

    const region = useMemo(
        () => ({
            latitude: myLoc?.lat ?? 37.7749,
            longitude: myLoc?.lng ?? -122.4194,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        }),
        [myLoc]
    );

    return (
        <View style={{ flex: 1 }}>
            <MapView style={{ flex: 1 }} initialRegion={region}>
                {myLoc && (
                    <Marker coordinate={{ latitude: myLoc.lat, longitude: myLoc.lng }} title="You" />
                )}
                {others.map((o) => (
                    <Marker
                        key={o.user_id}
                        coordinate={{ latitude: o.lat, longitude: o.lng }}
                        title={o.profiles?.email ?? o.user_id}
                        description={`Updated ${new Date(o.updated_at).toLocaleTimeString()}`}
                        onCalloutPress={() => openDirections(o.lat, o.lng)}
                    />
                ))}
            </MapView>
            <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                <Button title="Refresh" onPress={loadOthers} />
            </View>
        </View>
    );
}