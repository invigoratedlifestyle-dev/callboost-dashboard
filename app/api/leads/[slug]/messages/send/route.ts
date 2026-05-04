import { NextResponse } from "next/server";
import { Resend } from "resend";
import Twilio from "twilio";
import { insertLeadMessage } from "../../../../../lib/supabase/leadMessages";
import {
  getLeadRowBySlug,
  rowToLead,
} from "../../../../../lib/supabase/leads";
import { getSupabaseAdmin } from "../../../../../lib/supabase/server";

type Channel = "sms" | "email";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isChannel(value: unknown): value is Channel {
  return value === "sms" || value === "email";
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

async function sendSms(args: { to: string; body: string }) {
  const twilio = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!twilio || !from) {
    throw new Error("Missing Twilio environment variables");
  }

  const result = await twilio.messages.create({
    body: args.body,
    from,
    to: args.to,
  });

  return {
    from,
    providerMessageId: result.sid || "",
  };
}

async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
}) {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resend || !from) {
    throw new Error("Missing Resend environment variables");
  }

  const { data, error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    text: args.body,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    from,
    providerMessageId: data?.id || "",
  };
}

async function autoMarkLeadContacted(leadId: string | number) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("leads")
    .update({ status: "contacted" })
    .eq("id", leadId)
    .eq("status", "lead");

  if (error) {
    console.warn("LEAD_AUTO_CONTACTED_UPDATE_FAILED", error);
  }

  return !error;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const channel = body.channel;
    const to = getString(body.to);
    const subject = getString(body.subject);
    const messageBody = getString(body.body);

    if (!isChannel(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!to) {
      return NextResponse.json(
        {
          error:
            channel === "sms"
              ? "SMS requires a phone number"
              : "Email requires an email address",
        },
        { status: 400 }
      );
    }

    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: "Email requires a valid email address" },
        { status: 400 }
      );
    }

    if (!messageBody) {
      return NextResponse.json(
        { error: "Message body is required" },
        { status: 400 }
      );
    }

    if (channel === "email" && !subject) {
      return NextResponse.json(
        { error: "Email subject is required" },
        { status: 400 }
      );
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = rowToLead(leadRow);
    let fromAddress = "";
    let providerMessageId = "";
    const provider = channel === "sms" ? "twilio" : "resend";
    let status: "sent" | "failed" = "sent";
    let errorMessage = "";

    try {
      if (channel === "sms") {
        const result = await sendSms({ to, body: messageBody });
        fromAddress = result.from;
        providerMessageId = result.providerMessageId;
      } else {
        const result = await sendEmail({
          to,
          subject,
          body: messageBody,
        });
        fromAddress = result.from;
        providerMessageId = result.providerMessageId;
      }
    } catch (sendError) {
      status = "failed";
      errorMessage =
        sendError instanceof Error ? sendError.message : "Unknown send error";
      console.error("Lead message send failed:", sendError);
    }

    const savedMessage = await insertLeadMessage({
      leadId: leadRow.id || null,
      slug,
      channel,
      toAddress: to,
      fromAddress,
      subject: channel === "email" ? subject : null,
      body: messageBody,
      status,
      provider,
      providerMessageId,
      error: errorMessage,
    });

    let updatedLead = lead;

    if (status === "sent" && lead.status === "lead" && leadRow.id) {
      const statusUpdated = await autoMarkLeadContacted(leadRow.id);

      if (statusUpdated) {
        updatedLead = {
          ...lead,
          status: "contacted",
          contactedAt:
            typeof lead.contactedAt === "string" && lead.contactedAt
              ? lead.contactedAt
              : new Date().toISOString(),
        };
      }
    }

    return NextResponse.json(
      {
        success: status === "sent",
        message: savedMessage,
        lead: updatedLead,
        error: errorMessage || undefined,
      },
      { status: status === "sent" ? 200 : 502 }
    );
  } catch (error) {
    console.error("Failed to send lead message:", error);

    return NextResponse.json(
      {
        error: "Failed to send lead message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
