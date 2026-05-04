import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sendEmail, sendSms } from "../../../lib/outboundMessages";
import { getStripe } from "../../../lib/stripe";
import {
  insertLeadMessage,
  paymentFailedRecoveryMessageExists,
} from "../../../lib/supabase/leadMessages";
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

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getClientName(lead: PaymentRecoveryLeadRow) {
  return getString(lead.name) || getString(lead.data?.businessName) || "there";
}

type PaymentRecoveryLeadRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  data?: Record<string, unknown> | null;
};

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

async function findPaymentRecoveryLead(invoice: Stripe.Invoice) {
  const supabase = getSupabaseAdmin();
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const customerId = getStripeId(invoice.customer);

  async function queryBy(field: string, value: string) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, slug, name, phone, email, status, stripe_customer_id, stripe_subscription_id, data"
      )
      .eq(field, value)
      .eq("status", "client")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data as PaymentRecoveryLeadRow | null;
  }

  if (subscriptionId) {
    const lead = await queryBy("stripe_subscription_id", subscriptionId);

    if (lead) return lead;
  }

  if (customerId) {
    return queryBy("stripe_customer_id", customerId);
  }

  return null;
}

async function saveRecoveryMessage(args: {
  lead: PaymentRecoveryLeadRow;
  channel: "sms" | "email";
  to: string;
  fromAddress: string;
  subject?: string | null;
  body: string;
  status: "sent" | "failed";
  provider: string;
  providerMessageId?: string;
  error?: string;
  stripeEventId: string;
  stripeInvoiceId: string;
}) {
  await insertLeadMessage({
    leadId: args.lead.id || null,
    slug: getString(args.lead.slug),
    channel: args.channel,
    direction: "outbound",
    toAddress: args.to,
    fromAddress: args.fromAddress,
    subject: args.subject || null,
    body: args.body,
    status: args.status,
    provider: args.provider,
    providerMessageId: args.providerMessageId || "",
    error: args.error || "",
    metadata: {
      reason: "payment_failed_recovery",
      stripe_event_id: args.stripeEventId,
      stripe_invoice_id: args.stripeInvoiceId,
    },
  });
}

async function sendPaymentFailedRecovery(args: {
  invoice: Stripe.Invoice;
  stripeEventId: string;
}) {
  const stripeInvoiceId = args.invoice.id || "";

  if (!stripeInvoiceId) return;

  try {
    const lead = await findPaymentRecoveryLead(args.invoice);

    if (!lead) {
      console.log("PAYMENT_FAILED_RECOVERY_LEAD_NOT_FOUND", {
        stripe_event_id: args.stripeEventId,
        stripe_invoice_id: stripeInvoiceId,
      });
      return;
    }

    const alreadySent = await paymentFailedRecoveryMessageExists({
      leadId: lead.id || null,
      slug: getString(lead.slug),
      stripeInvoiceId,
    });

    if (alreadySent) {
      console.log("PAYMENT_FAILED_RECOVERY_ALREADY_SENT", {
        lead_id: lead.id || null,
        slug: lead.slug || "",
        stripe_event_id: args.stripeEventId,
        stripe_invoice_id: stripeInvoiceId,
      });
      return;
    }

    const name = getClientName(lead);
    const smsBody = `Hi ${name}, just a quick heads up — your CallBoost website subscription payment didn’t go through. Please update your payment method so your website stays live.`;
    const emailSubject = "Action needed: CallBoost payment failed";
    const emailBody = [
      `Hi ${name},`,
      "",
      "Just a quick heads up — your CallBoost website subscription payment didn’t go through.",
      "",
      "Please update your payment method so your website stays live.",
      "",
      "Thanks,",
      "CallBoost",
    ].join("\n");
    const phone = getString(lead.phone);
    const email = getString(lead.email);

    if (phone) {
      try {
        const result = await sendSms({ to: phone, body: smsBody });

        await saveRecoveryMessage({
          lead,
          channel: "sms",
          to: phone,
          fromAddress: result.from,
          body: smsBody,
          status: "sent",
          provider: "twilio",
          providerMessageId: result.providerMessageId,
          stripeEventId: args.stripeEventId,
          stripeInvoiceId,
        });

        console.log("PAYMENT_FAILED_RECOVERY_SMS_SENT", {
          lead_id: lead.id || null,
          slug: lead.slug || "",
          stripe_event_id: args.stripeEventId,
          stripe_invoice_id: stripeInvoiceId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown SMS send error";

        console.error("PAYMENT_FAILED_RECOVERY_SEND_FAILED", {
          channel: "sms",
          lead_id: lead.id || null,
          slug: lead.slug || "",
          stripe_event_id: args.stripeEventId,
          stripe_invoice_id: stripeInvoiceId,
          error: message,
        });

        await saveRecoveryMessage({
          lead,
          channel: "sms",
          to: phone,
          fromAddress: "",
          body: smsBody,
          status: "failed",
          provider: "twilio",
          error: message,
          stripeEventId: args.stripeEventId,
          stripeInvoiceId,
        });
      }
    }

    if (email) {
      try {
        const result = await sendEmail({
          to: email,
          subject: emailSubject,
          body: emailBody,
        });

        await saveRecoveryMessage({
          lead,
          channel: "email",
          to: email,
          fromAddress: result.from,
          subject: emailSubject,
          body: emailBody,
          status: "sent",
          provider: "resend",
          providerMessageId: result.providerMessageId,
          stripeEventId: args.stripeEventId,
          stripeInvoiceId,
        });

        console.log("PAYMENT_FAILED_RECOVERY_EMAIL_SENT", {
          lead_id: lead.id || null,
          slug: lead.slug || "",
          stripe_event_id: args.stripeEventId,
          stripe_invoice_id: stripeInvoiceId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown email send error";

        console.error("PAYMENT_FAILED_RECOVERY_SEND_FAILED", {
          channel: "email",
          lead_id: lead.id || null,
          slug: lead.slug || "",
          stripe_event_id: args.stripeEventId,
          stripe_invoice_id: stripeInvoiceId,
          error: message,
        });

        await saveRecoveryMessage({
          lead,
          channel: "email",
          to: email,
          fromAddress: "",
          subject: emailSubject,
          body: emailBody,
          status: "failed",
          provider: "resend",
          error: message,
          stripeEventId: args.stripeEventId,
          stripeInvoiceId,
        });
      }
    }
  } catch (error) {
    console.error("PAYMENT_FAILED_RECOVERY_SEND_FAILED", {
      stripe_event_id: args.stripeEventId,
      stripe_invoice_id: stripeInvoiceId,
      error: error instanceof Error ? error.message : "Unknown recovery error",
    });
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
      const invoice = event.data.object as Stripe.Invoice;

      await updatePaymentStatusByInvoice(invoice, "payment_failed");
      await sendPaymentFailedRecovery({
        invoice,
        stripeEventId: event.id,
      });
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
