import type { SupabaseClient } from "@supabase/supabase-js";

export const PARTICIPATION_FEE = 30;

const paymentLinkUrl = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_URL;

export function buildPaymentUrl(paymentId: string): string | null {
  if (!paymentLinkUrl) return null;
  return `${paymentLinkUrl}?client_reference_id=${paymentId}`;
}

// A plain upsert would need an UPDATE policy too (Postgres checks every
// clause an "insert ... on conflict do update" could take, even when no
// conflict happens) - but only admins/the webhook may ever move a payment to
// "paid", so regular players only get an INSERT policy. Insert, and on a
// unique-violation (23505) fall back to reading the row they already made.
export async function getOrCreatePaymentId(client: SupabaseClient, teamId: string, userId: string): Promise<string | null> {
  const { data, error } = await client.from("payments").insert({ team_id: teamId, user_id: userId, amount: PARTICIPATION_FEE, payment_status: "pending", payment_method: "split" }).select("id").single();
  if (!error && data) return data.id;
  if (error?.code === "23505") {
    const { data: existing } = await client.from("payments").select("id").eq("team_id", teamId).eq("user_id", userId).single();
    if (existing) return existing.id;
  }
  return null;
}
