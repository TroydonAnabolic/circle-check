import { useSession, useSupabase } from '@/lib/supabase/client';
import { DrawerContentScrollView, DrawerItem, DrawerItemList } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Text, View } from 'react-native';

function CustomDrawerContent(props: any) {
    const supabase = useSupabase();
    const { session } = useSession();
    const router = useRouter();

    const email = session?.user?.email ?? 'Signed out';

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            router.replace('/auth');
        } catch (e) {
            console.warn('Sign out failed', e);
        }
    };

    return (
        <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
            {/* Header with email */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{email}</Text>
            </View>

            <DrawerItemList {...props} />
            <View style={{ marginTop: 'auto' }}>
                <DrawerItem label="Sign Out" onPress={signOut} />
            </View>
        </DrawerContentScrollView>
    );
}

export default function DrawerLayout() {
    return (
        <Drawer
            screenOptions={{ headerShown: true }}
            drawerContent={(props) => <CustomDrawerContent {...props} />}
        >
            <Drawer.Screen name="(tabs)" options={{ title: 'Home' }} />
            <Drawer.Screen name="invites" options={{ title: 'Invites' }} />
            <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
            <Drawer.Screen name="help" options={{ title: 'Help' }} />
        </Drawer>
    );
}