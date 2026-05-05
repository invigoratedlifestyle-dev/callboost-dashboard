import type { Lead } from "./leads";
import { appendOptOut } from "./smsOptOut";

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

export function getWebsiteOpportunityIssue(lead: OutreachLead) {
  const evaluation = lead.websiteEvaluation;
  const isBrokenOrUnreachable =
    evaluation?.isWorking === false ||
    evaluation?.issues?.some((issue) =>
      /broken|unreachable|failed to load|could not be loaded/i.test(issue)
    );

  if (isBrokenOrUnreachable) {
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
  const leadName = getLeadName(lead);
  const issue =
    getWebsiteOpportunityIssue(lead) ||
    "a couple of things that might be costing you calls";

  if (!previewUrl) {
    return appendOptOut([
      `Hey ${leadName}, I had a quick look and noticed ${issue}.`,
      "",
      "I made a cleaner preview and can send it through if you want to take a look.",
      "",
      "It's designed to make it easier for people to call quickly from mobile. Want me to set this up properly for you?",
      "",
      "- Jamie",
    ].join("\n"));
  }

  return appendOptOut([
    `Hey ${leadName}, I had a quick look and noticed ${issue}. I made a cleaner preview here: ${previewUrl}`,
    "",
    "It's designed to make it easier for people to call quickly from mobile. Want me to set this up properly for you?",
    "",
    "- Jamie",
  ].join("\n"));
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
  const leadName = getLeadName(lead);
  const issue =
    getWebsiteOpportunityIssue(lead) ||
    "A few improvements could make it easier for customers to call you.";

  const lines = [
    `Hey ${leadName},`,
    "",
    "I had a quick look at your website and noticed something that might be costing you calls:",
    "",
    `- ${issue}`,
    "",
  ];

  if (previewUrl) {
    lines.push("I made a cleaner preview here:", previewUrl, "");
  } else {
    lines.push("I can send through a preview if you want to take a look.", "");
  }

  lines.push(
    "It's designed to make it easier for people to call you quickly from mobile.",
    "",
    "Want me to set this up properly for you?",
    "",
    "Thanks,",
    "Jamie"
  );

  return lines.join("\n");
}

export function buildInterestedReplySms(
  args: InterestedReplyPersonalization = {}
) {
  const previewUrl = clean(args.previewUrl);
  const setupTarget = getBusinessSetupTarget(args);

  return appendOptOut([
    "Glad you like it. Simple from here: $99 setup, then $99/month.",
    "",
    "I handle the domain setup, hosting, updates and small tweaks, so you do not need to manage anything.",
    previewUrl ? `Preview: ${previewUrl}` : "",
    "",
    `If you are happy to go ahead, I can send the secure payment link and get ${setupTarget} set up.`,
  ].filter(Boolean).join("\n"));
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
    "The setup is simple: $99 setup, then $99/month.",
    "",
    `That covers domain setup, hosting, updates and small changes for ${websiteNoun}, so you do not need to manage the technical side.`,
    "",
  ];

  if (previewUrl) {
    lines.push("For reference, the preview is here:", previewUrl, "");
  }

  lines.push(
    `If you are happy to go ahead, I can send through the secure payment link and get ${setupTarget} set up.`,
    "",
    "Thanks,",
    "Jamie"
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
