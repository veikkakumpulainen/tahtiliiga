import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type WebAppAccess = { inOngoingLeague: boolean; isAdmin: boolean };

// On web the tab app is only for players of a league that has started (and
// admins); everyone else stays on the landing page (index.web.tsx).
// Returns null while still checking.
export function useWebAppAccess(session: Session | null): WebAppAccess | null {
  const userId = session?.user.id;
  const [access, setAccess] = useState<{ userId: string; value: WebAppAccess } | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let cancelled = false;
    void Promise.all([
      client.from("team_members").select("team_id, teams!inner(leagues!inner(status))").eq("user_id", userId).eq("status", "active").eq("teams.leagues.status", "ongoing").limit(1),
      client.rpc("is_admin"),
    ]).then(([{ data: memberships }, { data: isAdmin }]) => {
      if (cancelled) return;
      setAccess({ userId, value: { inOngoingLeague: (memberships ?? []).length > 0, isAdmin: isAdmin === true } });
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) return { inOngoingLeague: false, isAdmin: false };
  return access?.userId === userId ? access.value : null;
}
