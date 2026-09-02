// Marks a participation fee as paid once Stripe confirms the checkout.
// Deploy: supabase functions deploy stripe-webhook
// Secrets needed (supabase secrets set ...): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
  throw new Error("stripe-webhook is missing required environment variables");
}

const stripe = new Stripe(stripeSecretKey);
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    return new Response(`Webhook signature verification failed: ${(error as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.client_reference_id;
    if (paymentId) {
      const amount = typeof session.amount_total === "number" ? session.amount_total / 100 : undefined;
      const { error } = await supabase
        .from("payments")
        .update({ payment_status: "paid", paid_at: new Date().toISOString(), ...(amount !== undefined ? { amount } : {}) })
        .eq("id", paymentId);
      if (error) {
        console.error("Failed to mark payment paid", error);
        return new Response("Database update failed", { status: 500 });
      }
    }
  }

  return new Response("ok", { status: 200 });
});
