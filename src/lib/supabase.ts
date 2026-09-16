import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Distinguishes the real production deployment from local dev and the dev
// branch's preview - both point at the tahtiliiga-dev Supabase project, only
// the production build points at this one.
export const isProductionSupabase = supabaseUrl?.includes("onmrikfysxqkzlnhlepv") ?? false;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: typeof window === "undefined" ? undefined : AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;