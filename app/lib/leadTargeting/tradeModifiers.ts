export const serviceModifiers = [
  "gas_fitting",
  "sheetmetal",
  "roof_plumbing",
  "guttering",
  "flashing",
  "drainage",
  "bathrooms",
  "renovations",
  "maintenance",
  "emergency_plumbing",
  "hot_water",
  "excavation",
] as const;

export type ServiceModifier = (typeof serviceModifiers)[number];

export const selectableServiceModifiers = [
  "gas_fitting",
  "sheetmetal",
  "roof_plumbing",
  "guttering",
  "flashing",
  "excavation",
] as const satisfies readonly ServiceModifier[];

export type TradeProfile = {
  primary_trade: string;
  template_profile: string;
  secondary_trades: string[];
  service_modifiers: ServiceModifier[];
  manual_service_modifiers?: boolean;
};

const modifierLabels: Record<ServiceModifier, string> = {
  gas_fitting: "Gas fitting",
  sheetmetal: "Sheetmetal",
  roof_plumbing: "Roof plumbing",
  guttering: "Guttering",
  flashing: "Flashings",
  drainage: "Drainage",
  bathrooms: "Bathrooms",
  renovations: "Renovations",
  maintenance: "Repairs & maintenance",
  emergency_plumbing: "Emergency plumbing",
  hot_water: "Hot water",
  excavation: "Excavation",
};

