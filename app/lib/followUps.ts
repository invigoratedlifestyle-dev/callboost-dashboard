import { hasUsableFollowUpContact } from "./contactMethods";
import {
  getUsableAustralianMobile,
  getUsableEmail,
} from "./contactMethods";
import {
  CALLBOOST_MONTHLY_RECURRING_LABEL,
  CALLBOOST_SETUP_FEE_LABEL,
} from "./pricing";
import { buildOutreachOpportunityContext } from "./websiteOpportunity";
import type { StoredWebsiteOpportunityResult } from "./websiteOpportunity";

export type FollowUpStage = 1 | 2 | 3;
export type FollowUpChannel = "sms" | "email";

export type FollowUpLead = {
  id?: string | number | null;
  slug?: string | null;
  stage?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  contactedAt?: string | null;
};

export type FollowUpMessage = {
  channel?: string | null;
  direction?: string | null;
  status?: string | null;
  subject?: string | null;
  body?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type FollowUpWebsiteOpportunity = {
  issue?: string | null;
  issues?: string[] | null;
  summary?: string | null;
};

type FollowUpWebsiteEvaluation = {
  issues?: string[] | null;
  summary?: string | null;
  positives?: string[] | null;
  score?: number | null;
  recommendation?: string | null;
};

export type FollowUpDueStatus = {
  nextStage: FollowUpStage | null;
  isDue: boolean;
  dueAt: string | null;
  dueSince: string | null;
  lastOutboundAt: string | null;
  latestInboundAt: string | null;
  latestOutboundAt: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const followUpDelays: Record<FollowUpStage, number> = {
  1: DAY_MS,
  2: 3 * DAY_MS,
  3: 7 * DAY_MS,
};

export function getLeadFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function cleanIssue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholderWebsiteIssue(issue: string) {
  const normalizedIssue = issue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(no|missing)\s+(current\s+)?(website|site)\s+(found|detected)?$/.test(
    normalizedIssue
  ) || /^(website|site)\s+(not\s+found|missing)$/.test(normalizedIssue);
}

function humanizeWebsiteOpportunityIssue(issue: string) {
  const lowerIssue = issue.toLowerCase();

  if (lowerIssue.includes("old technology")) {
    return "the site appears to be using older technology";
  }

  if (
    lowerIssue.includes("phone") &&
    (lowerIssue.includes("click") ||
      lowerIssue.includes("mobile") ||
      lowerIssue.includes("prominent"))
  ) {
    return "the phone number could be more prominent as a clickable mobile call-to-action";
  }

  if (
    (lowerIssue.includes("length") || lowerIssue.includes("long")) &&
    (lowerIssue.includes("clutter") || lowerIssue.includes("repetitive"))
  ) {
    return "some homepage content feels long or repetitive, which may reduce engagement";
  }

  if (
    (lowerIssue.includes("form") ||
      lowerIssue.includes("quote") ||
      lowerIssue.includes("booking")) &&
    lowerIssue.includes("cta")
  ) {
    return "the quote or booking call-to-action could be clearer";
  }

  if (lowerIssue.includes("mobile")) {
    return "the mobile experience could be simpler for customers who want to call quickly";
  }

  if (lowerIssue.includes("local") || lowerIssue.includes("positioning")) {
    return "the site could make the local service area and offer clearer";
  }

  if (lowerIssue.includes("trust") || lowerIssue.includes("review")) {
    return "the page could do more to build trust before someone gets in touch";
  }

  if (lowerIssue.includes("thin") || lowerIssue.includes("content")) {
    return "the content could give customers more confidence before they enquire";
  }

  if (
    lowerIssue.includes("broken") ||
    lowerIssue.includes("unreachable") ||
    lowerIssue.includes("load")
  ) {
    return "some customers may have trouble loading or using the current site";
  }

  return issue
    .replace(/\bCTA\b/g, "call-to-action")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .replace(/^website\s+/i, "the website ")
    .replace(/^site\s+/i, "the site ");
}

function getWebsiteOpportunityIssues(args: {
  websiteOpportunityV2?: StoredWebsiteOpportunityResult | null;
  websiteOpportunity?: FollowUpWebsiteOpportunity | null;
  websiteEvaluation?: FollowUpWebsiteEvaluation | null;
}) {
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: args.websiteOpportunityV2,
    websiteOpportunity: args.websiteOpportunity,
    websiteEvaluation: args.websiteEvaluation,
  });
  const rawIssues = [
    ...(args.websiteOpportunityV2 ? context.issues : context.signalLabels),
    ...(Array.isArray(args.websiteOpportunity?.issues)
      ? args.websiteOpportunity?.issues || []
      : []),
    cleanIssue(args.websiteOpportunity?.issue),
    ...(Array.isArray(args.websiteEvaluation?.issues)
      ? args.websiteEvaluation?.issues || []
      : []),
  ];
  const seen = new Set<string>();

  return rawIssues
    .map(cleanIssue)
    .filter(Boolean)
    .filter((issue) => !isPlaceholderWebsiteIssue(issue))
    .map(humanizeWebsiteOpportunityIssue)
    .filter((issue) => {
      const key = issue.toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    })
    .slice(0, 4);
}

