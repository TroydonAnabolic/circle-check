import { useSession, useSupabase } from '@/lib/supabase/client';
import * as Location from 'expo-location';
import { useGlobalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react'; // added useRef
import { Alert, Animated, Button, Easing, Linking, Platform, Pressable, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type LiveLocation = {
    user_id: string;
    lat: number;
    lng: number;
    updated_at: string;
    email?: string;
    color?: string;
    circles?: string[]; // added shared circle names
};

export default function MapScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const mapRef = useRef<MapView | null>(null); // define the ref
    const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [others, setOthers] = useState<LiveLocation[]>([]);
    const { focusUserId, focusColor } = useGlobalSearchParams<{ focusUserId?: string; focusColor?: string }>();
    const [refreshTick, setRefreshTick] = useState(0); // forces marker re-render on refresh
    const markerRefs = useRef<Record<string, Marker | null>>({});
    const [selected, setSelected] = useState<LiveLocation | null>(null);
    const sheetAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
    const [myCircles, setMyCircles] = useState<string[]>([]);
    const [markersReady, setMarkersReady] = useState(false);

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
            console.log('RPC error get_circle_member_locations', error);
            Alert.alert('Error', error.message);
        } else {
            console.log('Loaded others count:', data?.length, data?.map(d => ({ user_id: d.user_id, color: d.color, lat: d.lat, lng: d.lng })));
            setOthers((data ?? []).filter(d => typeof d.lat === 'number' && typeof d.lng === 'number'));
            setRefreshTick(t => t + 1);
        }
    };

    // Load my circle names
    useEffect(() => {
        (async () => {
            if (!session?.user) return;
            const { data, error } = await supabase
                .from('memberships')
                .select('circle:circles(name)')
                .eq('user_id', session.user.id);
            if (!error) {
                setMyCircles((data ?? []).map((r: any) => r.circle?.name).filter(Boolean));
            }
        })();
    }, [session?.user?.id]);

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

    const showSheet = () => {
        Animated.timing(sheetAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    const hideSheet = () => {
        Animated.timing(sheetAnim, {
            toValue: 0,
            duration: 180,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
        }).start(() => setSelected(null));
    };

    // When a marker is pressed
    const onSelect = (o: LiveLocation) => {
        setSelected(o);
        showSheet();
    };

    const sheetTranslate = sheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [300, 0], // slide up from bottom
    });

    // Hide panel when tapping map (not a marker)
    const handleMapPress = () => {
        if (selected) hideSheet();
    };

    // Optional: after first load set markersReady to optimize
    useEffect(() => {
        if (others.length) {
            const t = setTimeout(() => setMarkersReady(true), 400);
            return () => clearTimeout(t);
        }
    }, [others]);

    return (
        <View style={{ flex: 1 }}>
            {myLoc && (
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
                    onPress={handleMapPress}
                >
                    <Marker
                        coordinate={{ latitude: myLoc.lat, longitude: myLoc.lng }}
                        title="You"
                        pinColor="#2ecc71"
                        onPress={() =>
                            onSelect({
                                user_id: session?.user?.id || 'me',
                                lat: myLoc.lat,
                                lng: myLoc.lng,
                                updated_at: new Date().toISOString(),
                                email: session?.user?.email,
                                color: '#2ecc71',
                                circles: myCircles,
                            })
                        }
                    >
                        <View style={{
                            backgroundColor: '#2ecc71',
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 20,
                            minWidth: 40,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 2,
                            borderColor: '#fff'
                        }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>ME</Text>
                        </View>
                    </Marker>

                    {others.map(o => {
                        const isTracked = o.user_id === focusUserId;
                        const override =
                            typeof focusColor === 'string' && /^#([0-9a-fA-F]{6})$/.test(focusColor) ? focusColor : undefined;
                        const pinColor = (isTracked && override ? override : o.color) || '#2f95dc';
                        const initials = (o.email ?? 'Member').split('@')[0].slice(0, 2).toUpperCase();
                        return (
                            <Marker
                                key={`${o.user_id}-${refreshTick}`}
                                coordinate={{ latitude: o.lat, longitude: o.lng }}
                                title={o.email ?? 'Member'}
                                onPress={() => onSelect(o)}
                                // Removed tracksViewChanges optimization
                                pinColor={pinColor}
                                zIndex={isTracked ? 10 : 5}
                            >
                                <View style={{
                                    backgroundColor: pinColor,
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderRadius: 20,
                                    minWidth: 40,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 2,
                                    borderColor: '#fff'
                                }}>
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{initials}</Text>
                                </View>
                            </Marker>
                        );
                    })}
                </MapView>
            )}

            {/* Refresh moved to top-left */}
            <View style={{ position: 'absolute', top: 16, left: 16 }}>
                <Button title="Refresh" onPress={loadOthers} />
            </View>

            {/* Bottom sliding panel */}
            {selected && (
                <Animated.View style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    transform: [{ translateY: sheetTranslate }],
                    backgroundColor: '#fff',
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    padding: 16,
                    shadowColor: '#000',
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    elevation: 10,
                    borderTopWidth: 1,
                    borderColor: '#ddd'
                }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 16, fontWeight: '600' }}>{selected.email ?? 'Member'}</Text>
                        <Pressable onPress={hideSheet}>
                            <Text style={{ fontSize: 14, color: '#888' }}>Close</Text>
                        </Pressable>
                    </View>
                    <Text style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
                        Updated {new Date(selected.updated_at).toLocaleTimeString()}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', marginTop: 12, marginBottom: 6 }}>Circles:</Text>
                    {selected.circles?.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {selected.circles.map(c => (
                                <View key={c} style={{
                                    backgroundColor: '#f1f1f1',
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    marginRight: 6,
                                    marginBottom: 6
                                }}>
                                    <Text style={{ fontSize: 12 }}>{c}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text style={{ fontSize: 12, fontStyle: 'italic' }}>None</Text>
                    )}
                    <View style={{ marginTop: 16 }}>
                        <Button title="Get Directions" onPress={() => openDirections(selected.lat, selected.lng)} />
                    </View>
                </Animated.View>
            )}
        </View>
    );
}