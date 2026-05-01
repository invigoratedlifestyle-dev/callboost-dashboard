export type TradeValidationResult = {
  targetTrade: string;
  score: number;
  matchedTerms: string[];
  rejectedTerms: string[];
  validatedAt: string;
  isValid: boolean;
};

type TradeValidationPlace = {
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  websiteUri?: string;
  types?: string[];
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
      "general contractor",
      "renovation",
    ],
  },
};

function normalizeTrade(value: string) {
  const normalized = value.toLowerCase().trim();

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

export function isValidTradeLead(
  place: TradeValidationPlace,
  targetTrade: string
): TradeValidationResult {
  const normalizedTargetTrade = normalizeTrade(targetTrade);
  const rules = tradeRules[normalizedTargetTrade];
  const searchableText = normalizeText([
    place.displayName?.text,
    place.formattedAddress,
    place.websiteUri,
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
      validatedAt: new Date().toISOString(),
      isValid: true,
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
    validatedAt: new Date().toISOString(),
    isValid: score >= 3,
  };
}
