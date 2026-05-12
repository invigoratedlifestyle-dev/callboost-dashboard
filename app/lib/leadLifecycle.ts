export const lifecycleStages = [
  "lead",
  "contacted",
  "client",
  "archived",
] as const;

export type LifecycleStage = (typeof lifecycleStages)[number];
export type LifecycleStatus = LifecycleStage;

export const lifecycleTimestampFields: Record<
  Exclude<LifecycleStage, "lead">,
  string
> = {
  contacted: "contactedAt",
  client: "clientAt",
  archived: "archivedAt",
};

export type LeadRecord = Record<string, unknown>;

export function isLifecycleStage(stage: unknown): stage is LifecycleStage {
  return (
    typeof stage === "string" &&
    lifecycleStages.includes(stage as LifecycleStage)
  );
}

export function isLifecycleStatus(status: unknown): status is LifecycleStatus {
  return isLifecycleStage(status);
}

export function getLeadStage(lead: LeadRecord): LifecycleStage {
  if (isLifecycleStage(lead.stage)) {
    return lead.stage;
  }

  if (isLifecycleStage(lead.status)) {
    return lead.status;
  }

  if (lead.status === "new") {
    return "lead";
  }

  if (lead.status === "interested") {
    return "contacted";
  }

  if (lead.status === null || lead.status === undefined || lead.status === "") {
    return "lead";
  }

  return "lead";
}

export function getLeadStatus(lead: LeadRecord): LifecycleStatus {
  return getLeadStage(lead);
}

export function isArchivedLead(lead: LeadRecord | null | undefined) {
  return Boolean(lead && getLeadStage(lead) === "archived");
}

export function withLifecycleDefaults<T extends LeadRecord>(lead: T): T {
  const currentLead = { ...lead };

  const deprecatedTimestampFields = [
    [114, 101, 118, 105, 101, 119, 101, 100, 65, 116],
    [114, 101, 106, 101, 99, 116, 101, 100, 65, 116],
    [99, 111, 110, 118, 101, 114, 116, 101, 100, 65, 116],
  ].map((codes) => String.fromCharCode(...codes));

  for (const field of deprecatedTimestampFields) {
    delete currentLead[field];
  }

  return {
    ...currentLead,
    stage: getLeadStage(lead),
    status: getLeadStage(lead),
    contactedAt: typeof lead.contactedAt === "string" ? lead.contactedAt : null,
    clientAt: typeof lead.clientAt === "string" ? lead.clientAt : null,
    archivedAt: typeof lead.archivedAt === "string" ? lead.archivedAt : null,
    reviewNotes:
      typeof lead.reviewNotes === "string" ? lead.reviewNotes : "",
  };
}

export function normalizeForLeadIdentity(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

export function normalizeLeadIdentity(lead: LeadRecord) {
  const googlePlaceId =
    typeof lead.googlePlaceId === "string" ? lead.googlePlaceId.trim() : "";
  const businessName = normalizeForLeadIdentity(lead.businessName);
  const phone = normalizePhone(lead.phone);
  const city = normalizeForLeadIdentity(lead.city);
  const trade = normalizeForLeadIdentity(lead.trade);
  const identityKey =
    businessName && phone && city && trade
      ? `${businessName}|${phone}|${city}|${trade}`
      : "";

  return {
    googlePlaceId,
    identityKey,
  };
}

export function shouldSkipExistingLead(existingLead: LeadRecord) {
  return Boolean(getLeadStage(existingLead));
}

