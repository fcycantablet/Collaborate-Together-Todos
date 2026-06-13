import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";

function NotificationDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        // Handle a notification tap that launched the app
        const last = await Notifications.getLastNotificationResponseAsync();
        if (mounted && last) {
          const data: any = last.notification.request.content.data || {};
          if (data?.todo_id) {
            setTimeout(() => router.push({ pathname: "/todo-detail", params: { todoId: String(data.todo_id) } }), 600);
          }
        }
        // Handle taps while the app is running
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data: any = response.notification.request.content.data || {};
          if (data?.todo_id) {
            router.push({ pathname: "/todo-detail", params: { todoId: String(data.todo_id) } });
          }
        });
        removeListener = () => sub.remove();
      } catch {
        // expo-notifications not available
      }
    })();

    return () => {
      mounted = false;
      if (removeListener) removeListener();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationDeepLinkHandler />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFDF9" } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="create-todo" options={{ presentation: "modal" }} />
            <Stack.Screen name="share-todo" options={{ presentation: "modal" }} />
            <Stack.Screen name="set-reminder" options={{ presentation: "modal" }} />
            <Stack.Screen name="add-proof" options={{ presentation: "modal" }} />
            <Stack.Screen name="todo-detail" options={{ presentation: "card" }} />
            <Stack.Screen name="friends" options={{ presentation: "card" }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