function buildWebsiteOpportunitySection(args: {
  websiteOpportunityV2?: StoredWebsiteOpportunityResult | null;
  websiteOpportunity?: FollowUpWebsiteOpportunity | null;
  websiteEvaluation?: FollowUpWebsiteEvaluation | null;
}) {
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: args.websiteOpportunityV2,
    websiteOpportunity: args.websiteOpportunity,
    websiteEvaluation: args.websiteEvaluation,
  });
  const issues = getWebsiteOpportunityIssues(args);

  if (!issues.length && context.level === "none") return "";

  const intro = context.summary || context.reason
    ? `The current website opportunity rating is ${context.level}: ${
        context.summary || context.reason
      }`
    : "I had another look through your current website and noticed a few areas where a refresh could help improve enquiries and mobile usability.";

  return [
    intro,
    ...(issues.length ? ["A few supporting points:", ...issues.map((issue) => `- ${issue}`)] : []),
  ].join("\n");
}

function getSmsMonthlyPriceLabel() {
  return CALLBOOST_MONTHLY_RECURRING_LABEL.replace("/month", "/mo");
}

export function buildFollowUpBody(
  stage: FollowUpStage,
  name: string,
  args: {
    businessName?: string | null;
    channel?: FollowUpChannel;
    previewUrl?: string | null;
    websiteEvaluation?: FollowUpWebsiteEvaluation | null;
    websiteOpportunity?: FollowUpWebsiteOpportunity | null;
    websiteOpportunityV2?: StoredWebsiteOpportunityResult | null;
    engagement?: {
      engagement_state?: "hot" | "warm" | "none";
      total_open_count?: number;
      total_click_count?: number;
      last_engaged_at?: string | null;
    } | null;
  } = {}
) {
  const firstName = getLeadFirstName(name);
  const businessName = (args.businessName || "").trim();
  const stageTwoName = businessName || name.trim() || "there";
  const previewUrl = (args.previewUrl || "").trim();
  const websiteOpportunitySection = buildWebsiteOpportunitySection(args);
  const smsName = name.trim() || stageTwoName;
  const engagementState = args.engagement?.engagement_state || "none";

  if (stage === 1) {
    if (engagementState === "hot") {
      if (args.channel === "sms") {
        return `Hi ${smsName},

Just wanted to send the website example through again in case you missed it:
${previewUrl}

Happy to make a few quick changes if you'd like anything adjusted.

Jamie
CallBoost Tasmania`;
      }

      return `Hey ${firstName},

Just wanted to send the website example through again in case you missed it:

${previewUrl}

Happy to make a few quick changes if you'd like anything adjusted.

Cheers,
Jamie
CallBoost Tasmania`;
    }

    if (previewUrl && args.channel === "sms") {
      return `Hi ${smsName},

Just wanted to send the website example through again in case you missed it:
${previewUrl}

Happy to make a few quick changes if you'd like anything adjusted.

Jamie
CallBoost Tasmania`;
    }

    if (previewUrl) {
      return `Hey ${firstName},

Just wanted to send the website example through again in case you missed it:

${previewUrl}

Happy to make a few quick changes if you'd like anything adjusted.

Cheers,
Jamie
CallBoost Tasmania`;
    }

    return `Hey ${firstName},

Just wanted to send the website example through again in case you missed it.

Happy to make a few quick changes if you'd like anything adjusted.

Cheers,
Jamie
CallBoost Tasmania`;
  }

  if (stage === 2) {
    if (engagementState === "warm") {
      if (args.channel === "sms") {
        return `Hi ${smsName}, just floating this back to the top in case it was useful:
${previewUrl}

Reply if you'd like any quick changes or want me to keep it live.

- Jamie, CallBoost Tasmania`;
      }

      return `Hey ${stageTwoName},

Just floating this back to the top in case it was useful.

Your preview is still live here:

${previewUrl}

Happy to make a couple of quick changes if you'd like it closer to what you want for the business.

Cheers,

Jamie
CallBoost Tasmania`;
    }

    if (args.channel === "sms") {
      return `Hi ${smsName},

Just following up on the website example I sent through:

${previewUrl}

A refresh like this can make it easier for customers to call, enquire, and find your services on mobile.

Setup is ${CALLBOOST_SETUP_FEE_LABEL} + ${getSmsMonthlyPriceLabel()} managed hosting & support.

Jamie
CallBoost Tasmania`;
    }

    return `Hey ${stageTwoName},

Just checking in regarding the website preview I put together for you.${websiteOpportunitySection ? `\n\n${websiteOpportunitySection}` : ""}

${websiteOpportunitySection ? "" : "A professional website can make a big difference when local customers search online before calling.\n\n"}Your preview is still live here:

${previewUrl}

I'll likely remove inactive previews soon as I continue building sites for other local businesses across Tasmania.

Setup is ${CALLBOOST_SETUP_FEE_LABEL} with ongoing managed hosting & support at ${CALLBOOST_MONTHLY_RECURRING_LABEL}.

If you'd like any changes or want me to keep the preview live, just reply here.

Cheers,

Jamie
CallBoost Tasmania`;
  }

  if (args.channel === "sms") {
    return `Hi ${smsName}, just sending one final follow-up on the website preview:
${previewUrl}

Reply if you'd ever like it updated or reactivated.

- Jamie, CallBoost Tasmania`;
  }

  return `Hey ${stageTwoName},

Just wanted to send one final follow-up regarding the website preview I put together for you.

Your preview is still live here:

${previewUrl}

I completely understand if now isn’t the right time, but I will be removing inactive previews soon as I continue building sites for other local businesses across Tasmania.

If you'd ever like the site reactivated, updated, or finished off properly, just reply here and I’ll be happy to help.

The full setup is ${CALLBOOST_SETUP_FEE_LABEL} with ongoing managed hosting & support at ${CALLBOOST_MONTHLY_RECURRING_LABEL}.

Thanks again for taking the time to have a look.

Cheers,

Jamie
CallBoost Tasmania`;
}

