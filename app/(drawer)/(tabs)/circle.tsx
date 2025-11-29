import { useSession, useSupabase } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { Alert, Button, FlatList, Platform, RefreshControl, Text, TextInput, ToastAndroid, View } from 'react-native';

type Circle = { id: string; name: string };
type Member = { user_id: string; email: string; joined_at: string };

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

        if (Platform.OS === 'android') ToastAndroid.show('Invite created', ToastAndroid.SHORT);
        else Alert.alert('Invite created', `Pending for ${email}.`);

        // If invitee doesn’t exist yet, send magic link (unchanged)
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
        if (!profile) {
            await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
            if (Platform.OS === 'android') ToastAndroid.show('Sign-in link emailed to invitee', ToastAndroid.SHORT);
            else Alert.alert('Invite email sent', 'We emailed them a sign-in link.');
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
    const [email, setEmail] = useState('');
    const [members, setMembers] = useState<Member[]>([]);
    const [pendingInvites, setPendingInvites] = useState<{ id: string; invitee_email: string }[]>([]);
    const [loading, setLoading] = useState(false);

    const loadMembers = async () => {
        if (!session?.user) return;
        setLoading(true);
        const { data, error } = await supabase.rpc('get_circle_members', {
            circle_id: item.id,
            requester_id: session.user.id,
        });
        setLoading(false);
        if (error) return Alert.alert('Error', error.message);
        setMembers(data ?? []);
    };

    const loadPendingInvites = async () => {
        const { data, error } = await supabase
            .from('invites')
            .select('id,invitee_email,status')
            .eq('circle_id', item.id)
            .eq('status', 'pending');
        if (!error) setPendingInvites(data ?? []);
    };

    useEffect(() => {
        loadMembers();
        loadPendingInvites();
    }, [item.id, session?.user?.id]);

    return (
        <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>

            {/* Members list */}
            <View style={{ gap: 4 }}>
                <Text style={{ color: '#666' }}>
                    Members {loading ? '(loading...)' : `(${members.length})`}
                </Text>
                {members.map((m) => (
                    <Text key={m.user_id} style={{ color: '#333' }}>
                        • {m.email}
                    </Text>
                ))}
            </View>

            {/* Pending invites */}
            <View style={{ gap: 4 }}>
                <Text style={{ color: '#666' }}>Pending Invites ({pendingInvites.length})</Text>
                {pendingInvites.map((i) => (
                    <Text key={i.id}>• {i.invitee_email}</Text>
                ))}
            </View>

            {/* Invite input */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
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
                        loadMembers(); // refresh after invite
                    }}
                />
            </View>
        </View>
    );
}