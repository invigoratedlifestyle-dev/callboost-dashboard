import { NextResponse } from "next/server";
import { sendEmail, sendSms } from "../../../../lib/outboundMessages";
import { appendOptOut } from "../../../../lib/smsOptOut";
import {
  insertLeadMessage,
  listLeadMessages,
} from "../../../../lib/supabase/leadMessages";
import {
  getLeadRowBySlug,
  rowToLead,
} from "../../../../lib/supabase/leads";

type FollowUpStage = 1 | 2 | 3;

function isFollowUpStage(value: unknown): value is FollowUpStage {
  return value === 1 || value === 2 || value === 3;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLeadFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function buildFollowUpBody(stage: FollowUpStage, name: string) {
  const firstName = getLeadFirstName(name);

  if (stage === 1) {
    return `Hey ${firstName}, just checking you saw the website preview I sent through.

Happy to make a few quick changes if needed 👍`;
  }

  if (stage === 2) {
    return `Hey ${firstName}, no worries if now isn’t the right time — just wanted to check if you wanted me to keep the preview live for you?`;
  }

  return `Last one from me — I’ll leave this for now, but if you want the website preview switched on later just reply here 👍`;
}

function getLatestMessageTime(
  messages: Awaited<ReturnType<typeof listLeadMessages>>,
  direction: "inbound" | "outbound"
) {
  return messages.reduce((latest, message) => {
    if (message.direction !== direction || !message.createdAt) return latest;

    const timestamp = new Date(message.createdAt).getTime();

    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const stage = Number(body.stage);

    if (!isFollowUpStage(stage)) {
      return NextResponse.json(
        { error: "Invalid follow-up stage" },
        { status: 400 }
      );
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = rowToLead(leadRow);

    if (lead.status !== "contacted") {
      return NextResponse.json(
        { error: "Follow-ups are only available for contacted leads" },
        { status: 400 }
      );
    }

    const messages = await listLeadMessages({
      leadId: leadRow.id || null,
      slug,
    });
    const latestInbound = getLatestMessageTime(messages, "inbound");
    const latestOutbound = getLatestMessageTime(messages, "outbound");

    if (latestInbound > latestOutbound) {
      return NextResponse.json(
        { error: "Lead has replied since the last outbound message" },
        { status: 409 }
      );
    }

    const leadName = getString(lead.name) || getString(lead.businessName);
    const leadPhone = getString(lead.phone);
    const leadEmail = getString(lead.email);
    const channel = leadPhone ? "sms" : "email";
    const to = channel === "sms" ? leadPhone : leadEmail;
    const subject = channel === "email" ? "Quick follow-up from CallBoost" : "";
    const messageBody =
      channel === "sms"
        ? appendOptOut(buildFollowUpBody(stage, leadName))
        : buildFollowUpBody(stage, leadName);

    if (!to) {
      return NextResponse.json(
        { error: "Lead needs a phone number or email before follow-up" },
        { status: 400 }
      );
    }

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
      console.error("FOLLOW_UP_SEND_FAILED", sendError);
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
      metadata: {
        reason: "manual_follow_up",
        follow_up_stage: stage,
      },
    });

    return NextResponse.json(
      {
        success: status === "sent",
        channel,
        message: savedMessage,
        error: errorMessage || undefined,
      },
      { status: status === "sent" ? 200 : 502 }
    );
  } catch (error) {
    console.error("FOLLOW_UP_SEND_ROUTE_FAILED", error);

    return NextResponse.json(
      {
        error: "Failed to send follow-up",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