const companySuffixPattern =
  /\b(?:pty|ltd|limited|proprietary|company|co|services?|service|pl|plc|inc)\b/g;

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => getString(item).trim()).filter(Boolean)
    : [];
}

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeTradeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(companySuffixPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function addModifier(
  modifiers: Set<ServiceModifier>,
  secondaryTrades: Set<string>,
  modifier: ServiceModifier,
  secondaryTrade?: string
) {
  modifiers.add(modifier);
  if (secondaryTrade) secondaryTrades.add(secondaryTrade);
}

function getExistingTradeProfile(lead: Record<string, unknown>) {
  return getRecord(lead.trade_profile) || getRecord(getRecord(lead.data)?.trade_profile);
}

function getSearchText(lead: Record<string, unknown>) {
  const yellowPages = getRecord(lead.yellow_pages);
  const websiteOpportunity = getRecord(lead.websiteOpportunity);
  const businessInfoMatch = getRecord(lead.business_info_match);
  const pieces: string[] = [
    getString(lead.businessName),
    getString(lead.displayName),
    getString(lead.name),
    getString(lead.trade),
    getString(lead.description),
    getString(lead.headline),
    getString(lead.subheadline),
    getString(lead.problems),
    getString(lead.solution),
    getString(lead.websiteText),
    getString(lead.scrapedText),
    getString(lead.websiteContent),
    getString(lead.formattedAddress),
    getString(yellowPages?.category),
    getString(yellowPages?.description),
    getString(websiteOpportunity?.issue),
    getString(websiteOpportunity?.summary),
    getString(businessInfoMatch?.category),
  ];

  pieces.push(...getStringArray(lead.services));
  pieces.push(...getStringArray(websiteOpportunity?.issues));
  pieces.push(...getStringArray(yellowPages?.opening_hours));

  return normalizeTradeText(pieces.join(" "));
}

export function resolvePrimaryTrade(value: unknown) {
  const text = normalizeTradeText(value);

  if (
    text.includes("plumb") ||
    text.includes("gas fitting") ||
    text.includes("gasfitting") ||
    text.includes("drain") ||
    text.includes("bathroom") ||
    text.includes("sheetmetal") ||
    text.includes("sheet metal") ||
    text.includes("guttering")
  ) {
    return "plumber";
  }
  if (text.includes("electric")) return "electrician";
  if (text.includes("build")) return "builder";
  if (text.includes("clean")) return "cleaner";
  if (text.includes("landscap")) return "landscaper";
  if (text.includes("roof")) return "roofer";
  if (text.includes("paint")) return "painter";
  if (text.includes("mechanic")) return "mechanic";

  return text.replace(/\s+/g, "-") || "plumber";
}

export function buildTradeProfile(lead: Record<string, unknown>): TradeProfile {
  const existingProfile = getExistingTradeProfile(lead);
  const sourceText = getSearchText(lead);
  const tradeText = normalizeTradeText(lead.trade);
  const templateTrade = normalizeTradeText(lead.templateTrade).replace(/\s+/g, "-");
  const primaryTrade = resolvePrimaryTrade(
    [lead.trade, lead.businessName, lead.displayName, lead.name].filter(Boolean).join(" ")
  );
  const hasManualModifiers = existingProfile?.manual_service_modifiers === true;
  const modifiers = new Set<ServiceModifier>(
    getStringArray(existingProfile?.service_modifiers).filter(
      (modifier): modifier is ServiceModifier =>
        serviceModifiers.includes(modifier as ServiceModifier)
    )
  );
  const secondaryTrades = new Set<string>(
    getStringArray(existingProfile?.secondary_trades)
  );

  if (!hasManualModifiers) {
    if (
      hasAny(sourceText, [
        /\bsheet\s*metal\b/,
        /\bsheetmetal\b/,
        /\bmetal roofing\b/,
        /\bflashings?\b/,
      ])
    ) {
      addModifier(modifiers, secondaryTrades, "sheetmetal", "sheetmetal");
      addModifier(modifiers, secondaryTrades, "roof_plumbing", "roof_plumbing");
      addModifier(modifiers, secondaryTrades, "guttering", "guttering");
      addModifier(modifiers, secondaryTrades, "flashing", "flashing");
    }

    if (hasAny(sourceText, [/\bgas fitting\b/, /\bgasfitting\b/, /\bgas\b/])) {
      addModifier(modifiers, secondaryTrades, "gas_fitting", "gas_fitting");
    }

    if (
      hasAny(sourceText, [
        /\broof plumbing\b/,
        /\bguttering\b/,
        /\bgutters?\b/,
        /\bdownpipes?\b/,
        /\bflashings?\b/,
      ])
    ) {
      addModifier(modifiers, secondaryTrades, "roof_plumbing", "roof_plumbing");
      addModifier(modifiers, secondaryTrades, "guttering", "guttering");
      if (sourceText.includes("flashing")) {
        addModifier(modifiers, secondaryTrades, "flashing", "flashing");
      }
    }

    if (hasAny(sourceText, [/\bexcavat/, /\bearthworks?\b/, /\btrenching\b/])) {
      addModifier(modifiers, secondaryTrades, "excavation", "excavation");
    }
  }

  const existingTemplateProfile = getString(existingProfile?.template_profile);
  const templateProfile =
    existingTemplateProfile ||
    (templateTrade === "plumbing-gas-fitting" ||
    (tradeText.includes("plumb") && tradeText.includes("gas"))
      ? "plumbing-gas-fitting"
      : primaryTrade);

  if (hasManualModifiers) {
    return {
      primary_trade: getString(existingProfile?.primary_trade) || primaryTrade,
      template_profile: templateProfile,
      secondary_trades: unique(Array.from(secondaryTrades)),
      service_modifiers: unique(Array.from(modifiers)),
      manual_service_modifiers: true,
    };
  }

  return {
    primary_trade: getString(existingProfile?.primary_trade) || primaryTrade,
    template_profile: templateProfile,
    secondary_trades: unique(Array.from(secondaryTrades)),
    service_modifiers: unique(Array.from(modifiers)),
  };
}

export function withTradeProfile<T extends Record<string, unknown>>(lead: T): T {
  return {
    ...lead,
    trade_profile: buildTradeProfile(lead),
  };
}

export function getServiceModifierLabel(modifier: string) {
  return modifierLabels[modifier as ServiceModifier] || modifier;
}

export function getServiceModifierLabels(modifiers: readonly string[]) {
  return modifiers.map(getServiceModifierLabel);
}
