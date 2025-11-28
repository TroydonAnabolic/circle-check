import { useSupabase } from '@/lib/supabase/client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';

export default function Auth() {
    const supabase = useSupabase();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [sent, setSent] = useState(false);

    useEffect(() => {
        // if session exists, your index route will redirect to /(tabs)/map
        // you can optionally fetch session here and navigate
    }, []);

    const sendOtp = async () => {
        if (!email) {
            Alert.alert('Email required');
            return;
        }
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true, // auto-signup if not existing
            },
        });
        if (error) Alert.alert('Error', error.message);
        else {
            setSent(true);
            Alert.alert('Check your email', 'We sent a 6-digit code.');
        }
    };

    const verifyOtp = async () => {
        if (!email || !code) {
            Alert.alert('Enter email and code');
            return;
        }
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token: code.trim(),
            type: 'email',
        });
        if (error) {
            Alert.alert('Invalid code', error.message);
            return;
        }
        router.replace('/(tabs)/map');
    };

    return (
        <View style={{ flex: 1, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Sign in with Email OTP</Text>
            <TextInput
                placeholder="email@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
            />
            <Button title="Send Code" onPress={sendOtp} />
            {sent && (
                <>
                    <TextInput
                        placeholder="Enter 6-digit code"
                        keyboardType="number-pad"
                        value={code}
                        onChangeText={setCode}
                        maxLength={8}
                        style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 }}
                    />
                    <Button title="Verify Code" onPress={verifyOtp} />
                </>
            )}
        </View>
    );
}