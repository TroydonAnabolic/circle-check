import { useSupabase } from '@/lib/supabase/client';
import { DrawerContentScrollView, DrawerItem, DrawerItemList } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { View } from 'react-native';

function CustomDrawerContent(props: any) {
    const supabase = useSupabase();
    const router = useRouter();

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            // Use expo-router to navigate by path
            router.replace('/auth');
        } catch (e) {
            console.warn('Sign out failed', e);
        }
    };

    return (
        <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
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