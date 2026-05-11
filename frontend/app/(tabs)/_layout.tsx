import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";
import { Platform, View, Text, StyleSheet } from "react-native";
import { BadgesProvider, useBadges } from "../../src/badges";

function IconWithDot({
  name,
  color,
  showDot,
  count,
  testID,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  showDot: boolean;
  count?: number;
  testID?: string;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={name} size={24} color={color} />
      {showDot && (
        <View style={styles.dot} testID={testID}>
          {count && count > 0 ? (
            <Text style={styles.dotText}>{count > 9 ? "9+" : count}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function InnerTabs() {
  const { badges } = useBadges();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.borderLight,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 1,
          marginBottom: Platform.OS === "ios" ? 0 : 4,
        },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 2,
          borderTopColor: colors.border,
          height: Platform.OS === "ios" ? 88 : 70,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "MY TODOS",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "nav-my-todos",
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: "SHARED",
          tabBarIcon: ({ color, focused }) => (
            <IconWithDot
              name={focused ? "people" : "people-outline"}
              color={color}
              showDot={badges.shared_new > 0}
              count={badges.shared_new}
              testID="shared-badge-dot"
            />
          ),
          tabBarButtonTestID: "nav-shared",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "ALERTS",
          tabBarIcon: ({ color, focused }) => (
            <IconWithDot
              name={focused ? "notifications" : "notifications-outline"}
              color={color}
              showDot={badges.notifications_unread > 0}
              count={badges.notifications_unread}
              testID="notifications-badge-dot"
            />
          ),
          tabBarButtonTestID: "nav-notifications",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "nav-profile",
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <BadgesProvider>
      <InnerTabs />
    </BadgesProvider>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 30, height: 28, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.high,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
