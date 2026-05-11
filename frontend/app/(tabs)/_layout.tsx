import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";
import { Platform, View } from "react-native";

export default function TabsLayout() {
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
            <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
          ),
          tabBarButtonTestID: "nav-shared",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "ALERTS",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} size={24} color={color} />
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
