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

function hasNoWebsiteOpportunity(lead: OutreachLead) {
  const evaluation = lead.websiteEvaluation;

  return (
    evaluation?.hasWebsite === false ||
    evaluation?.quality === "none" ||
    /no website/i.test(lead.websiteOpportunity?.issue || "") ||
    /no website/i.test(evaluation?.summary || "") ||
    evaluation?.issues?.some((issue) => /no website/i.test(issue))
  );
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

function getMappedOpportunityPoint(value: string) {
  const issue = value.toLowerCase();

  if (
    /contact form|contact page|contact option|email form|get in touch/i.test(
      issue
    )
  ) {
    return "making it easier for customers to contact you";
  }

  if (/phone|call button|tap to call|click to call|call/i.test(issue)) {
    return "making it easier for people to call quickly";
  }

  if (
    /cta|call to action|enquir|inquir|quote|booking|book|convert|conversion/i.test(
      issue
    )
  ) {
    return "helping convert more visitors into enquiries";
  }

  if (
    /too much text|long text|content heavy|clutter|navigation|navigate|mobile|responsive/i.test(
      issue
    )
  ) {
    return "making the site easier to navigate on mobile";
  }

  if (
    /outdated|old technology|old tech|dated|modern|first impression|design|layout|visual/i.test(
      issue
    )
  ) {
    return "improving the overall first impression";
  }

  if (/trust|review|testimonial|proof|credibility/i.test(issue)) {
    return "building more trust before people get in touch";
  }

  if (/slow|speed|performance|load/i.test(issue)) {
    return "making the site feel faster and easier to use on mobile";
  }

  if (/local|service area|suburb|location/i.test(issue)) {
    return "making your local service area clearer";
  }

  return "";
}

function getWebsiteOpportunitySalesPoints(lead: OutreachLead) {
  const sourceText = [
    lead.websiteOpportunity?.issue,
    lead.websiteOpportunity?.summary,
    ...(lead.websiteEvaluation?.issues || []),
    lead.websiteEvaluation?.summary,
  ];
  const points: string[] = [];

  for (const value of sourceText) {
    const point = getMappedOpportunityPoint(value || "");

    if (point && !points.includes(point)) {
      points.push(point);
    }

    if (points.length === 2) break;
  }

  if (points.length > 0) return points;

  return [
    "making it easier for customers to contact you quickly from their phone",
    "improving the overall first impression",
  ];
}

function formatOpportunityPoints(points: string[]) {
  if (points.length <= 1) {
    return points[0] || "making it easier for customers to get in touch";
  }

  return `${points[0]} and ${points[1]}`;
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
  const leadName = getLeadName(lead);

  if (hasNoWebsiteOpportunity(lead)) {
    const lines = [
      `Hey ${leadName}, I had a quick look and couldn't find a website for your business.`,
      "",
    ];

    if (previewUrl) {
      lines.push(
        "I put together a quick mobile-friendly preview here:",
        previewUrl,
        ""
      );
    } else {
      lines.push(
        "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
        ""
      );
    }

    lines.push(
      "It's designed to make it easier for people to call or enquire quickly from their phone.",
      "",
      "Want me to set this up properly for you?",
      "",
      "- Jamie",
      "CallBoost"
    );

    return appendOptOut(lines.join("\n"));
  }

  if (hasBrokenWebsiteOpportunity(lead)) {
    const lines = [
      `Hey ${leadName}, I had a quick look and had trouble getting your website to load properly on mobile.`,
      "",
    ];

    if (previewUrl) {
      lines.push(
        "I put together a quick mobile-friendly preview here:",
        previewUrl,
        ""
      );
    } else {
      lines.push(
        "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
        ""
      );
    }

    lines.push(
      "It's designed to make it easier for people to call or enquire quickly from their phone.",
      "",
      "Want me to set this up properly for you?",
      "",
      "- Jamie",
      "CallBoost"
    );

    return appendOptOut(lines.join("\n"));
  }

  const opportunityPoints = formatOpportunityPoints(
    getWebsiteOpportunitySalesPoints(lead)
  );
  const lines = [
    `Hey ${leadName}, I had a quick look at your website and noticed a few areas that could be improved to help convert more visitors into calls.`,
    "",
  ];

  if (previewUrl) {
    lines.push(
      "I put together a quick mobile-friendly preview here:",
      previewUrl,
      ""
    );
  } else {
    lines.push(
      "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
      ""
    );
  }

  lines.push(
    `Mainly around ${opportunityPoints}.`,
    "",
    "Want me to set this up properly for you?",
    "",
    "- Jamie",
    "CallBoost"
  );

  return appendOptOut(lines.join("\n"));
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

  if (hasNoWebsiteOpportunity(lead)) {
    const lines = [
      `Hey ${leadName},`,
      "",
      "I had a quick look and couldn't find a website for your business.",
      "",
    ];

    if (previewUrl) {
      lines.push(
        "I put together a quick mobile-friendly preview here:",
        previewUrl,
        ""
      );
    } else {
      lines.push(
        "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
        ""
      );
    }

    lines.push(
      "It's designed to make it easier for people to call or enquire quickly from their phone.",
      "",
      "Want me to set this up properly for you?",
      "",
      "Thanks,",
      "Jamie",
      "CallBoost"
    );

    return lines.join("\n");
  }

  if (hasBrokenWebsiteOpportunity(lead)) {
    const lines = [
      `Hey ${leadName},`,
      "",
      "I had a quick look and had trouble getting your website to load properly on mobile.",
      "",
    ];

    if (previewUrl) {
      lines.push(
        "I put together a quick mobile-friendly preview here:",
        previewUrl,
        ""
      );
    } else {
      lines.push(
        "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
        ""
      );
    }

    lines.push(
      "It's designed to make it easier for people to call or enquire quickly from their phone.",
      "",
      "Want me to set this up properly for you?",
      "",
      "Thanks,",
      "Jamie",
      "CallBoost"
    );

    return lines.join("\n");
  }

  const opportunityPoints = formatOpportunityPoints(
    getWebsiteOpportunitySalesPoints(lead)
  );

  const lines = [
    `Hey ${leadName},`,
    "",
    "I had a quick look at your website and noticed a few areas that could be improved to help convert more visitors into calls.",
    "",
  ];

  if (previewUrl) {
    lines.push(
      "I put together a quick mobile-friendly preview here:",
      previewUrl,
      ""
    );
  } else {
    lines.push(
      "I put together a quick mobile-friendly preview and can send it through if you want to take a look.",
      ""
    );
  }

  lines.push(
    `Mainly around ${opportunityPoints}.`,
    "",
    "Want me to set this up properly for you?",
    "",
    "Thanks,",
    "Jamie",
    "CallBoost"
  );

  return lines.join("\n");
}

export function buildInterestedReplySms(
  _args: InterestedReplyPersonalization = {}
) {
  void _args;

  return appendOptOut([
    "Glad you like it 👍",
    "",
    "It's $99 setup + $99/month ongoing.",
    "",
    "I handle everything including domain setup, hosting, updates and any small changes needed.",
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
    "It's $99 setup + $99/month ongoing.",
    "",
    `I handle everything including domain setup, hosting, updates and any small changes needed for ${websiteNoun}.`,
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
