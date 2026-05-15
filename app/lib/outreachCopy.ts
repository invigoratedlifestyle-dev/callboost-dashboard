import type { Lead } from "./leads";
import { appendEmailUnsubscribeFooter } from "./emailUnsubscribe";
import { appendOptOut, estimateSmsSegments, sanitizeForGsm } from "./smsOptOut";
import { CALLBOOST_PRICE_SUMMARY } from "./pricing";
import { buildOutreachOpportunityContext } from "./websiteOpportunity";

type OutreachLead = Pick<
  Lead,
  | "businessName"
  | "generatedSiteUrl"
  | "id"
  | "name"
  | "slug"
  | "trade"
  | "websiteEvaluation"
  | "website_opportunity_v2"
> & {
  solution?: string;
  subheadline?: string;
  websiteOpportunity?: {
    issue?: string;
    issues?: string[];
    summary?: string;
  };
};

export type InterestedReplyPersonalization = {
  businessName?: string | null;
  previewUrl?: string | null;
  trade?: string | null;
};

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getPossessiveBusinessName(businessName?: string | null) {
  const cleanedName = clean(businessName);

  if (!cleanedName) return "";

  return cleanedName.endsWith("s") ? `${cleanedName}'` : `${cleanedName}'s`;
}

function getBusinessSetupTarget(args: InterestedReplyPersonalization) {
  const businessName = clean(args.businessName);
  const trade = clean(args.trade).toLowerCase();

  if (businessName) return businessName;
  if (trade) return `your ${trade} site`;

  return "it";
}

function getWebsiteNoun(args: InterestedReplyPersonalization) {
  const possessiveBusinessName = getPossessiveBusinessName(args.businessName);
  const trade = clean(args.trade).toLowerCase();

  if (possessiveBusinessName) return `${possessiveBusinessName} website`;
  if (trade) return `your ${trade} website`;

  return "your website";
}

function hasBrokenWebsiteOpportunity(lead: OutreachLead) {
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: lead.website_opportunity_v2,
    websiteOpportunity: lead.websiteOpportunity,
    websiteEvaluation: lead.websiteEvaluation,
  });
  const evaluation = lead.websiteEvaluation;

  return (
    [...context.signalLabels, ...context.issues].some((signal) =>
      /unreachable|intermittent|invalid domain|parked|could not be reliably reached/i.test(
        signal
      )
    ) ||
    evaluation?.isWorking === false ||
    evaluation?.issues?.some((issue) =>
      /broken|unreachable|failed to load|could not be loaded/i.test(issue)
    )
  );
}

function isNoWebsitePlaceholder(value?: string | null) {
  const normalizedValue = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(no|missing)\s+(current\s+)?(website|site)\s+(found|detected)?$/.test(
    normalizedValue
  ) || /^(website|site)\s+(not\s+found|missing)$/.test(normalizedValue);
}

function hasNoWebsiteOpportunity(lead: OutreachLead) {
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: lead.website_opportunity_v2,
    websiteOpportunity: lead.websiteOpportunity,
    websiteEvaluation: lead.websiteEvaluation,
  });
  const evaluation = lead.websiteEvaluation;
  const opportunityIssues = Array.isArray(lead.websiteOpportunity?.issues)
    ? lead.websiteOpportunity?.issues || []
    : [];
  const issueSignals = [
    lead.websiteOpportunity?.issue,
    lead.websiteOpportunity?.summary,
    evaluation?.summary,
    ...(evaluation?.issues || []),
    ...opportunityIssues,
  ];

  return [...context.signalLabels, ...context.issues].some((signal) =>
    /no website|no standalone|no real business website|directory|social media|facebook-only|instagram-only/i.test(
      signal
    )
  ) ||
    evaluation?.quality === "none" ||
    evaluation?.hasWebsite === false ||
    issueSignals.some((issue) => isNoWebsitePlaceholder(issue));
}

