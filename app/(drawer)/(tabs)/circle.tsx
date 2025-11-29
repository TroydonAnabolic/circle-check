import { useSession, useSupabase } from '@/lib/supabase/client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Circle = { id: string; name: string };
type Member = { user_id: string; email: string; joined_at: string; color?: string };

export default function CircleScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [newCircleName, setNewCircleName] = useState('');
    const [circles, setCircles] = useState<Circle[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadCircles = async () => {
        const { data, error } = await supabase
            .from('circles')
            .select('id,name')
            .order('created_at', { ascending: false });
        if (error) Alert.alert('Error', error.message);
        else setCircles(data ?? []);
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadCircles();
        setRefreshing(false);
    };

    useEffect(() => {
        if (!session?.user) return;
        // loadCircles only when signed in
        loadCircles();
    }, [session?.user?.id]);

    const createCircle = async () => {
        const { data: circle, error } = await supabase
            .from('circles')
            .insert({ name: newCircleName })
            .select()
            .single();
        if (error) return Alert.alert('Error', error.message);

        // The trigger already added you to memberships; this is now optional.
        await supabase.from('memberships').upsert({ circle_id: circle.id, user_id: session!.user.id });

        setNewCircleName('');
        loadCircles();
    };

    const inviteByEmail = async (circleId: string, email: string) => {
        if (!email) return Alert.alert('Email required', 'Enter the user’s email.');
        const { error } = await supabase.rpc('invite_member', {
            p_circle_id: circleId,
            p_requester_id: session!.user.id,
            p_invitee_email: email,
        });
        if (error?.message === 'not_allowed') {
            return Alert.alert('Not allowed', 'You must be a member of this circle to invite others.');
        }
        if (error) return Alert.alert('Error', error.message);

        // If invitee doesn’t exist yet, send magic link (unchanged)
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
        if (!profile) {
            await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        }

        // Refresh circles and pending invites lists
        await loadCircles();
    };

    return (
        <View style={{ flex: 1, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Your Circles</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                    placeholder="New circle name"
                    value={newCircleName}
                    onChangeText={setNewCircleName}
                    style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
                />
                <Button title="Create" onPress={createCircle} />
            </View>
            <FlatList
                data={circles}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => <CircleItem item={item} invite={inviteByEmail} />}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
        </View>
    );
}

function CircleItem({ item, invite }: { item: Circle; invite: (id: string, email: string) => void }) {
    const supabase = useSupabase();
    const { session } = useSession();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [openPaletteFor, setOpenPaletteFor] = useState<string | null>(null);
    const PALETTE = ['#2f95dc', '#ff3b30', '#34c759', '#ff9f0a', '#af52de', '#5ac8fa'];

    const loadMembers = async () => {
        if (!session?.user) return;
        setLoading(true);
        // Use RPC that checks you belong to the circle, then returns all members with email
        const { data, error } = await supabase.rpc('get_circle_members', {
            circle_id: item.id,
            requester_id: session.user.id,
        });
        setLoading(false);
        if (error) return Alert.alert('Error', error.message);
        setMembers(
            (data ?? []).map((m: any) => ({
                user_id: m.user_id,
                email: m.email,
                joined_at: m.joined_at,
                // keep existing default color until we extend RPC to include it
                color: '#2f95dc',
            }))
        );
    };

    useEffect(() => {
        loadMembers();
    }, [item.id, session?.user?.id]);

    const goTrack = (memberId: string) => {
        const m = members.find(mm => mm.user_id === memberId);
        const focusColor = m?.color ?? '#2f95dc';
        router.push({ pathname: '/(drawer)/(tabs)/map', params: { focusUserId: memberId, focusColor } });
    };

    const saveColor = async (memberId: string, color: string) => {
        const hex = color.trim();
        const { error } = await supabase
            .from('memberships')
            .update({ color: hex })
            .eq('circle_id', item.id)
            .eq('user_id', memberId);
        if (error) return Alert.alert('Error', error.message);
        setMembers((prev) => prev.map((m) => (m.user_id === memberId ? { ...m, color: hex } : m)));
        setOpenPaletteFor(null);
        // No navigation here; Map will get the override via focusColor when you tap Track.
    };

    return (
        <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>

            <View style={{ gap: 4 }}>
                <Text style={{ color: '#666' }}>
                    Members {loading ? '(loading...)' : `(${members.length})`}
                </Text>
                {members.map((m) => (
                    <View key={m.user_id} style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {/* Tap swatch to open palette */}
                            <TouchableOpacity onPress={() => setOpenPaletteFor(openPaletteFor === m.user_id ? null : m.user_id)}>
                                <View
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: '#ccc',
                                        backgroundColor: m.color ?? '#2f95dc',
                                    }}
                                />
                            </TouchableOpacity>

                            <Text style={{ color: '#333', flex: 1 }}>
                                • {m.email}{m.user_id === session?.user?.id ? ' (you)' : ''}
                            </Text>

                            <Button title="Track" onPress={() => goTrack(m.user_id)} />
                        </View>

                        {/* Inline palette */}
                        {openPaletteFor === m.user_id && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PALETTE.map((c) => (
                                    <TouchableOpacity key={c} onPress={() => saveColor(m.user_id, c)}>
                                        <View
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 6,
                                                borderWidth: m.color === c ? 2 : 1,
                                                borderColor: m.color === c ? '#000' : '#ccc',
                                                backgroundColor: c,
                                            }}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                ))}
            </View>

            {/* Invite input (unchanged) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                    placeholder="friend@example.com"
                    value={email}
                    onChangeText={setEmail}
                    style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
                />
                <Button
                    title="Invite"
                    onPress={async () => {
                        await invite(item.id, email);
                        setEmail('');
                        loadMembers(); // refresh members list
                    }}
                />
            </View>
        </View>
    );
}