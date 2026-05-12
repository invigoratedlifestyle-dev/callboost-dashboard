export type TradeValidationResult = {
  targetTrade: string;
  score: number;
  matchedTerms: string[];
  rejectedTerms: string[];
  reason?: string;
  validatedAt: string;
  isValid: boolean;
};

type TradeValidationPlace = {
  displayName?: {
    text?: string;
  } | string;
  businessName?: string;
  name?: string;
  formattedAddress?: string;
  websiteUri?: string;
  website?: string;
  types?: string[];
  primaryType?: string;
  primary_type?: string;
  businessStatus?: string;
  searchQueryFoundFrom?: string;
};

type TradeRuleSet = {
  strongTerms: string[];
  relatedTerms: string[];
  rejectedTerms: string[];
};

const tradeRules: Record<string, TradeRuleSet> = {
  plumber: {
    strongTerms: [
      "plumber",
      "plumbers",
      "plumbing",
      "blocked drain",
      "hot water",
      "gas fitter",
      "gasfitter",
    ],
    relatedTerms: ["drain", "pipe", "pipes", "leak", "leaks", "gas"],
    rejectedTerms: [
      "handyman",
      "painter",
      "painting",
      "electrician",
      "builder",
      "carpenter",
      "roofing",
      "roofer",
      "landscaper",
      "cleaner",
      "renovation",
    ],
  },
  "plumbing-gas-fitting": {
    strongTerms: [
      "plumber",
      "plumbers",
      "plumbing",
      "gas fitter",
      "gas fitters",
      "gasfitter",
      "gasfitters",
      "gas fitting",
      "gas plumbing",
      "hot water",
      "blocked drain",
    ],
    relatedTerms: [
      "drain",
      "pipe",
      "pipes",
      "leak",
      "leaks",
      "gas",
      "appliance connection",
      "gas appliance",
    ],
    rejectedTerms: [
      "handyman",
      "painter",
      "painting",
      "electrician",
      "builder",
      "carpenter",
      "roofing",
      "roofer",
      "landscaper",
      "cleaner",
      "renovation",
    ],
  },
};

const foodHospitalityRetailTypes = new Set([
  "restaurant",
  "meal_takeaway",
  "food",
  "cafe",
  "bakery",
  "bar",
  "lodging",
  "store",
  "supermarket",
  "convenience_store",
  "tourist_attraction",
]);

const negativeNameTerms = [
  "takeaway",
  "restaurant",
  "cafe",
  "food",
  "pizza",
  "bakery",
  "hotel",
  "motel",
  "accommodation",
  "supermarket",
  "bottle shop",
];

const plumberTradeTypes = new Set([
  "plumber",
  "plumbing",
  "contractor",
  "general_contractor",
]);

const plumberIntentTerms = [
  "plumber",
  "plumbers",
  "plumbing",
  "gas fitting",
  "gas fitter",
  "gasfitter",
  "gas fitters",
  "gasfitters",
  "blocked drain",
  "drain",
  "hot water",
];