function buildInitialOpportunityOutreachLines(
  lead: OutreachLead,
  previewUrl: string
) {
  const leadName = getLeadName(lead);

  if (hasNoWebsiteOpportunity(lead)) {
    return [
      `Hey ${leadName},`,
      "",
      "I noticed you don’t currently have a dedicated business website, so I mocked up an example of what a modern mobile-friendly version could look like for your business.",
      "",
      previewUrl,
      "",
      "The main goal was making it easier for customers to:",
      "",
      "* quickly call or enquire",
      "* find your services",
      "* view your business professionally on mobile",
      "",
      "Happy to set it up properly for you if you like 👍",
      "",
      "Thanks,",
      "Jamie",
      "CallBoost Tasmania",
    ];
  }

  const lines = [`Hey ${leadName},`, ""];

  if (previewUrl) {
    lines.push(
      "I put together a quick mobile-friendly website preview for you here:",
      "",
      previewUrl,
      ""
    );
  } else {
    lines.push(
      "I put together a quick mobile-friendly website preview and can send it through if you want to take a look.",
      ""
    );
  }

  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: lead.website_opportunity_v2,
    websiteOpportunity: lead.websiteOpportunity,
    websiteEvaluation: lead.websiteEvaluation,
  });
  const mainReason =
    context.level !== "none" && (context.summary || context.reason)
      ? context.summary || context.reason
      : "I noticed your current site could be a bit easier for customers to navigate and contact you from mobile.";
  const supportingIssue =
    context.issues.find((issue) => issue.trim()) ||
    context.signalLabels.find((signal) => signal.trim());

  lines.push(
    mainReason,
    "",
    supportingIssue
      ? `The main thing I noticed was: ${supportingIssue}`
      : "Mainly around improving the first impression and making it quicker for people to call or enquire.",
    "",
    "Happy to set this up properly for you if you like 👍",
    "",
    "Thanks,",
    "Jamie",
    "CallBoost Tasmania"
  );

  return lines;
}

export function getWebsiteOpportunityIssue(lead: OutreachLead) {
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: lead.website_opportunity_v2,
    websiteOpportunity: lead.websiteOpportunity,
    websiteEvaluation: lead.websiteEvaluation,
  });

  if (hasBrokenWebsiteOpportunity(lead)) {
    return "I couldn't get your site to load on mobile";
  }

  const firstSignal =
    context.issues.find((issue) => issue.trim()) ||
    context.signalLabels.find((signal) => signal.trim());

  if (firstSignal) return firstSignal;

  if (context.reason && context.level !== "none") return context.reason;

  const explicitIssue = lead.websiteOpportunity?.issue?.trim();

  if (explicitIssue) return explicitIssue;

  const firstEvaluationIssue = lead.websiteEvaluation?.issues?.find((issue) =>
    issue.trim()
  );

  if (firstEvaluationIssue) return firstEvaluationIssue.trim();

  const opportunitySummary = lead.websiteOpportunity?.summary?.trim();

  if (opportunitySummary) return opportunitySummary;

  const evaluationSummary = lead.websiteEvaluation?.summary?.trim();

  if (evaluationSummary) return evaluationSummary;

  return "";
}

export function getLeadName(lead: Pick<OutreachLead, "businessName" | "name">) {
  return lead.name || lead.businessName || "this business";
}

export function buildOpportunitySms(
  lead: OutreachLead,
  previewUrl: string
) {
  const leadName = getLeadName(lead);
  const context = buildOutreachOpportunityContext({
    websiteOpportunityV2: lead.website_opportunity_v2,
    websiteOpportunity: lead.websiteOpportunity,
    websiteEvaluation: lead.websiteEvaluation,
  });
  const signalSummary = context.issues[0]
    ? `I noticed ${context.issues[0].toLowerCase()}, so this could help make enquiries easier.`
    : context.signalLabels[0]
      ? `I noticed ${context.signalLabels[0].toLowerCase()}, so this could help make enquiries easier.`
    : "I noticed a few areas that could make it easier for customers to call/contact you from mobile.";

  if (hasNoWebsiteOpportunity(lead)) {
    return buildShortOpportunitySms([
      `Hi ${leadName},`,
      "",
      "I noticed you don't currently have a business website, so I mocked up a mobile-friendly example:",
      "",
      previewUrl,
      "",
      "Made to help customers call, enquire, and find your services more easily on mobile.",
      "",
      "Jamie",
      "CallBoost Tasmania",
    ]);
  }

  return buildShortOpportunitySms([
    `Hey ${leadName} - I made a quick mobile-friendly website preview for you:`,
    previewUrl,
    "",
    signalSummary,
    "",
    "- Jamie, CallBoost Tasmania",
  ]);
}

