import { BigShouldersDisplay_900Black } from "@expo-google-fonts/big-shoulders-display";
import { CourierPrime_400Regular, CourierPrime_700Bold } from "@expo-google-fonts/courier-prime";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { GroupsProvider } from "@/hooks/useGroups";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { registerForPush } from "@/lib/notifications";
import { PlayerProvider } from "@/lib/player";
import { colors } from "@/ui/theme";

function RootNavigator() {
  const { loading, user, profile, deleting } = useSession();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    if (user && profile) registerForPush(user.uid).catch(() => {});
  }, [user, profile]);

  useEffect(() => {
    if (!lastResponse || !user || !profile) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponse.current === id) return;
    handledResponse.current = id;
    router.navigate("/");
  }, [lastResponse, user, profile]);

  if (loading || deleting) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !!profile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="join/[gid]" options={{ presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_900Black,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  return (
    <SessionProvider>
      <GroupsProvider>
        <PlayerProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </PlayerProvider>
      </GroupsProvider>
    </SessionProvider>
  );
}
