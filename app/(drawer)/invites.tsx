import { useSession, useSupabase } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { Alert, Button, FlatList, Platform, RefreshControl, Text, ToastAndroid, View } from 'react-native';

type Invite = { id: string; circle_id: string; invitee_email: string; status: string };

export default function InvitesScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadInvites = async () => {
        if (!session?.user) return;
        // get my email
        const { data: me } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', session.user.id)
            .maybeSingle();

        const { data, error } = await supabase
            .from('invites')
            .select('id,circle_id,invitee_email,status')
            .eq('status', 'pending')
            .eq('invitee_email', me?.email ?? '__none__'); // only my invites
        if (error) Alert.alert('Error', error.message);
        else setInvites(data ?? []);
    };

    useEffect(() => {
        if (!session?.user) return;
        loadInvites();
    }, [session?.user?.id]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadInvites();
        setRefreshing(false);
    };

    const accept = async (inviteId: string) => {
        const { error } = await supabase.rpc('accept_invite', {
            p_invite_id: inviteId,
            p_accepter_id: session!.user.id,
        });
        if (error) return Alert.alert('Error', error.message);
        if (Platform.OS === 'android') ToastAndroid.show('Joined circle', ToastAndroid.SHORT);
        else Alert.alert('Joined', 'You have joined the circle.');
        onRefresh();
    };

    const decline = async (inviteId: string) => {
        const { error } = await supabase.rpc('decline_invite', {
            p_invite_id: inviteId,
            p_decliner_id: session!.user.id,
        });
        if (error) return Alert.alert('Error', error.message);
        if (Platform.OS === 'android') ToastAndroid.show('Invite declined', ToastAndroid.SHORT);
        else Alert.alert('Declined', 'Invite declined.');
        onRefresh();
    };

    return (
        <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12 }}>Your Invites</Text>
            <FlatList
                data={invites}
                keyExtractor={(i) => i.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={({ item }) => (
                    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee', gap: 8 }}>
                        <Text>Circle: {item.circle_id}</Text>
                        <Text>Invite for: {item.invitee_email}</Text>
                        <Text>Status: {item.status}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button title="Accept" onPress={() => accept(item.id)} />
                            <Button title="Decline" onPress={() => decline(item.id)} />
                        </View>
                    </View>
                )}
            />
        </View>
    );
}