function buildShortOpportunitySms(lines: string[]) {
  const candidates = [
    lines,
    lines.map((line) =>
      line ===
      "I noticed a few areas that could make it easier for customers to call/contact you from mobile."
        ? "Could help make mobile enquiries easier."
        : line
    ),
    lines
      .map((line) =>
        line === "- Jamie, CallBoost Tasmania" ? "- Jamie - CallBoost" : line
      )
      .map((line) =>
        line ===
        "I noticed a few areas that could make it easier for customers to call/contact you from mobile."
          ? "Could help make mobile enquiries easier."
          : line
      ),
  ];
  let selected = estimateSmsSegments(
    sanitizeForGsm(appendOptOut(candidates[0].filter(Boolean).join("\n")))
  );

  for (const candidate of candidates) {
    const estimate = estimateSmsSegments(
      sanitizeForGsm(appendOptOut(candidate.filter(Boolean).join("\n")))
    );

    selected = estimate;
    if (estimate.length <= 320) break;
  }

  console.log("[SMS_DEBUG]", {
    encoding: selected.encoding,
    estimatedSegments: selected.estimatedSegments,
    length: selected.length,
  });

  return selected.text;
}

export function buildOpportunityEmailSubject(
  lead: Pick<OutreachLead, "businessName" | "name">
) {
  return `Quick website preview for ${getLeadName(lead)}`;
}

export function buildOpportunityEmail(
  lead: OutreachLead,
  previewUrl: string
) {
  return appendEmailUnsubscribeFooter(
    buildInitialOpportunityOutreachLines(lead, previewUrl).join("\n")
  );
}

export function buildInterestedReplySms(
  _args: InterestedReplyPersonalization = {}
) {
  void _args;

  return appendOptOut([
    "Glad you like it 👍",
    "",
    `It's ${CALLBOOST_PRICE_SUMMARY}.`,
    "",
    "I handle everything including domain setup, managed hosting & support, updates and any small changes needed.",
    "",
    "If you'd like to go ahead, I can send through the payment link and get everything set up for you.",
    "",
    "Cheers,",
    "Jamie",
    "CallBoost",
  ].join("\n"));
}

export function buildInterestedReplyEmailSubject(
  args: InterestedReplyPersonalization = {}
) {
  return `Setting up ${getWebsiteNoun(args)}`;
}

export function buildInterestedReplyEmail(
  args: InterestedReplyPersonalization = {}
) {
  const previewUrl = clean(args.previewUrl);
  const websiteNoun = getWebsiteNoun(args);
  const setupTarget = getBusinessSetupTarget(args);
  const lines = [
    "Glad you like it.",
    "",
    `It's ${CALLBOOST_PRICE_SUMMARY}.`,
    "",
    `I handle everything including domain setup, managed hosting & support, updates and any small changes needed for ${websiteNoun}.`,
    "",
  ];

  if (previewUrl) {
    lines.push("For reference, the preview is here:", previewUrl, "");
  }

  lines.push(
    `If you'd like to go ahead, I can send through the payment link and get ${setupTarget} set up for you.`,
    "",
    "Cheers,",
    "Jamie",
    "CallBoost"
  );

  return appendEmailUnsubscribeFooter(lines.join("\n"));
}

export function buildPaymentSms(paymentLink: string) {
  return appendOptOut([
    "Perfect - here's the secure payment link to get started:",
    paymentLink,
    "",
    "Once that's done, I'll get everything set up and live for you.",
  ].join("\n"));
}

export function buildPaymentEmailSubject() {
  return "Payment link to get started";
}

export function buildPaymentEmail(paymentLink: string) {
  return appendEmailUnsubscribeFooter([
    "Perfect - here's the secure payment link to get started:",
    "",
    paymentLink,
    "",
    "Once that's done, I'll get everything set up and live for you.",
    "",
    "Thanks,",
    "Jamie",
  ].join("\n"));
}
