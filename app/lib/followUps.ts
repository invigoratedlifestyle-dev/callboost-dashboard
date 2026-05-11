import { hasUsableFollowUpContact } from "./contactMethods";
import {
  getUsableAustralianMobile,
  getUsableEmail,
} from "./contactMethods";
import {
  CALLBOOST_MONTHLY_RECURRING_LABEL,
  CALLBOOST_SETUP_FEE_LABEL,
} from "./pricing";

export type FollowUpStage = 1 | 2 | 3;
export type FollowUpChannel = "sms" | "email";

export type FollowUpLead = {
  id?: string | number | null;
  slug?: string | null;
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

export function buildFollowUpBody(
  stage: FollowUpStage,
  name: string,
  args: {
    businessName?: string | null;
    channel?: FollowUpChannel;
    previewUrl?: string | null;
  } = {}
) {
  const firstName = getLeadFirstName(name);
  const businessName = (args.businessName || "").trim();
  const stageTwoName = businessName || name.trim() || "there";
  const previewUrl = (args.previewUrl || "").trim();

  if (stage === 1) {
    if (previewUrl && args.channel === "sms") {
      return `Hey ${firstName}, just checking you saw the website preview I sent through:
${previewUrl}

Happy to make a couple of quick changes if needed 👍

Cheers,
Jamie
CallBoost Tasmania`;
    }

    if (previewUrl) {
      return `Hey ${firstName},

Just checking you saw the website preview I sent through:

${previewUrl}

Happy to make a couple of quick changes to suit how you want it 👍

Cheers,
Jamie
CallBoost Tasmania`;
    }

    return `Hey ${firstName},

Just checking you saw the website preview I sent through.

Happy to make a couple of quick changes to suit how you want it 👍

Cheers,
Jamie
CallBoost Tasmania`;
  }

  if (stage === 2) {
    return `Hey ${stageTwoName},

Just checking in regarding the website preview I put together for you.

A lot of local customers now search online before calling, so even a simple professional website can make a big difference in trust and enquiries.

Your preview is still live at the moment:

${previewUrl}

I’ll likely remove inactive previews soon as I continue building sites for other local businesses.

If you'd like me to keep it active or make any changes, just reply here and I can sort it out for you.

The full setup is ${CALLBOOST_SETUP_FEE_LABEL} with ongoing managed hosting & support at ${CALLBOOST_MONTHLY_RECURRING_LABEL}.

Happy to make adjustments if there's anything you'd like changed.

Cheers,

Jamie
CallBoost Tasmania`;
  }

  return `Last one from me — I'll leave this for now, but if you want the website preview switched on later just reply here 👍`;
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

  if (lead.status !== "contacted" || !hasContactMethod(lead)) {
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
    stageBaseline = followUpSentAt[1] || 0;
  } else if (!followUpSentAt[3]) {
    nextStage = 3;
    stageBaseline = followUpSentAt[2] || 0;
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