function getTime(value?: string | null) {
  const time = new Date(value || "").getTime();

  return Number.isFinite(time) ? time : 0;
}

function getIsoTime(time: number) {
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
}

function getNormalizedFollowUpStage(value: unknown): FollowUpStage | null {
  const stage = Number(value);

  return stage === 1 || stage === 2 || stage === 3 ? stage : null;
}

function getText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isSentOutboundMessage(message: FollowUpMessage) {
  return (
    message.direction === "outbound" &&
    (!message.status || message.status === "sent")
  );
}

function getMetadataFollowUpStage(
  message: FollowUpMessage
): FollowUpStage | null {
  const metadata = message.metadata || {};
  const stage = getNormalizedFollowUpStage(
    metadata.follow_up_stage || metadata.followUpStage || metadata.stage
  );

  if (!stage) return null;

  const reason = String(metadata.reason || metadata.type || "").trim();

  if (
    reason === "manual_follow_up" ||
    reason === "follow_up" ||
    reason === "manualFollowUp" ||
    metadata.follow_up_stage !== undefined ||
    metadata.followUpStage !== undefined
  ) {
    return stage;
  }

  return null;
}

function getFallbackFollowUpStage(message: FollowUpMessage): FollowUpStage | null {
  const subject = getText(message.subject);
  const body = getText(message.body);
  const looksLikeFollowUpOneBody =
    body.includes("just checking you saw the website preview") ||
    body.includes("happy to make a couple of quick changes");

  if (
    looksLikeFollowUpOneBody &&
    (subject.includes("quick follow-up from callboost") ||
      body.includes("callboost tasmania") ||
      body.includes("reply stop to opt out"))
  ) {
    return 1;
  }

  return null;
}

export function getSentFollowUpStage(
  message: FollowUpMessage
): FollowUpStage | null {
  if (!isSentOutboundMessage(message)) {
    return null;
  }

  return getMetadataFollowUpStage(message) || getFallbackFollowUpStage(message);
}

function hasContactMethod(lead: FollowUpLead) {
  return hasUsableFollowUpContact({
    phone: lead.phone,
    email: lead.email,
  });
}

