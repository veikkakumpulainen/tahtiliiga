import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
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

// Call before signing out (the RPC needs the session), so a signed-out device
// stops receiving the previous user's notifications.
export async function unregisterPushToken() {
  if (!supabase || Platform.OS === "web") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc("unregister_push_token", { token: data });
  } catch (error) {
    console.warn("Push-tokenin poisto epäonnistui", error);
  }
}

export function usePushNotifications(session: Session | null) {
  useEffect(() => {
    if (!supabase || !session?.user.id || Platform.OS === "web") return;
    const client = supabase;

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

      try {
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
        // Moves the token to this user even if another account used this device before.
        const { error: registerError } = await client.rpc("register_push_token", { token: data, token_platform: Platform.OS === "ios" ? "ios" : "android" });
        if (registerError) console.warn("Push-tokenin tallennus epäonnistui", registerError);
      } catch (error) {
        console.warn("Push-tokenin haku epäonnistui", error);
      }
    })();
  }, [session?.user.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const navigateTo = (path: unknown) => {
      if (typeof path !== "string") return;
      // The root navigator isn't necessarily mounted yet when this fires
      // right at cold start (tapping a notification that launches the app
      // from scratch) - deferring a tick lets router.push land once it is.
      setTimeout(() => router.push(path as never), 0);
    };

    // App launched fresh by tapping a notification: the response listener
    // below never fires for this case, so the last response has to be read
    // explicitly. Clear it after handling so reopening the app normally
    // later doesn't replay the same navigation.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      navigateTo(response?.notification.request.content.data?.path);
      void Notifications.clearLastNotificationResponseAsync();
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateTo(response.notification.request.content.data?.path);
    });
    return () => subscription.remove();
  }, []);
}
