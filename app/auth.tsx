import { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { useSupabase } from '@/lib/supabase/client';

export default function Auth() {
    const supabase = useSupabase();
    const [email, setEmail] = useState('');

    const sendMagicLink = async () => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: 'circlecheck://index' },
        });
        if (error) Alert.alert('Error', error.message);
        else Alert.alert('Check your email', 'Magic sign-in link sent.');
    };

    return (
        <View style={{ flex: 1, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Sign in with magic link</Text>
            <TextInput
                placeholder="email@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
            />
            <Button title="Send Magic Link" onPress={sendMagicLink} />
        </View>
    );
}