export function getLatestOutboundMessageChannel(
  messages: FollowUpMessage[]
): FollowUpChannel | null {
  const latestOutbound = messages.reduce<FollowUpMessage | null>(
    (latest, message) => {
      if (
        !isSentOutboundMessage(message) ||
        !message.createdAt
      ) {
        return latest;
      }

      if (!latest) return message;

      const messageTime = getTime(message.createdAt);
      const latestTime = getTime(latest.createdAt);

      return messageTime > latestTime ? message : latest;
    },
    null
  );

  return latestOutbound?.channel === "email" ? "email" : latestOutbound ? "sms" : null;
}

export function getFollowUpDestination(args: {
  latestOutboundChannel?: string | null;
  phone?: unknown;
  email?: unknown;
}): { channel: FollowUpChannel; to: string } | null {
  const mobile = getUsableAustralianMobile(args.phone);
  const email = getUsableEmail(args.email);

  if (args.latestOutboundChannel === "sms" && mobile) {
    return { channel: "sms", to: mobile };
  }

  if (args.latestOutboundChannel === "email" && email) {
    return { channel: "email", to: email };
  }

  if (mobile) {
    return { channel: "sms", to: mobile };
  }

  if (email) {
    return { channel: "email", to: email };
  }

  return null;
}

export function getFollowUpDueStatus(
  lead: FollowUpLead,
  messages: FollowUpMessage[],
  now = Date.now()
): FollowUpDueStatus {
  const emptyStatus: FollowUpDueStatus = {
    nextStage: null,
    isDue: false,
    dueAt: null,
    dueSince: null,
    lastOutboundAt: null,
    latestInboundAt: null,
    latestOutboundAt: null,
  };

  if (lead.stage !== "contacted" || !hasContactMethod(lead)) {
    return emptyStatus;
  }

  let latestInbound = 0;
  let latestOutbound = 0;
  const followUpSentAt: Partial<Record<FollowUpStage, number>> = {};

  for (const message of messages) {
    const createdAt = getTime(message.createdAt);

    if (!createdAt) continue;

    if (message.direction === "inbound") {
      latestInbound = Math.max(latestInbound, createdAt);
      continue;
    }

    if (!isSentOutboundMessage(message)) {
      continue;
    }

    latestOutbound = Math.max(latestOutbound, createdAt);

    const stage = getSentFollowUpStage(message);

    if (stage) {
      followUpSentAt[stage] = Math.max(followUpSentAt[stage] || 0, createdAt);
    }
  }

  const contactedAt = getTime(lead.contactedAt);
  const outboundBaseline = latestOutbound || contactedAt;

  if (!outboundBaseline || latestInbound > outboundBaseline) {
    return {
      ...emptyStatus,
      latestInboundAt: getIsoTime(latestInbound),
      latestOutboundAt: getIsoTime(outboundBaseline),
      lastOutboundAt: getIsoTime(outboundBaseline),
    };
  }

  let nextStage: FollowUpStage | null = null;
  let stageBaseline = outboundBaseline;

  if (!followUpSentAt[1]) {
    nextStage = 1;
  } else if (!followUpSentAt[2]) {
    nextStage = 2;
    // Any successful outbound outreach should reset the current due bucket,
    // even when it was sent manually without follow_up_stage metadata.
    stageBaseline = Math.max(followUpSentAt[1] || 0, latestOutbound);
  } else if (!followUpSentAt[3]) {
    nextStage = 3;
    // Keep stage progression metadata-driven, but debounce due state by the
    // newest outbound outreach across SMS and email.
    stageBaseline = Math.max(followUpSentAt[2] || 0, latestOutbound);
  }

  if (!nextStage || !stageBaseline) {
    return {
      ...emptyStatus,
      latestInboundAt: getIsoTime(latestInbound),
      latestOutboundAt: getIsoTime(outboundBaseline),
      lastOutboundAt: getIsoTime(outboundBaseline),
    };
  }

  const dueAtTime = stageBaseline + followUpDelays[nextStage];
  const isDue = now >= dueAtTime;

  return {
    nextStage,
    isDue,
    dueAt: getIsoTime(dueAtTime),
    dueSince: isDue ? getIsoTime(dueAtTime) : null,
    lastOutboundAt: getIsoTime(stageBaseline),
    latestInboundAt: getIsoTime(latestInbound),
    latestOutboundAt: getIsoTime(outboundBaseline),
  };
}

