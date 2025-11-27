import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert } from 'react-native';
import { useSupabase, useSession } from '@/lib/supabase/client';

type Circle = { id: string; name: string };

export default function CircleScreen() {
    const supabase = useSupabase();
    const { session } = useSession();
    const [newCircleName, setNewCircleName] = useState('');
    const [circles, setCircles] = useState<Circle[]>([]);

    const loadCircles = async () => {
        const { data, error } = await supabase
            .from('memberships')
            .select('circles(id,name)')
            .eq('user_id', session?.user.id);
        if (error) Alert.alert('Error', error.message);
        else setCircles((data ?? []).map((d: any) => d.circles));
    };

    useEffect(() => {
        loadCircles();
    }, [session?.user?.id]);

    const createCircle = async () => {
        const { data: circle, error } = await supabase
            .from('circles')
            .insert({ name: newCircleName })
            .select()
            .single();
        if (error) return Alert.alert('Error', error.message);
        await supabase.from('memberships').insert({ circle_id: circle.id, user_id: session!.user.id });
        setNewCircleName('');
        loadCircles();
    };

    const inviteByEmail = async (circleId: string, email: string) => {
        const { data: userLookup, error } = await supabase
            .from('profiles')
            .select('id,email')
            .eq('email', email)
            .single();
        if (error) return Alert.alert('Error', error.message);
        await supabase.from('memberships').insert({ circle_id: circleId, user_id: userLookup.id });
        Alert.alert('Invited', `Added ${email} to the circle.`);
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
            />
        </View>
    );
}

function CircleItem({ item, invite }: { item: Circle; invite: (id: string, email: string) => void }) {
    const [email, setEmail] = useState('');
    return (
        <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                    placeholder="friend@example.com"
                    value={email}
                    onChangeText={setEmail}
                    style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
                />
                <Button title="Invite" onPress={() => invite(item.id, email)} />
            </View>
        </View>
    );
}