import { NextResponse } from "next/server";
import { Resend } from "resend";
import Twilio from "twilio";
import {
  insertCallbackRequest,
  markCallbackForwarded,
} from "../../lib/supabase/callbacks";
import { getLeadRowBySlug, rowToLead } from "../../lib/supabase/leads";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isForwardingEnabled(value: unknown) {
  return value === true || value === "true";
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  return apiKey ? new Resend(apiKey) : null;
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  return accountSid && authToken ? Twilio(accountSid, authToken) : null;
}

async function forwardToEmail(args: {
  to: string;
  businessName: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string;
}) {
  const resend = getResendClient();

  if (!resend) {
    console.log("Callback email forwarding skipped: missing RESEND_API_KEY");
    return false;
  }

  const from =
    process.env.CALLBOOST_CALLBACK_FROM_EMAIL || "callbacks@callboost.co";
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject: `🔥 New Lead - ${args.businessName} (Call Now)`,
    text: [
      "New callback request",
      "",
      `Business: ${args.businessName}`,
      "",
      "Customer Details:",
      `Name: ${args.visitorName}`,
      `Phone: ${args.visitorPhone}`,
      `Click to call: tel:${args.visitorPhone}`,
      "",
      "Request:",
      args.visitorMessage || "No message provided",
      "",
      "Call this customer as soon as possible.",
      "",
      "⚡ This customer is expecting a call back.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(`Email forwarding failed: ${error.message}`);
  }

  return true;
}

async function forwardToPhone(args: {
  to: string;
  businessName: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string;
}) {
  const twilio = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!twilio || !from) {
    console.log(
      "Callback phone forwarding skipped: missing Twilio environment variables"
    );
    return false;
  }

  await twilio.messages.create({
    body: [
      `🔥 New Lead - ${args.businessName}`,
      "",
      `Name: ${args.visitorName}`,
      `Phone: ${args.visitorPhone}`,
      "",
      args.visitorMessage || "No message provided",
      "",
      "Call them ASAP.",
    ].join("\n"),
    from,
    to: args.to,
  });

  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = getString(body.slug);
    const name = getString(body.name);
    const phone = getString(body.phone);
    const message = getString(body.message);

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and phone are required" },
        { status: 400 }
      );
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = rowToLead(leadRow);
    const businessName =
      getString(lead.name) || getString(lead.businessName) || slug;
    const callback = await insertCallbackRequest({
      leadId: leadRow.id || null,
      sourceSlug: slug,
      visitorName: name,
      visitorPhone: phone,
      visitorMessage: message,
    });

    const forwardingEnabled = isForwardingEnabled(
      lead.callbackForwardingEnabled
    );
    const forwardToEmailAddress = getString(lead.callbackForwardToEmail);
    const forwardToPhoneNumber = getString(lead.callbackForwardToPhone);

    if (forwardingEnabled && callback.id) {
      try {
        if (forwardToEmailAddress) {
          const forwarded = await forwardToEmail({
            to: forwardToEmailAddress,
            businessName,
            visitorName: name,
            visitorPhone: phone,
            visitorMessage: message,
          });

          if (forwarded) {
            await markCallbackForwarded(callback.id, forwardToEmailAddress);
          }
        } else if (forwardToPhoneNumber) {
          const forwarded = await forwardToPhone({
            to: forwardToPhoneNumber,
            businessName,
            visitorName: name,
            visitorPhone: phone,
            visitorMessage: message,
          });

          if (forwarded) {
            await markCallbackForwarded(callback.id, forwardToPhoneNumber);
          }
        }
      } catch (forwardError) {
        console.error("Callback forwarding failed:", forwardError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Callback request failed:", error);

    return NextResponse.json(
      {
        error: "Failed to save callback request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
