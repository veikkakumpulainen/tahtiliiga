import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(session: Session | null) {
  useEffect(() => {
    if (!supabase || !session?.user.id || Platform.OS === "web" || !Device.isDevice) return;
    const client = supabase;
    const userId = session.user.id;

    (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", { name: "Tähtiliiga", importance: Notifications.AndroidImportance.DEFAULT });
      }
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== "granted") return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      await client.from("push_tokens").upsert(
        { user_id: userId, expo_push_token: data, platform: Platform.OS === "ios" ? "ios" : "android" },
        { onConflict: "expo_push_token" },
      );
    })();
  }, [session?.user.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = response.notification.request.content.data?.path;
      if (typeof path === "string") router.push(path as never);
    });
    return () => subscription.remove();
  }, []);
}
