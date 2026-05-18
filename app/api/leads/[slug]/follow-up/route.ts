import { NextResponse } from "next/server";
import { getLeadStage } from "../../../../lib/leadLifecycle";
import { getLeadEngagementSummary } from "../../../../lib/engagementPriority";
import {
  buildFollowUpBody,
  getFollowUpDestination,
  getLatestOutboundMessageChannel,
} from "../../../../lib/followUps";
import { appendEmailUnsubscribeFooter } from "../../../../lib/emailUnsubscribe";
import { sendEmail, sendSms } from "../../../../lib/outboundMessages";
import {
  buildOpenTrackingPixelUrl,
  createPublicTrackingToken,
  createTrackingToken,
  getAppBaseUrl,
  textToTrackedHtml,
} from "../../../../lib/messageTracking";
import {
  buildCleanPreviewUrl,
  getPreviewUrl,
  replacePreviewUrlsWithCustomerUrl,
} from "../../../../lib/previewUrls";
import { prepareOutboundSmsText } from "../../../../lib/smsOptOut";
import {
  insertLeadMessage,
  listLeadMessages,
} from "../../../../lib/supabase/leadMessages";
import {
  getLeadRowBySlug,
  rowToLead,
  updateLeadStatus,
} from "../../../../lib/supabase/leads";
import type { StoredWebsiteOpportunityResult } from "../../../../lib/websiteOpportunity";

type FollowUpStage = 1 | 2 | 3;

function isFollowUpStage(value: unknown): value is FollowUpStage {
  return value === 1 || value === 2 || value === 3;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

    const leadStage = getLeadStage(lead);

    if (leadStage !== "contacted" && leadStage !== "lead") {
      return NextResponse.json(
        { error: "Follow-ups are only available for active leads" },
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
    const websiteEvaluation = getRecord(lead.websiteEvaluation);
    const websiteOpportunity = getRecord(lead.websiteOpportunity);
    const websiteOpportunityV2 = getRecord(lead.website_opportunity_v2);
    const engagement = await getLeadEngagementSummary(lead);
    const destination = getFollowUpDestination({
      latestOutboundChannel: getLatestOutboundMessageChannel(messages),
      phone: lead.phone,
      email: lead.email,
    });

    if (!destination) {
      return NextResponse.json(
        {
          error:
            "Lead needs a valid Australian mobile number or email before follow-up",
        },
        { status: 400 }
      );
    }

    const { channel, to } = destination;
    const subject = channel === "email" ? "Quick follow-up from CallBoost" : "";
    const baseUrl = getAppBaseUrl(req.url);
    const trackingToken = createTrackingToken();
    const publicTrackingToken = createPublicTrackingToken();
    const previewUrl = buildCleanPreviewUrl(slug, baseUrl);
    const sitePreviewUrl = getPreviewUrl(lead, baseUrl);
    const followUpBody = buildFollowUpBody(stage, leadName, {
      businessName: getString(lead.businessName),
      channel,
      previewUrl,
      websiteEvaluation: websiteEvaluation
        ? {
            issues: Array.isArray(websiteEvaluation.issues)
              ? websiteEvaluation.issues.filter(
                  (issue): issue is string => typeof issue === "string"
                )
              : [],
            summary: getString(websiteEvaluation.summary),
          }
        : null,
      websiteOpportunity: websiteOpportunity
        ? {
            issue: getString(websiteOpportunity.issue),
            issues: Array.isArray(websiteOpportunity.issues)
              ? websiteOpportunity.issues.filter(
                  (issue): issue is string => typeof issue === "string"
                )
              : [],
            summary: getString(websiteOpportunity.summary),
          }
        : null,
      websiteOpportunityV2:
        websiteOpportunityV2 as StoredWebsiteOpportunityResult | null,
      engagement,
    });
    const cleanFollowUpBody = replacePreviewUrlsWithCustomerUrl({
      body: followUpBody,
      customerPreviewUrl: previewUrl,
      previewUrls: [sitePreviewUrl],
    });
    const messageBody =
      channel === "sms"
        ? prepareOutboundSmsText(cleanFollowUpBody)
        : appendEmailUnsubscribeFooter(cleanFollowUpBody);
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
          html: textToTrackedHtml(
            messageBody,
            buildOpenTrackingPixelUrl(baseUrl, trackingToken)
          ),
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
      trackingToken,
      publicTrackingToken,
      previewUrl,
    });

    if (status === "sent") {
      await updateLeadStatus(slug, "waiting_client");
    }

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
