import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

/**
 * Hook that restricts access to app screens (admin, league, group) on web.
 * Redirects non-admin web users back to home.
 * Admins can access app screens on web for management purposes.
 */
export function useAppScreenRestriction() {
  const { session, loading } = useAuth();
  
  useEffect(() => {
    if (loading || !session) return;
    
    // Check if we're on web
    const isWeb = typeof window !== "undefined";
    
    if (isWeb) {
      // Check if user is admin from Supabase profiles table
      if (!supabase) return;
      void (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profile?.role !== "admin") {
          // Non-admin web user - redirect to home
          router.replace("/(tabs)/home");
        }
      })();
    }
  }, [session, loading]);
}
