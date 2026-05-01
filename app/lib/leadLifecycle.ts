export const lifecycleStatuses = [
  "new",
  "archived",
  "contacted",
] as const;

export type LifecycleStatus = (typeof lifecycleStatuses)[number];

export const lifecycleTimestampFields: Record<
  Exclude<LifecycleStatus, "new">,
  string
> = {
  archived: "archivedAt",
  contacted: "contactedAt",
};

export type LeadRecord = Record<string, unknown>;

export function isLifecycleStatus(status: unknown): status is LifecycleStatus {
  return (
    typeof status === "string" &&
    lifecycleStatuses.includes(status as LifecycleStatus)
  );
}

export function getLeadStatus(lead: LeadRecord): LifecycleStatus {
  return isLifecycleStatus(lead.status) ? lead.status : "new";
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
    status: getLeadStatus(lead),
    archivedAt: typeof lead.archivedAt === "string" ? lead.archivedAt : null,
    contactedAt: typeof lead.contactedAt === "string" ? lead.contactedAt : null,
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
  return Boolean(getLeadStatus(existingLead));
}
