import { useSession, useSupabase } from '@/lib/supabase/client';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    const { focusUserId } = useLocalSearchParams<{ focusUserId?: string }>();
    const mapRef = useRef<MapView | null>(null);

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
        if (!session?.user) return;
        const { data, error } = await supabase.rpc('get_circle_member_locations', { requester_id: session.user.id });
        if (error) {
            Alert.alert('Error', error.message);
        } else {
            console.log('Loaded member locations count:', data?.length ?? 0);
            setOthers(data ?? []);
        }
    };

    useEffect(() => {
        if (!session?.user) return;
        loadOthers();
        const channel = supabase
            .channel('locations-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (payload) => {
                console.log('Realtime locations change', payload);
                loadOthers();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [session?.user?.id]);

    // Center camera on tracked user when focusUserId changes
    useEffect(() => {
        if (!focusUserId) return;
        const target = others.find((o) => o.user_id === focusUserId);
        if (target && mapRef.current) {
            mapRef.current.animateCamera(
                { center: { latitude: target.lat, longitude: target.lng }, zoom: 15 },
                { duration: 600 }
            );
        }
    }, [focusUserId, others]);

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
            {myLoc ? (
                <MapView
                    ref={(r) => (mapRef.current = r)}
                    style={{ flex: 1 }}
                    initialRegion={{
                        latitude: myLoc.lat,
                        longitude: myLoc.lng,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    }}
                    showsUserLocation
                >
                    {/* Your marker */}
                    <Marker
                        coordinate={{ latitude: myLoc.lat, longitude: myLoc.lng }}
                        title="You"
                        description="Your current location"
                        pinColor="#2ecc71"
                    />

                    {/* Others markers */}
                    {others.map((o) => {
                        const isTracked = o.user_id === focusUserId;
                        return (
                            <Marker
                                key={o.user_id}
                                coordinate={{ latitude: o.lat, longitude: o.lng }}
                                title={o.profiles?.email ?? o.user_id}
                                description={`Updated ${new Date(o.updated_at).toLocaleTimeString()}`}
                                pinColor={isTracked ? '#ff3b30' : '#2f95dc'}
                                onCalloutPress={() => openDirections(o.lat, o.lng)}
                            >
                                {/* Optional custom icon */}
                                {/* <Image source={isTracked ? require('@/assets/marker-tracked.png') : require('@/assets/marker-default.png')}
                                        style={{ width: 30, height: 30 }} /> */}
                            </Marker>
                        );
                    })}
                </MapView>
            ) : (
                <View style={{ flex: 1 }} />
            )}
            <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                <Button title="Refresh" onPress={loadOthers} />
            </View>
        </View>
    );
}