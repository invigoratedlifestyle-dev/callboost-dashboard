import type { Lead } from "./leads";
import { appendOptOut } from "./smsOptOut";
import { CALLBOOST_PRICE_SUMMARY } from "./pricing";

type OutreachLead = Pick<
  Lead,
  | "businessName"
  | "generatedSiteUrl"
  | "id"
  | "name"
  | "slug"
  | "trade"
  | "websiteEvaluation"
> & {
  solution?: string;
  subheadline?: string;
  websiteOpportunity?: {
    issue?: string;
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
  const evaluation = lead.websiteEvaluation;

  return (
    evaluation?.isWorking === false ||
    evaluation?.issues?.some((issue) =>
      /broken|unreachable|failed to load|could not be loaded/i.test(issue)
    )
  );
}

function buildInitialOpportunityOutreachLines(
  lead: OutreachLead,
  previewUrl: string
) {
  const leadName = getLeadName(lead);
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

  lines.push(
    "I noticed your current site could be a bit easier for customers to navigate and contact you from mobile.",
    "",
    "Mainly around improving the first impression and making it quicker for people to call or enquire.",
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
  if (hasBrokenWebsiteOpportunity(lead)) {
    return "I couldn't get your site to load on mobile";
  }

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
  return appendOptOut(
    buildInitialOpportunityOutreachLines(lead, previewUrl).join("\n")
  );
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
  return buildInitialOpportunityOutreachLines(lead, previewUrl).join("\n");
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

  return lines.join("\n");
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
  return [
    "Perfect - here's the secure payment link to get started:",
    "",
    paymentLink,
    "",
    "Once that's done, I'll get everything set up and live for you.",
    "",
    "Thanks,",
    "Jamie",
  ].join("\n");
}
