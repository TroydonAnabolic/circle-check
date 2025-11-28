import { useSupabase } from '@/lib/supabase/client';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Button, Platform, Text, TextInput, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession(); // web compatibility

const redirectTo = makeRedirectUri();
__DEV__
    ? (Platform.OS === 'android' || Platform.OS === 'ios'
        ? makeRedirectUri() // exp://<ip>:<port>
        : makeRedirectUri({ scheme: 'circlecheck' }))
    : 'circlecheck://index';

console.log('Redirect URI:', redirectTo);

async function createSessionFromUrl(
    url: string,
    supabase: ReturnType<typeof useSupabase>,
    onSuccessNavigate: () => void
) {
    try {
        const { params, errorCode } = QueryParams.getQueryParams(url);
        if (errorCode) throw new Error(errorCode);
        const { access_token, refresh_token } = params;
        if (!access_token || !refresh_token) return;
        const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        });
        if (error) throw error;
        // Navigate once the session is set
        onSuccessNavigate();
    } catch (e: any) {
        console.warn('Session link parse failed', e.message);
    }
}


export default function Auth() {
    const supabase = useSupabase();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const incoming = Linking.useURL();

    useEffect(() => {
        if (incoming) {
            createSessionFromUrl(incoming, supabase, () => {
                router.replace('/(tabs)/map');
            });
        }
    }, [incoming]);

    const sendMagicLink = async () => {
        if (!email) {
            Alert.alert('Email required');
            return;
        }
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo },
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