function normalizeTrade(value: string) {
  const normalized = value.toLowerCase().trim();

  if (
    normalized.includes("plumb") &&
    (normalized.includes("gas") || normalized.includes("fitting"))
  ) {
    return "plumbing-gas-fitting";
  }

  if (normalized.includes("plumb")) {
    return "plumber";
  }

  return normalized;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+.\s/:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(text: string, term: string) {
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`, "i");

  return pattern.test(text);
}

function getDisplayNameText(place: TradeValidationPlace) {
  if (typeof place.displayName === "string") {
    return place.displayName;
  }

  return place.displayName?.text || place.businessName || place.name || "";
}

function getPrimaryType(place: TradeValidationPlace) {
  return normalizeText(place.primaryType || place.primary_type || "");
}

function getNormalizedTypes(place: TradeValidationPlace) {
  return Array.from(
    new Set(
      [...(place.types || []), getPrimaryType(place)]
        .map((type) => normalizeText(type).replace(/\s+/g, "_"))
        .filter(Boolean)
    )
  );
}

function hasAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => includesTerm(text, term));
}

export function isGooglePlaceRelevantForTrade(
  place: TradeValidationPlace,
  targetTrade: string
) {
  const normalizedTargetTrade = normalizeTrade(targetTrade);
  const name = normalizeText(getDisplayNameText(place));
  const website = normalizeText(place.websiteUri || place.website || "");
  const primaryType = getPrimaryType(place).replace(/\s+/g, "_");
  const types = getNormalizedTypes(place);
  const categoryTypes = new Set([...types, primaryType].filter(Boolean));
  const nameAndWebsite = `${name} ${website}`;
  const matchedNegativeNameTerm = negativeNameTerms.find((term) =>
    includesTerm(name, term)
  );
  const matchedNegativeType = [...categoryTypes].find((type) =>
    foodHospitalityRetailTypes.has(type)
  );

  if (matchedNegativeNameTerm) {
    return {
      isRelevant: false,
      reason: `negative_name_keyword:${matchedNegativeNameTerm}`,
      primaryType,
      types,
    };
  }

  if (matchedNegativeType) {
    return {
      isRelevant: false,
      reason: `negative_place_type:${matchedNegativeType}`,
      primaryType,
      types,
    };
  }

  if (
    normalizedTargetTrade !== "plumber" &&
    normalizedTargetTrade !== "plumbing-gas-fitting"
  ) {
    return {
      isRelevant: true,
      reason: "no_strict_place_type_rules",
      primaryType,
      types,
    };
  }

  const matchedPlumberType = [...categoryTypes].find((type) =>
    plumberTradeTypes.has(type)
  );

  if (matchedPlumberType) {
    return {
      isRelevant: true,
      reason: `matched_place_type:${matchedPlumberType}`,
      primaryType,
      types,
    };
  }

  if (
    categoryTypes.has("home_goods_store") &&
    hasAnyTerm(nameAndWebsite, plumberIntentTerms)
  ) {
    return {
      isRelevant: true,
      reason: "matched_home_goods_store_with_plumbing_intent",
      primaryType,
      types,
    };
  }

  if (
    (categoryTypes.size === 0 ||
      [...categoryTypes].every((type) =>
        ["point_of_interest", "establishment"].includes(type)
      )) &&
    hasAnyTerm(nameAndWebsite, plumberIntentTerms)
  ) {
    return {
      isRelevant: true,
      reason: "matched_name_or_website_plumbing_intent",
      primaryType,
      types,
    };
  }

  return {
    isRelevant: false,
    reason: categoryTypes.has("point_of_interest")
      ? "point_of_interest_without_trade_specific_type"
      : "missing_plumbing_place_type",
    primaryType,
    types,
  };
}

export function isValidTradeLead(
  place: TradeValidationPlace,
  targetTrade: string
): TradeValidationResult {
  const normalizedTargetTrade = normalizeTrade(targetTrade);
  const rules = tradeRules[normalizedTargetTrade];
  const placeRelevance = isGooglePlaceRelevantForTrade(place, targetTrade);
  const searchableText = normalizeText([
    getDisplayNameText(place),
    place.formattedAddress,
    place.websiteUri,
    place.website,
    place.primaryType,
    place.primary_type,
    place.searchQueryFoundFrom,
    ...(place.types || []),
  ].join(" "));
  const matchedTerms: string[] = [];
  const rejectedTerms: string[] = [];
  let score = 0;

  if (!rules) {
    return {
      targetTrade: normalizedTargetTrade,
      score: 3,
      matchedTerms: [normalizedTargetTrade],
      rejectedTerms: [],
      reason: placeRelevance.reason,
      validatedAt: new Date().toISOString(),
      isValid: placeRelevance.isRelevant,
    };
  }

  if (!placeRelevance.isRelevant) {
    return {
      targetTrade: normalizedTargetTrade,
      score,
      matchedTerms: [],
      rejectedTerms: [placeRelevance.reason],
      reason: placeRelevance.reason,
      validatedAt: new Date().toISOString(),
      isValid: false,
    };
  }

  for (const term of rules.strongTerms) {
    if (includesTerm(searchableText, term)) {
      score += 3;
      matchedTerms.push(term);
    }
  }

  for (const term of rules.relatedTerms) {
    if (includesTerm(searchableText, term)) {
      score += 1;
      matchedTerms.push(term);
    }
  }

  if (
    matchedTerms.length === 0 &&
    placeRelevance.reason?.startsWith("matched_place_type:")
  ) {
    score += 3;
    matchedTerms.push(placeRelevance.reason.replace("matched_place_type:", ""));
  }

  for (const term of rules.rejectedTerms) {
    if (includesTerm(searchableText, term)) {
      score -= 5;
      rejectedTerms.push(term);
    }
  }

  return {
    targetTrade: normalizedTargetTrade,
    score,
    matchedTerms: Array.from(new Set(matchedTerms)),
    rejectedTerms: Array.from(new Set(rejectedTerms)),
    reason: rejectedTerms.length ? "rejected_keyword" : placeRelevance.reason,
    validatedAt: new Date().toISOString(),
    isValid: score >= 3,
  };
}
