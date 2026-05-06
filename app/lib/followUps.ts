export type FollowUpStage = 1 | 2 | 3;

export type FollowUpLead = {
  id?: string | number | null;
  slug?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  contactedAt?: string | null;
};

export type FollowUpMessage = {
  direction?: string | null;
  status?: string | null;
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

function getTime(value?: string | null) {
  const time = new Date(value || "").getTime();

  return Number.isFinite(time) ? time : 0;
}

function getIsoTime(time: number) {
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null;
}

function getManualFollowUpStage(
  message: FollowUpMessage
): FollowUpStage | null {
  const metadata = message.metadata || {};

  if (metadata.reason !== "manual_follow_up") return null;

  const stage = Number(metadata.follow_up_stage);

  return stage === 1 || stage === 2 || stage === 3 ? stage : null;
}

function isPlaceholderEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  return (
    normalizedEmail === "contact@example.com" ||
    normalizedEmail === "admin@example.com" ||
    normalizedEmail === "test@example.com" ||
    normalizedEmail.endsWith("@example.com")
  );
}

function hasContactMethod(lead: FollowUpLead) {
  const phone = String(lead.phone || "").trim();
  const email = String(lead.email || "").trim();

  return Boolean(phone || (email && !isPlaceholderEmail(email)));
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

    if (message.direction !== "outbound" || message.status === "failed") {
      continue;
    }

    latestOutbound = Math.max(latestOutbound, createdAt);

    const stage = getManualFollowUpStage(message);

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
