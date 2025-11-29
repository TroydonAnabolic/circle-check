import { useSession, useSupabase } from '@/lib/supabase/client';
import * as Location from 'expo-location';
import { useGlobalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react'; // added useRef
import { Alert, Button, Linking, Platform, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type LiveLocation = {
    user_id: string;
    lat: number;
    lng: number;
    updated_at: string;
    email?: string;
    color?: string; // from RPC
};

export default function MapScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const mapRef = useRef<MapView | null>(null); // define the ref
    const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [others, setOthers] = useState<LiveLocation[]>([]);
    const { focusUserId, focusColor } = useGlobalSearchParams<{ focusUserId?: string; focusColor?: string }>();
    const [refreshTick, setRefreshTick] = useState(0); // forces marker re-render on refresh

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
        const { data, error } = await supabase.rpc('get_circle_member_locations', {
            p_requester_id: session.user.id,
        });
        if (error) {
            Alert.alert('Error', error.message);
        } else {
            // Verify we have colors
            console.log('Member locations:', (data ?? []).map(d => ({ user_id: d.user_id, color: d.color })));
            setOthers(data ?? []);
            setRefreshTick(t => t + 1); // bump to refresh marker keys
        }
    };

    // React to focusColor changes (e.g., tracking again with a new color)
    useEffect(() => {
        // No-op if not tracking anyone
        if (!focusUserId) return;
        // When focusColor param changes, re-render markers automatically.
    }, [focusColor, focusUserId]);

    // Subscribe to updates (locations + membership color)
    useEffect(() => {
        if (!session?.user) return;
        loadOthers();
        const locChannel = supabase
            .channel('locations-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, loadOthers)
            .subscribe();
        const memChannel = supabase
            .channel('memberships-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'memberships' }, loadOthers)
            .subscribe();
        return () => {
            supabase.removeChannel(locChannel);
            supabase.removeChannel(memChannel);
        };
    }, [session?.user?.id]);

    // Center on tracked user when focusUserId changes
    useEffect(() => {
        if (!focusUserId) return;
        const target = others.find(o => o.user_id === focusUserId);
        if (target && mapRef.current) {
            mapRef.current.animateCamera(
                { center: { latitude: target.lat, longitude: target.lng }, zoom: 15 },
                { duration: 500 }
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
                    ref={(r) => (mapRef.current = r)} // attach ref
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
                        const override =
                            typeof focusColor === 'string' && /^#([0-9a-fA-F]{6})$/.test(focusColor) ? focusColor : undefined;
                        const pinColor = isTracked && override ? override : (o.color ?? '#2f95dc');
                        return (
                            <Marker
                                key={`${o.user_id}-${refreshTick}`} // ensures re-render when colors change
                                coordinate={{ latitude: o.lat, longitude: o.lng }}
                                title={o.email ?? o.user_id}
                                description={`Updated ${new Date(o.updated_at).toLocaleTimeString()}`}
                                pinColor={pinColor}
                                onCalloutPress={() => openDirections(o.lat, o.lng)}
                            />
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