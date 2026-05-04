import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "../../../lib/stripe";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

export const runtime = "nodejs";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }

  return secret;
}

function getStripeId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;

    return typeof id === "string" ? id : "";
  }

  return "";
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = (invoice as unknown as { subscription?: unknown })
    .subscription;

  return getStripeId(subscription);
}

async function markCheckoutComplete(session: Stripe.Checkout.Session) {
  const leadId = session.metadata?.lead_id || "";
  const leadSlug = session.metadata?.lead_slug || "";

  if (!leadId || !leadSlug) {
    throw new Error("Missing checkout session lead metadata");
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("id,slug")
    .eq("id", leadId)
    .eq("slug", leadSlug)
    .maybeSingle();

  if (leadError) {
    throw leadError;
  }

  if (!leadRow) {
    throw new Error("No exact lead match for checkout session metadata");
  }

  const { error } = await supabase
    .from("leads")
    .update({
      status: "client",
      stripe_customer_id: getStripeId(session.customer),
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: getStripeId(session.subscription),
      payment_status: "paid",
      paid_at: now,
      client_started_at: now,
    })
    .eq("id", leadId)
    .eq("slug", leadSlug);

  if (error) {
    throw error;
  }
}

async function updatePaymentStatusByInvoice(
  invoice: Stripe.Invoice,
  paymentStatus: string
) {
  const supabase = getSupabaseAdmin();
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const customerId = getStripeId(invoice.customer);

  let query = supabase.from("leads").update({ payment_status: paymentStatus });

  if (subscriptionId) {
    query = query.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    query = query.eq("stripe_customer_id", customerId);
  } else {
    return;
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function updatePaymentStatusBySubscription(
  subscription: Stripe.Subscription,
  paymentStatus: string
) {
  const supabase = getSupabaseAdmin();
  const subscriptionId = subscription.id;
  const customerId = getStripeId(subscription.customer);

  let query = supabase.from("leads").update({ payment_status: paymentStatus });

  if (subscriptionId) {
    query = query.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    query = query.eq("stripe_customer_id", customerId);
  } else {
    return;
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret()
    );
  } catch (error) {
    console.error("STRIPE_WEBHOOK_SIGNATURE_ERROR", error);

    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await markCheckoutComplete(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "invoice.payment_failed") {
      await updatePaymentStatusByInvoice(
        event.data.object as Stripe.Invoice,
        "payment_failed"
      );
    }

    if (event.type === "customer.subscription.deleted") {
      await updatePaymentStatusBySubscription(
        event.data.object as Stripe.Subscription,
        "cancelled"
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("STRIPE_WEBHOOK_HANDLER_ERROR", error);

    return NextResponse.json(
      {
        error: "Webhook handler failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
