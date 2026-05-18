"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, useEffect, useState } from "react";
import type {
  CallbackRequest,
  Lead,
  LeadMessage,
  LeadStage,
} from "../../lib/leads";
import type { BusinessInfoMatch } from "../../lib/businessInfoMatch";
import {
  formatAustralianPhoneNumber,
  hasUsableFollowUpContact,
} from "../../lib/contactMethods";
import { appendEmailUnsubscribeFooter } from "../../lib/emailUnsubscribe";
import { estimateSmsSegments } from "../../lib/smsOptOut";
import {
  getLastActivityLabel,
  getLeadStatusBadgeClass,
  getLeadStatusLabel,
} from "../../lib/leadWorkflow";
import {
  buildWebsiteOpportunityResult,
  getWebsiteOpportunityVisibleIssues,
} from "../../lib/websiteOpportunity";
import type {
  StoredWebsiteOpportunityResult,
  WebsiteOpportunityLevel,
} from "../../lib/websiteOpportunity";
import {
  getServiceModifierLabel,
  selectableServiceModifiers,
  serviceModifiers,
  type ServiceModifier,
} from "../../lib/leadTargeting/tradeModifiers";
import { CALLBOOST_CHECKOUT_SUMMARY } from "../../lib/pricing";
import {
  buildFollowUpBody,
  getFollowUpDestination,
  getLatestOutboundMessageChannel,
} from "../../lib/followUps";
import { buildCustomerPreviewUrl } from "../../lib/previewUrls";
import {
  buildEngagedSoftCheckInEmail,
  buildEngagedSoftCheckInEmailSubject,
  buildEngagedSoftCheckInSms,
  buildInterestedReplyEmail,
  buildInterestedReplyEmailSubject,
  buildInterestedReplySms,
  buildOpportunityEmail,
  buildOpportunityEmailSubject,
  buildOpportunitySms,
  buildPaymentEmail,
  buildPaymentEmailSubject,
  buildPaymentSms,
  getLeadName,
  type InterestedReplyPersonalization,
} from "../../lib/outreachCopy";
import BusinessInfoTab from "./components/BusinessInfoTab";
import ClientSettingsTab from "./components/ClientSettingsTab";
import CommunicationTab from "./components/CommunicationTab";
import DesignTab, { PreviewCard } from "./components/DesignTab";
import { EnrichButton } from "./EnrichButton";
import GenerateSiteButton from "./GenerateSiteButton";

type LeadWithGeneratedContent = Lead & {
  displayName?: string;
  address?: string;
  formattedAddress?: string;
  heroImageUrl?: string;
  mobileHeroImageUrl?: string;
  siteBrandingUrl?: string;
  siteIconUrl?: string;
  design?: {
    buttonColor?: string;
    buttonTextColor?: string;
    accentTextColor?: string;
    heroAccentColor?: string;
    bodyAccentColor?: string;
    serviceAreaCardColor?: string;
    footerBackgroundColor?: string;
  };
  generated_site_design?: {
    button_color?: string;
    button_text_color?: string;
    accent_text_color?: string;
    hero_accent_color?: string;
    body_accent_color?: string;
    service_area_card_color?: string;
    footer_background_color?: string;
  };
  templateTrade?: string;
  templateType?: string;
  headline?: string;
  subheadline?: string;
  problems?: string;
  solution?: string;
  websiteOpportunity?: {
    issue?: string;
    issues?: string[];
    summary?: string;
  };
  yellow_pages?: {
    listing_url?: string;
    url?: string;
    manual_listing_url?: string;
    website?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    description?: string;
    address?: string;
    abn?: string;
    established_year?: string;
    category?: string;
    payment_methods?: string[];
    opening_hours?: string[];
    years_in_business?: string;
    scraped_at?: string;
  };
  yellow_pages_search?: {
    query?: string;
    searchUrl?: string;
    candidateCount?: number;
    fetchedAt?: string;
    reason?: string;
  };
  yellow_pages_url?: string;
  enrichment_sources?: {
    website?: string;
    email?: string;
    phone?: string;
  };
  business_info_match?: BusinessInfoMatch;
  business_presence?: {
    primaryBusinessPresenceType?: string;
    sourceType?: string;
    primaryBusinessPresenceUrl?: string;
    sourceUrl?: string;
    originalWebsiteUrl?: string;
  };
  website_opportunity_v2?: StoredWebsiteOpportunityResult;
};

type OutreachChannel = "sms" | "email";
type FollowUpStage = 1 | 2 | 3;
type PendingFollowUpMetadata = {
  reason: "manual_follow_up";
  follow_up_stage: FollowUpStage;
  channel: OutreachChannel;
};
type EngagedReplyType = "soft_check_in" | "pricing_ready";

const templateTradeOptions = [
  "plumber",
  "plumbing-gas-fitting",
  "electrician",
  "builder",
  "cleaner",
  "landscaper",
  "roofer",
  "painter",
  "mechanic",
];

const templateTypeOptions = [
  "modern",
  "premium",
  "hero-image-led",
  "local",
  "emergency",
  "minimal",
  "corporate",
];

const serviceModifierOptions = selectableServiceModifiers.map((modifier) => ({
  value: modifier,
  label: getServiceModifierLabel(modifier),
}));

const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const HERO_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const heroImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const heroImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const BRANDING_IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const SITE_ICON_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const SITE_ICON_IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const DEFAULT_BUTTON_COLOR = "#14b8a6";
const DEFAULT_BUTTON_TEXT_COLOR = "#ffffff";
const DEFAULT_ACCENT_TEXT_COLOR = "#0f766e";
const DEFAULT_HERO_ACCENT_COLOR = "#a7f3d0";
const DEFAULT_BODY_ACCENT_COLOR = "#0f766e";
const DEFAULT_SERVICE_AREA_CARD_COLOR = "#0f766e";
const DEFAULT_FOOTER_BACKGROUND_COLOR = "#0b1220";

type TimelineItem =
  | {
      type: "message";
      id: string;
      createdAt: string;
      message: LeadMessage;
    }
  | {
      type: "callback";
      id: string;
      createdAt: string;
      callback: CallbackRequest;
    };

const stageOptions: Array<{ stage: LeadStage; label: string }> = [
  { stage: "contacted", label: "Mark Contacted" },
  { stage: "client", label: "Mark Client" },
  { stage: "archived", label: "Archive" },
];

const stageLabels: Record<LeadStage, string> = {
  lead: "Lead",
  contacted: "Contacted",
  client: "Client",
  archived: "Archived",
};

const LEAD_DETAIL_TABS = [
  { id: "business-info", label: "Business Info" },
  { id: "design", label: "Design" },
  { id: "communication", label: "Communication" },
  { id: "client-settings", label: "Client Settings" },
] as const;

type LeadDetailTabId = (typeof LEAD_DETAIL_TABS)[number]["id"];

function isLeadDetailTabId(value: string | null): value is LeadDetailTabId {
  return LEAD_DETAIL_TABS.some((tab) => tab.id === value);
}

function getLeadStage(lead: Pick<LeadWithGeneratedContent, "stage">) {
  return lead.stage || "lead";
}

function getStageBadgeClass(stage?: string) {
  if (stage === "lead") return "bg-blue-500/15 text-blue-300";
  if (stage === "contacted") return "bg-slate-500/15 text-slate-300";
  if (stage === "client") return "bg-green-500/15 text-green-300";
  if (stage === "archived") return "bg-slate-700 text-slate-300";
  return "bg-white/10 text-slate-400";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getOpportunityLevelLabel(level?: WebsiteOpportunityLevel) {
  if (level === "high") return "High opportunity";
  if (level === "medium") return "Medium opportunity";
  if (level === "low") return "Low opportunity";
  if (level === "unranked") return "Unranked";
  if (level === "none") return "No opportunity";

  return "Unknown";
}

function getCompactOpportunityLevelLabel(level?: WebsiteOpportunityLevel) {
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  if (level === "low") return "Low";

  return getOpportunityLevelLabel(level);
}

function getOpportunityLevelBadgeClass(level?: WebsiteOpportunityLevel) {
  if (level === "high") return "bg-red-500/15 text-red-300";
  if (level === "medium") return "bg-yellow-500/15 text-yellow-300";
  if (level === "low") return "bg-blue-500/15 text-blue-300";
  if (level === "unranked") return "bg-purple-500/15 text-purple-300";
  if (level === "none") return "bg-green-500/15 text-green-300";

  return "bg-white/10 text-slate-400";
}

function getBusinessInfoMatchLabel(match?: BusinessInfoMatch) {
  if (!match) return "No match data";
  if (match.confidence === "high") return "High confidence match";
  if (match.confidence === "medium") {
    return "Medium confidence - review suggested";
  }
  if (match.confidence === "rejected") return "Rejected - no reliable match";

  return "Low confidence - fallback branding used";
}

function getBusinessInfoMatchBadgeClass(match?: BusinessInfoMatch) {
  if (!match) return "bg-white/10 text-slate-400";
  if (match.confidence === "high") return "bg-green-500/15 text-green-300";
  if (match.confidence === "medium") return "bg-yellow-500/15 text-yellow-300";
  if (match.confidence === "rejected") return "bg-red-500/15 text-red-300";

  return "bg-slate-500/15 text-slate-300";
}

function getPaymentStatusBadgeClass(paymentStatus?: string | null) {
  if (paymentStatus === "paid") return "bg-green-500/15 text-green-300";
  if (paymentStatus === "payment_failed") return "bg-red-500/15 text-red-300";
  if (paymentStatus === "cancelled") return "bg-slate-700 text-slate-300";
  return "bg-white/10 text-slate-400";
}

function formatClientValue(value?: string | null) {
  return value || "Not available";
}

function buildGoogleMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function formatClientTimestamp(value?: string | null) {
  return value ? formatTimestamp(value) : "Not available";
}

function getReviewSource(lead: LeadWithGeneratedContent) {
  const reviews = lead.reviews || [];

  if (lead.reviewsSource === "google" && reviews.length > 0) {
    return {
      label: "Google reviews",
      badgeClass: "bg-green-500/15 text-green-300",
    };
  }

  if (reviews.length > 0) {
    return {
      label: "AI/fallback testimonials",
      badgeClass: "bg-yellow-500/15 text-yellow-300",
    };
  }

  return {
    label: "None",
    badgeClass: "bg-white/10 text-slate-400",
  };
}

function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

function getBrandedPaymentUrl(lead: LeadWithGeneratedContent) {
  const appUrl = getAppUrl();
  const leadSlug = lead.slug || lead.id;

  return appUrl && leadSlug ? `${appUrl}/pay/${encodeURIComponent(leadSlug)}` : "";
}

function getCustomerPreviewUrl(lead: LeadWithGeneratedContent) {
  return buildCustomerPreviewUrl(lead, getAppUrl());
}

function getInterestedReplyPersonalization(
  lead: LeadWithGeneratedContent
): InterestedReplyPersonalization {
  return {
    businessName: lead.businessName,
    previewUrl: getCustomerPreviewUrl(lead),
    trade: lead.trade,
  };
}

function looksLikeInterestedReply(message?: LeadMessage | null) {
  if (!message || message.direction !== "inbound") return false;

  return /\b(interested|yes|send it|looks good|how much|price|cost|go ahead|set it up)\b/i.test(
    message.body || ""
  );
}

function looksLikePaymentReadyReply(message?: LeadMessage | null) {
  if (!message || message.direction !== "inbound") return false;

  return /\b(yes|go ahead|sounds good|let'?s do it|send link|payment link|ready|set it up)\b/i.test(
    message.body || ""
  );
}

function getLeadMessageMetadataString(
  message: LeadMessage,
  field: "bounceReason" | "bouncedEmail"
) {
  const metadata = message.metadata || {};
  const value = metadata[field];

  return typeof value === "string" ? value : "";
}

function getLeadMessageStatusLabel(status: LeadMessage["status"]) {
  if (status === "sent") return "Sent";
  if (status === "delivered") return "Delivered";
  if (status === "bounced") return "Bounced";
  if (status === "received") return "Received";
  if (status === "failed") return "Failed";

  return "Draft";
}

function getLeadMessageStatusBadgeClass(status: LeadMessage["status"]) {
  if (status === "sent") return "bg-green-500/15 text-green-300";
  if (status === "delivered") return "bg-emerald-500/15 text-emerald-300";
  if (status === "bounced") return "bg-rose-500/15 text-rose-300";
  if (status === "received") return "bg-cyan-500/15 text-cyan-300";
  if (status === "failed") return "bg-red-500/15 text-red-300";

  return "bg-white/10 text-slate-400";
}

function getTimeline(messages: LeadMessage[], callbacks: CallbackRequest[]) {
  return [
    ...messages.map((message) => ({
      type: "message" as const,
      id: `message-${message.id || message.createdAt}`,
      createdAt: message.createdAt,
      message,
    })),
    ...callbacks.map((callback) => ({
      type: "callback" as const,
      id: `callback-${callback.id || callback.createdAt}`,
      createdAt: callback.createdAt,
      callback,
    })),
  ].sort((a, b) => {
    const aTime = new Date(a.createdAt || "").getTime();
    const bTime = new Date(b.createdAt || "").getTime();

    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  }) satisfies TimelineItem[];
}

function normalizeWebsite(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return `https://${trimmed}`;
}

function isPreviewableImageUrl(value?: string | null) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function getLeadSiteDesign(lead: LeadWithGeneratedContent | null) {
  const design = lead?.design || {};
  const generatedSiteDesign = lead?.generated_site_design || {};
  const legacyAccent =
    design.accentTextColor ||
    generatedSiteDesign.accent_text_color ||
    DEFAULT_ACCENT_TEXT_COLOR;

  return {
    buttonColor:
      design.buttonColor ||
      generatedSiteDesign.button_color ||
      DEFAULT_BUTTON_COLOR,
    buttonTextColor:
      design.buttonTextColor ||
      generatedSiteDesign.button_text_color ||
      DEFAULT_BUTTON_TEXT_COLOR,
    heroAccentColor:
      design.heroAccentColor ||
      generatedSiteDesign.hero_accent_color ||
      legacyAccent ||
      DEFAULT_HERO_ACCENT_COLOR,
    bodyAccentColor:
      design.bodyAccentColor ||
      generatedSiteDesign.body_accent_color ||
      legacyAccent ||
      DEFAULT_BODY_ACCENT_COLOR,
    serviceAreaCardColor:
      design.serviceAreaCardColor ||
      generatedSiteDesign.service_area_card_color ||
      DEFAULT_SERVICE_AREA_CARD_COLOR,
    footerBackgroundColor:
      design.footerBackgroundColor ||
      generatedSiteDesign.footer_background_color ||
      DEFAULT_FOOTER_BACKGROUND_COLOR,
  };
}

function normalizeEmail(value: string) {
  return value.trim();
}

function normalizePhone(value: string) {
  return value.trim();
}

function normalizeTemplateTrade(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (templateTradeOptions.includes(normalized)) return normalized;
  if (
    normalized.includes("plumb") &&
    (normalized.includes("gas") || normalized.includes("fitting"))
  ) {
    return "plumbing-gas-fitting";
  }
  if (normalized.includes("plumb")) return "plumber";
  if (normalized.includes("electric")) return "electrician";
  if (normalized.includes("build")) return "builder";
  if (normalized.includes("clean")) return "cleaner";
  if (normalized.includes("landscap")) return "landscaper";
  if (normalized.includes("roof")) return "roofer";
  if (normalized.includes("paint")) return "painter";
  if (normalized.includes("mechanic")) return "mechanic";

  return "plumber";
}

function formatTemplateTradeLabel(value: string) {
  if (value === "plumbing-gas-fitting") return "Plumbing and Gas Fitting";

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTemplateTypeLabel(value: string) {
  if (value === "hero-image-led") return "Hero Image Led";

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getYellowPagesUrl(lead?: LeadWithGeneratedContent | null) {
  if (!lead) return "";

  if (
    lead.yellow_pages &&
    Object.prototype.hasOwnProperty.call(
      lead.yellow_pages,
      "manual_listing_url"
    ) &&
    typeof lead.yellow_pages.manual_listing_url === "string"
  ) {
    return lead.yellow_pages.manual_listing_url;
  }

  return (
    lead.yellow_pages?.listing_url ||
    lead.yellow_pages?.url ||
    lead.yellow_pages_url ||
    ""
  );
}

function getSelectedServiceModifiers(lead?: LeadWithGeneratedContent | null) {
  const modifiers = lead?.trade_profile?.service_modifiers || [];

  return modifiers.filter((modifier): modifier is ServiceModifier =>
    serviceModifiers.includes(modifier as ServiceModifier)
  );
}

function buildManualTradeProfile(
  lead: LeadWithGeneratedContent,
  selectedModifiers: ServiceModifier[],
  templateTrade: string
) {
  const existingProfile = lead.trade_profile;
  const secondaryTrades = Array.from(
    new Set([
      ...(existingProfile?.secondary_trades || []),
      ...selectedModifiers,
    ])
  );

  return {
    primary_trade:
      existingProfile?.primary_trade || normalizeTemplateTrade(lead.trade),
    template_profile:
      templateTrade ||
      existingProfile?.template_profile ||
      normalizeTemplateTrade(lead.trade),
    secondary_trades: secondaryTrades,
    service_modifiers: selectedModifiers,
    manual_service_modifiers: true,
  };
}

function isAllowedHeroImageFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  return heroImageTypes.has(file.type) && heroImageExtensions.has(extension);
}

function getLatestLeadMessageTime(
  messages: LeadMessage[],
  direction: "inbound" | "outbound"
) {
  return messages.reduce((latest, message) => {
    if (message.direction !== direction || !message.createdAt) return latest;

    const timestamp = new Date(message.createdAt).getTime();

    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
}

export default function LeadDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: LeadDetailTabId = isLeadDetailTabId(tabParam)
    ? tabParam
    : "business-info";
  const [lead, setLead] = useState<LeadWithGeneratedContent | null>(null);
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStage, setUpdatingStage] = useState("");
  const [savingForwarding, setSavingForwarding] = useState(false);
  const [outreachChannel, setOutreachChannel] =
    useState<OutreachChannel>("sms");
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailOfferBody, setEmailOfferBody] = useState("");
  const [smsBodyEdited, setSmsBodyEdited] = useState(false);
  const [emailSubjectEdited, setEmailSubjectEdited] = useState(false);
  const [emailBodyEdited, setEmailBodyEdited] = useState(false);
  const [sendingOffer, setSendingOffer] = useState("");
  const [outreachNotice, setOutreachNotice] = useState("");
  const [outreachError, setOutreachError] = useState("");
  const [preparingFollowUp, setPreparingFollowUp] =
    useState<FollowUpStage | null>(null);
  const [pendingFollowUpMetadata, setPendingFollowUpMetadata] =
    useState<PendingFollowUpMetadata | null>(null);
  const [followUpNotice, setFollowUpNotice] = useState("");
  const [followUpError, setFollowUpError] = useState("");
  const [closeReplyNotice, setCloseReplyNotice] = useState("");
  const [closeReplyError, setCloseReplyError] = useState("");
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false);
  const [paymentReplyNotice, setPaymentReplyNotice] = useState("");
  const [paymentReplyError, setPaymentReplyError] = useState("");
  const [callbackForwardingEnabled, setCallbackForwardingEnabled] =
    useState(false);
  const [callbackForwardToEmail, setCallbackForwardToEmail] = useState("");
  const [callbackForwardToPhone, setCallbackForwardToPhone] = useState("");
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [heroImageUploadNotice, setHeroImageUploadNotice] = useState("");
  const [heroImageUploadError, setHeroImageUploadError] = useState("");
  const [siteHeroImageUrl, setSiteHeroImageUrl] = useState("");
  const [savingSiteHeroImage, setSavingSiteHeroImage] = useState(false);
  const [siteHeroImageNotice, setSiteHeroImageNotice] = useState("");
  const [siteHeroImageError, setSiteHeroImageError] = useState("");
  const [mobileHeroImageFile, setMobileHeroImageFile] = useState<File | null>(
    null
  );
  const [uploadingMobileHeroImage, setUploadingMobileHeroImage] =
    useState(false);
  const [mobileHeroImageUploadNotice, setMobileHeroImageUploadNotice] =
    useState("");
  const [mobileHeroImageUploadError, setMobileHeroImageUploadError] =
    useState("");
  const [mobileHeroImageUrl, setMobileHeroImageUrl] = useState("");
  const [savingMobileHeroImage, setSavingMobileHeroImage] = useState(false);
  const [mobileHeroImageNotice, setMobileHeroImageNotice] = useState("");
  const [mobileHeroImageError, setMobileHeroImageError] = useState("");
  const [brandingImageFile, setBrandingImageFile] = useState<File | null>(null);
  const [uploadingBrandingImage, setUploadingBrandingImage] = useState(false);
  const [brandingImageUploadNotice, setBrandingImageUploadNotice] =
    useState("");
  const [brandingImageUploadError, setBrandingImageUploadError] = useState("");
  const [siteBrandingUrl, setSiteBrandingUrl] = useState("");
  const [savingSiteBranding, setSavingSiteBranding] = useState(false);
  const [siteBrandingNotice, setSiteBrandingNotice] = useState("");
  const [siteBrandingError, setSiteBrandingError] = useState("");
  const [siteIconFile, setSiteIconFile] = useState<File | null>(null);
  const [uploadingSiteIcon, setUploadingSiteIcon] = useState(false);
  const [siteIconUploadNotice, setSiteIconUploadNotice] = useState("");
  const [siteIconUploadError, setSiteIconUploadError] = useState("");
  const [siteIconUrl, setSiteIconUrl] = useState("");
  const [savingSiteIcon, setSavingSiteIcon] = useState(false);
  const [siteIconNotice, setSiteIconNotice] = useState("");
  const [siteIconError, setSiteIconError] = useState("");
  const [buttonColor, setButtonColor] = useState(DEFAULT_BUTTON_COLOR);
  const [buttonTextColor, setButtonTextColor] = useState(
    DEFAULT_BUTTON_TEXT_COLOR
  );
  const [heroAccentColor, setHeroAccentColor] = useState(
    DEFAULT_HERO_ACCENT_COLOR
  );
  const [bodyAccentColor, setBodyAccentColor] = useState(
    DEFAULT_BODY_ACCENT_COLOR
  );
  const [serviceAreaCardColor, setServiceAreaCardColor] = useState(
    DEFAULT_SERVICE_AREA_CARD_COLOR
  );
  const [footerBackgroundColor, setFooterBackgroundColor] = useState(
    DEFAULT_FOOTER_BACKGROUND_COLOR
  );
  const [savingSiteDesign, setSavingSiteDesign] = useState(false);
  const [siteDesignNotice, setSiteDesignNotice] = useState("");
  const [siteDesignError, setSiteDesignError] = useState("");
  const [contactDraft, setContactDraft] = useState({
    trade: "",
    city: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    yellowPagesUrl: "",
    contactPage: "",
    displayName: "",
    facebook: "",
    instagram: "",
  });
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [redoingOpportunity, setRedoingOpportunity] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");
  const [mobilePreviewRefreshSignal, setMobilePreviewRefreshSignal] =
    useState(0);

  function handleTabChange(tabId: LeadDetailTabId) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", tabId);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }
  const [templateTrade, setTemplateTrade] = useState("plumber");
  const [templateType, setTemplateType] = useState("modern");
  const [selectedServiceModifiers, setSelectedServiceModifiers] = useState<
    ServiceModifier[]
  >([]);
  const [savingServiceModifiers, setSavingServiceModifiers] = useState(false);
  const [serviceModifierNotice, setServiceModifierNotice] = useState("");
  const [serviceModifierError, setServiceModifierError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLead() {
      const res = await fetch(`/api/leads/${slug}`, {
        cache: "no-store",
      });

      if (!active) return;

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!active) return;

      const loadedLead = data.lead as LeadWithGeneratedContent;

      setLead(loadedLead);
      setTemplateTrade(
        loadedLead.templateTrade || normalizeTemplateTrade(loadedLead.trade)
      );
      setTemplateType(
        templateTypeOptions.includes(loadedLead.templateType || "")
          ? loadedLead.templateType || "modern"
          : "modern"
      );
      setSelectedServiceModifiers(getSelectedServiceModifiers(loadedLead));
      setCallbacks(data.callbacks || []);
      setContactDraft({
        trade: loadedLead.trade || "",
        city: loadedLead.city || "",
        address: loadedLead.address || loadedLead.formattedAddress || "",
        phone: loadedLead.phone || "",
        email: loadedLead.email || "",
        website: loadedLead.website || "",
        yellowPagesUrl: getYellowPagesUrl(loadedLead),
        contactPage: loadedLead.contactPage || "",
        displayName:
          loadedLead.displayName ||
          loadedLead.businessName ||
          loadedLead.name ||
          "",
        facebook: loadedLead.facebook || "",
        instagram: loadedLead.instagram || "",
      });
      setSiteHeroImageUrl(loadedLead.heroImageUrl || "");
      setMobileHeroImageUrl(loadedLead.mobileHeroImageUrl || "");
      setSiteBrandingUrl(loadedLead.siteBrandingUrl || "");
      setSiteIconUrl(loadedLead.siteIconUrl || "");
      const siteDesign = getLeadSiteDesign(loadedLead);
      setButtonColor(siteDesign.buttonColor);
      setButtonTextColor(siteDesign.buttonTextColor);
      setHeroAccentColor(siteDesign.heroAccentColor);
      setBodyAccentColor(siteDesign.bodyAccentColor);
      setServiceAreaCardColor(siteDesign.serviceAreaCardColor);
      setFooterBackgroundColor(siteDesign.footerBackgroundColor);
      setSmsTo(loadedLead.phone || "");
      setSmsBody(buildOpportunitySms(loadedLead, getCustomerPreviewUrl(loadedLead)));
      setSmsBodyEdited(false);
      setEmailTo(loadedLead.email || "");
      setEmailSubject(buildOpportunityEmailSubject(loadedLead));
      setEmailSubjectEdited(false);
      setEmailOfferBody(
        buildOpportunityEmail(loadedLead, getCustomerPreviewUrl(loadedLead))
      );
      setEmailBodyEdited(false);
      setCallbackForwardingEnabled(
        Boolean(data.lead?.callbackForwardingEnabled)
      );
      setCallbackForwardToEmail(data.lead?.callbackForwardToEmail || "");
      setCallbackForwardToPhone(data.lead?.callbackForwardToPhone || "");

      const messagesRes = await fetch(`/api/leads/${slug}/messages`, {
        cache: "no-store",
      });

      if (messagesRes.ok && active) {
        const messagesData = await messagesRes.json();

        setMessages(messagesData.messages || []);
        setCallbacks(messagesData.callbacks || data.callbacks || []);
      }

      setLoading(false);
    }

    void loadLead();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;

    async function markRepliesRead() {
      try {
        const res = await fetch(`/api/leads/${slug}/messages/read`, {
          method: "POST",
        });

        if (!res.ok || !active) return;

        const now = new Date().toISOString();

        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.direction === "inbound" && !message.readAt
              ? { ...message, readAt: now }
              : message
          )
        );
      } catch (error) {
        console.error("Failed to mark replies read:", error);
      }
    }

    void markRepliesRead();

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading lead...
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Lead not found.
      </main>
    );
  }

  const leadName = getLeadName(lead);
  const handleLeadUpdated = (updatedLead: Lead) => {
    const nextLead = updatedLead as LeadWithGeneratedContent;

    setLead(nextLead);
    setTemplateTrade(
      nextLead.templateTrade || normalizeTemplateTrade(nextLead.trade)
    );
    setTemplateType(
      templateTypeOptions.includes(nextLead.templateType || "")
        ? nextLead.templateType || "modern"
        : "modern"
    );
    setSelectedServiceModifiers(getSelectedServiceModifiers(nextLead));
    setSiteHeroImageUrl(nextLead.heroImageUrl || "");
    setMobileHeroImageUrl(nextLead.mobileHeroImageUrl || "");
    setSiteBrandingUrl(nextLead.siteBrandingUrl || "");
    setSiteIconUrl(nextLead.siteIconUrl || "");
    const siteDesign = getLeadSiteDesign(nextLead);
    setButtonColor(siteDesign.buttonColor);
    setButtonTextColor(siteDesign.buttonTextColor);
    setHeroAccentColor(siteDesign.heroAccentColor);
    setBodyAccentColor(siteDesign.bodyAccentColor);
    setServiceAreaCardColor(siteDesign.serviceAreaCardColor);
    setFooterBackgroundColor(siteDesign.footerBackgroundColor);

    if (!smsBodyEdited) {
      setSmsBody(buildOpportunitySms(nextLead, getCustomerPreviewUrl(nextLead)));
    }

    if (!emailSubjectEdited) {
      setEmailSubject(buildOpportunityEmailSubject(nextLead));
    }

    if (!emailBodyEdited) {
      setEmailOfferBody(
        buildOpportunityEmail(nextLead, getCustomerPreviewUrl(nextLead))
      );
    }
  };
  const handleGeneratedSiteUpdated = (updatedLead: Lead) => {
    handleLeadUpdated(updatedLead);
    setMobilePreviewRefreshSignal((current) => current + 1);
  };
  const saveServiceModifiers = async (modifiers: ServiceModifier[]) => {
    setSavingServiceModifiers(true);
    setServiceModifierNotice("");
    setServiceModifierError("");

    try {
      const tradeProfile = buildManualTradeProfile(
        lead,
        modifiers,
        templateTrade
      );
      const res = await fetch(`/api/leads/${lead.slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateTrade,
          templateType,
          trade_profile: tradeProfile,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save service modifiers");
      }

      if (data.lead) {
        handleLeadUpdated(data.lead);
      } else {
        setLead((current) =>
          current
            ? {
                ...current,
                templateTrade,
                templateType,
                trade_profile: tradeProfile,
              }
            : current
        );
      }

      setServiceModifierNotice(
        modifiers.length
          ? "Service modifiers saved."
          : "No modifiers saved as a manual override."
      );
    } catch (error) {
      setServiceModifierError(
        error instanceof Error
          ? error.message
          : "Failed to save service modifiers"
      );
      setSelectedServiceModifiers(getSelectedServiceModifiers(lead));
    } finally {
      setSavingServiceModifiers(false);
    }
  };
  const toggleServiceModifier = (modifier: ServiceModifier) => {
    const nextModifiers = selectedServiceModifiers.includes(modifier)
      ? selectedServiceModifiers.filter((selected) => selected !== modifier)
      : [...selectedServiceModifiers, modifier];

    setSelectedServiceModifiers(nextModifiers);
    void saveServiceModifiers(nextModifiers);
  };
  const clearServiceModifiers = () => {
    setSelectedServiceModifiers([]);
    void saveServiceModifiers([]);
  };
  const handleOutreachChannelChange = (channel: OutreachChannel) => {
    setPendingFollowUpMetadata(null);
    setOutreachChannel(channel);

    if (!lead) return;

    if (channel === "sms" && !smsBodyEdited) {
      setSmsBody(buildOpportunitySms(lead, getCustomerPreviewUrl(lead)));
    }

    if (channel === "email") {
      if (!emailSubjectEdited) {
        setEmailSubject(buildOpportunityEmailSubject(lead));
      }

      if (!emailBodyEdited) {
        setEmailOfferBody(buildOpportunityEmail(lead, getCustomerPreviewUrl(lead)));
      }
    }
  };
  const handleRedoWebsiteOpportunity = async () => {
    if (!lead) return;

    setRedoingOpportunity(true);
    setOpportunityError("");

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: lead.slug || lead.id,
          website: lead.website || "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to redo website opportunity");
      }

      const refreshRes = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        cache: "no-store",
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();

        if (refreshData.lead) {
          handleLeadUpdated(refreshData.lead);
          return;
        }
      }

      if (data.lead) {
        handleLeadUpdated(data.lead);
      }
    } catch (error) {
      setOpportunityError(
        error instanceof Error
          ? error.message
          : "Failed to redo website opportunity"
      );
    } finally {
      setRedoingOpportunity(false);
    }
  };
  const handleStartContactEdit = () => {
    if (!lead) return;

    setContactDraft({
      trade: lead.trade || "",
      city: lead.city || "",
      address: lead.address || lead.formattedAddress || "",
      phone: lead.phone || "",
      email: lead.email || "",
      website: lead.website || "",
      yellowPagesUrl: getYellowPagesUrl(lead),
      contactPage: lead.contactPage || "",
      displayName: lead.displayName || lead.businessName || lead.name || "",
      facebook: lead.facebook || "",
      instagram: lead.instagram || "",
    });
    setContactError("");
    setIsEditingContact(true);
  };
  const handleCancelContactEdit = () => {
    if (lead) {
      setContactDraft({
        trade: lead.trade || "",
        city: lead.city || "",
        address: lead.address || lead.formattedAddress || "",
        phone: lead.phone || "",
        email: lead.email || "",
        website: lead.website || "",
        yellowPagesUrl: getYellowPagesUrl(lead),
        contactPage: lead.contactPage || "",
        displayName: lead.displayName || lead.businessName || lead.name || "",
        facebook: lead.facebook || "",
        instagram: lead.instagram || "",
      });
    }

    setContactError("");
    setIsEditingContact(false);
  };
  const handleHeroImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    setHeroImageUploadNotice("");
    setHeroImageUploadError("");

    if (!file) {
      setHeroImageFile(null);
      return;
    }

    if (!isAllowedHeroImageFile(file)) {
      setHeroImageFile(null);
      event.target.value = "";
      setHeroImageUploadError("Upload a JPG, PNG or WebP desktop hero image.");
      return;
    }

    if (file.size > HERO_IMAGE_MAX_BYTES) {
      setHeroImageFile(null);
      event.target.value = "";
      setHeroImageUploadError("Desktop hero image must be 5MB or smaller.");
      return;
    }

    setHeroImageFile(file);
  };
  const handleMobileHeroImageFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;

    setMobileHeroImageUploadNotice("");
    setMobileHeroImageUploadError("");

    if (!file) {
      setMobileHeroImageFile(null);
      return;
    }

    if (!isAllowedHeroImageFile(file)) {
      setMobileHeroImageFile(null);
      event.target.value = "";
      setMobileHeroImageUploadError("Upload a JPG, PNG or WebP mobile hero image.");
      return;
    }

    if (file.size > HERO_IMAGE_MAX_BYTES) {
      setMobileHeroImageFile(null);
      event.target.value = "";
      setMobileHeroImageUploadError("Mobile hero image must be 5MB or smaller.");
      return;
    }

    setMobileHeroImageFile(file);
  };
  const handleBrandingImageFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;

    setBrandingImageUploadNotice("");
    setBrandingImageUploadError("");

    if (!file) {
      setBrandingImageFile(null);
      return;
    }

    if (!isAllowedHeroImageFile(file)) {
      setBrandingImageFile(null);
      event.target.value = "";
      setBrandingImageUploadError("Upload a JPG, PNG or WebP branding image.");
      return;
    }

    if (file.size > BRANDING_IMAGE_MAX_BYTES) {
      setBrandingImageFile(null);
      event.target.value = "";
      setBrandingImageUploadError("Branding image must be 2MB or smaller.");
      return;
    }

    setBrandingImageFile(file);
  };
  const handleSiteIconFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    setSiteIconUploadNotice("");
    setSiteIconUploadError("");

    if (!file) {
      setSiteIconFile(null);
      return;
    }

    if (!isAllowedHeroImageFile(file)) {
      setSiteIconFile(null);
      event.target.value = "";
      setSiteIconUploadError("Upload a PNG, JPG or WebP site icon.");
      return;
    }

    if (file.size > SITE_ICON_IMAGE_MAX_BYTES) {
      setSiteIconFile(null);
      event.target.value = "";
      setSiteIconUploadError("Site icon must be 2MB or smaller.");
      return;
    }

    setSiteIconFile(file);
  };
  const handleUploadBrandingImage = async () => {
    if (!lead) {
      setBrandingImageUploadError(
        "Load a lead before uploading a branding image."
      );
      return;
    }

    if (!brandingImageFile) {
      setBrandingImageUploadError("Choose a branding image to upload first.");
      return;
    }

    setUploadingBrandingImage(true);
    setBrandingImageUploadNotice("Uploading branding image...");
    setBrandingImageUploadError("");
    setSiteBrandingNotice("");
    setSiteBrandingError("");

    try {
      const formData = new FormData();
      formData.append("file", brandingImageFile);

      const res = await fetch(`/api/leads/${lead.slug || lead.id}/site-branding`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload branding image");
      }

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

      if (!imageUrl) {
        throw new Error("Upload succeeded but no public image URL was returned.");
      }

      setSiteBrandingUrl(imageUrl);
      setBrandingImageFile(null);
      setBrandingImageUploadNotice(
        "Branding image uploaded. Save the branding URL to keep it."
      );
    } catch (error) {
      setBrandingImageUploadNotice("");
      setBrandingImageUploadError(
        error instanceof Error
          ? error.message
          : "Failed to upload branding image"
      );
    } finally {
      setUploadingBrandingImage(false);
    }
  };
  const handleUploadHeroImage = async () => {
    if (!lead) {
      setHeroImageUploadError("Load a lead before uploading a desktop hero image.");
      return;
    }

    if (!heroImageFile) {
      setHeroImageUploadError("Choose a desktop hero image to upload first.");
      return;
    }

    setUploadingHeroImage(true);
    setHeroImageUploadNotice("Uploading desktop hero image...");
    setHeroImageUploadError("");
    setSiteHeroImageNotice("");
    setSiteHeroImageError("");

    try {
      const formData = new FormData();
      formData.append("file", heroImageFile);

      const res = await fetch(`/api/leads/${lead.slug || lead.id}/hero-image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload desktop hero image");
      }

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

      if (!imageUrl) {
        throw new Error("Upload succeeded but no public image URL was returned.");
      }

      setSiteHeroImageUrl(imageUrl);
      setHeroImageFile(null);
      setHeroImageUploadNotice(
        "Desktop hero image uploaded. Save the desktop hero image URL to keep it."
      );
    } catch (error) {
      setHeroImageUploadNotice("");
      setHeroImageUploadError(
        error instanceof Error
          ? error.message
          : "Failed to upload desktop hero image"
      );
    } finally {
      setUploadingHeroImage(false);
    }
  };
  const handleUploadMobileHeroImage = async () => {
    if (!lead) {
      setMobileHeroImageUploadError(
        "Load a lead before uploading a mobile hero image."
      );
      return;
    }

    if (!mobileHeroImageFile) {
      setMobileHeroImageUploadError("Choose a mobile hero image to upload first.");
      return;
    }

    setUploadingMobileHeroImage(true);
    setMobileHeroImageUploadNotice("Uploading mobile hero image...");
    setMobileHeroImageUploadError("");
    setMobileHeroImageNotice("");
    setMobileHeroImageError("");

    try {
      const formData = new FormData();
      formData.append("file", mobileHeroImageFile);

      const res = await fetch(
        `/api/leads/${lead.slug || lead.id}/hero-image?variant=mobile`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload mobile hero image");
      }

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

      if (!imageUrl) {
        throw new Error("Upload succeeded but no public image URL was returned.");
      }

      setMobileHeroImageUrl(imageUrl);
      setMobileHeroImageFile(null);
      setMobileHeroImageUploadNotice(
        "Mobile hero image uploaded. Save the mobile hero image URL to keep it."
      );
    } catch (error) {
      setMobileHeroImageUploadNotice("");
      setMobileHeroImageUploadError(
        error instanceof Error
          ? error.message
          : "Failed to upload mobile hero image"
      );
    } finally {
      setUploadingMobileHeroImage(false);
    }
  };
  const handleUploadSiteIcon = async () => {
    if (!lead) {
      setSiteIconUploadError("Load a lead before uploading a site icon.");
      return;
    }

    if (!siteIconFile) {
      setSiteIconUploadError("Choose a site icon to upload first.");
      return;
    }

    setUploadingSiteIcon(true);
    setSiteIconUploadNotice("Uploading site icon...");
    setSiteIconUploadError("");
    setSiteIconNotice("");
    setSiteIconError("");

    try {
      const formData = new FormData();
      formData.append("file", siteIconFile);

      const res = await fetch(`/api/leads/${lead.slug || lead.id}/site-icon`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload site icon");
      }

      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";

      if (!imageUrl) {
        throw new Error("Upload succeeded but no public image URL was returned.");
      }

      setSiteIconUrl(imageUrl);
      setSiteIconFile(null);
      setSiteIconUploadNotice("Site icon uploaded. Save the site icon URL to keep it.");
    } catch (error) {
      setSiteIconUploadNotice("");
      setSiteIconUploadError(
        error instanceof Error ? error.message : "Failed to upload site icon"
      );
    } finally {
      setUploadingSiteIcon(false);
    }
  };
  const handleSaveSiteBranding = async () => {
    if (!lead) return;

    const nextSiteBrandingUrl = normalizeWebsite(siteBrandingUrl);

    setSavingSiteBranding(true);
    setSiteBrandingNotice("");
    setSiteBrandingError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteBrandingUrl: nextSiteBrandingUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save site branding");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setSiteBrandingUrl(updatedLead.siteBrandingUrl || "");
      setSiteBrandingNotice("Site branding saved for future generated sites.");
      setBrandingImageUploadNotice("");
    } catch (error) {
      setSiteBrandingError(
        error instanceof Error ? error.message : "Failed to save site branding"
      );
    } finally {
      setSavingSiteBranding(false);
    }
  };
  const handleSaveSiteHeroImage = async () => {
    if (!lead) return;

    const nextHeroImageUrl = normalizeWebsite(siteHeroImageUrl);

    setSavingSiteHeroImage(true);
    setSiteHeroImageNotice("");
    setSiteHeroImageError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          heroImageUrl: nextHeroImageUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save desktop hero image");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setSiteHeroImageUrl(updatedLead.heroImageUrl || "");
      setSiteHeroImageNotice(
        "Desktop hero image saved for future generated sites."
      );
      setHeroImageUploadNotice("");
    } catch (error) {
      setSiteHeroImageError(
        error instanceof Error ? error.message : "Failed to save desktop hero image"
      );
    } finally {
      setSavingSiteHeroImage(false);
    }
  };
  const handleSaveMobileHeroImage = async () => {
    if (!lead) return;

    const nextMobileHeroImageUrl = normalizeWebsite(mobileHeroImageUrl);

    setSavingMobileHeroImage(true);
    setMobileHeroImageNotice("");
    setMobileHeroImageError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mobileHeroImageUrl: nextMobileHeroImageUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save mobile hero image");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setMobileHeroImageUrl(updatedLead.mobileHeroImageUrl || "");
      setMobileHeroImageNotice(
        "Mobile hero image saved for future generated sites."
      );
      setMobileHeroImageUploadNotice("");
    } catch (error) {
      setMobileHeroImageError(
        error instanceof Error ? error.message : "Failed to save mobile hero image"
      );
    } finally {
      setSavingMobileHeroImage(false);
    }
  };
  const handleSaveSiteIcon = async () => {
    if (!lead) return;

    const nextSiteIconUrl = normalizeWebsite(siteIconUrl);

    setSavingSiteIcon(true);
    setSiteIconNotice("");
    setSiteIconError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteIconUrl: nextSiteIconUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save site icon");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setSiteIconUrl(updatedLead.siteIconUrl || "");
      setSiteIconNotice("Site icon saved.");
      setSiteIconUploadNotice("");
    } catch (error) {
      setSiteIconError(
        error instanceof Error ? error.message : "Failed to save site icon"
      );
    } finally {
      setSavingSiteIcon(false);
    }
  };
  const handleSaveSiteDesign = async () => {
    if (!lead) return;

    if (
      !isHexColor(buttonColor) ||
      !isHexColor(buttonTextColor) ||
      !isHexColor(heroAccentColor) ||
      !isHexColor(bodyAccentColor) ||
      !isHexColor(serviceAreaCardColor) ||
      !isHexColor(footerBackgroundColor)
    ) {
      setSiteDesignError("Choose valid hex colours before saving.");
      return;
    }

    setSavingSiteDesign(true);
    setSiteDesignNotice("");
    setSiteDesignError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}/site-design`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          buttonColor,
          buttonTextColor,
          heroAccentColor,
          bodyAccentColor,
          serviceAreaCardColor,
          footerBackgroundColor,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save design controls");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      const siteDesign = getLeadSiteDesign(updatedLead);
      setButtonColor(siteDesign.buttonColor);
      setButtonTextColor(siteDesign.buttonTextColor);
      setHeroAccentColor(siteDesign.heroAccentColor);
      setBodyAccentColor(siteDesign.bodyAccentColor);
      setServiceAreaCardColor(siteDesign.serviceAreaCardColor);
      setFooterBackgroundColor(siteDesign.footerBackgroundColor);
      setSiteDesignNotice(
        data.generatedSite
          ? "Design saved and preview updated."
          : "Design saved. Generate a site to see it in the preview."
      );
    } catch (error) {
      setSiteDesignError(
        error instanceof Error ? error.message : "Failed to save design controls"
      );
    } finally {
      setSavingSiteDesign(false);
    }
  };
  const handleSaveContactEdit = async () => {
    if (!lead) return;

    const nextTrade = contactDraft.trade.trim();
    const nextCity = contactDraft.city.trim();
    const nextAddress = contactDraft.address.trim();
    const nextPhone = normalizePhone(contactDraft.phone);
    const nextEmail = normalizeEmail(contactDraft.email);
    const nextWebsite = normalizeWebsite(contactDraft.website);
    const nextYellowPagesUrl = normalizeWebsite(contactDraft.yellowPagesUrl);
    const nextContactPage = normalizeWebsite(contactDraft.contactPage);
    const nextDisplayName = contactDraft.displayName.trim();
    const nextFacebook = normalizeWebsite(contactDraft.facebook);
    const nextInstagram = normalizeWebsite(contactDraft.instagram);

    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setContactError("Email looks invalid.");
      return;
    }

    setSavingContact(true);
    setContactError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trade: nextTrade,
          city: nextCity,
          address: nextAddress,
          phone: nextPhone,
          email: nextEmail,
          website: nextWebsite,
          yellowPagesUrl: nextYellowPagesUrl,
          contactPage: nextContactPage,
          displayName: nextDisplayName,
          facebook: nextFacebook,
          instagram: nextInstagram,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update contact fields");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setContactDraft({
        trade: updatedLead.trade || "",
        city: updatedLead.city || "",
        address: updatedLead.address || updatedLead.formattedAddress || "",
        phone: updatedLead.phone || "",
        email: updatedLead.email || "",
        website: updatedLead.website || "",
        yellowPagesUrl: getYellowPagesUrl(updatedLead),
        contactPage: updatedLead.contactPage || "",
        displayName:
          updatedLead.displayName ||
          updatedLead.businessName ||
          updatedLead.name ||
          "",
        facebook: updatedLead.facebook || "",
        instagram: updatedLead.instagram || "",
      });
      setSiteHeroImageUrl(updatedLead.heroImageUrl || "");
      setMobileHeroImageUrl(updatedLead.mobileHeroImageUrl || "");
      setSiteBrandingUrl(updatedLead.siteBrandingUrl || "");
      setSiteIconUrl(updatedLead.siteIconUrl || "");
      setSmsTo(updatedLead.phone || "");
      setEmailTo(updatedLead.email || "");
      setIsEditingContact(false);
    } catch (error) {
      setContactError(
        error instanceof Error
          ? error.message
          : "Failed to update contact fields"
      );
    } finally {
      setSavingContact(false);
    }
  };
  const handleSaveForwarding = async () => {
    if (!lead) return;

    setSavingForwarding(true);

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callbackForwardingEnabled,
          callbackForwardToEmail,
          callbackForwardToPhone,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update forwarding");
      }

      setLead(data.lead);
    } catch (error) {
      console.error("Failed to update callback forwarding:", error);
      alert("Failed to update callback forwarding.");
    } finally {
      setSavingForwarding(false);
    }
  };
  const handleStageChange = async (stage: LeadStage) => {
    if (!lead) return;
    if (stage === getLeadStage(lead)) return;

    setUpdatingStage(stage);

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage,
          reviewNotes: lead.reviewNotes || "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update lead");
      }

      setLead(data.lead);
    } catch (error) {
      console.error("Failed to update lead stage:", error);
      alert("Failed to update lead.");
    } finally {
      setUpdatingStage("");
    }
  };
  const handleOpenBillingPortal = async () => {
    if (!lead) return;

    setOpeningPortal(true);
    setPortalError("");

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: lead.id,
          slug: lead.slug || slug,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPortalError(
        error instanceof Error
          ? error.message
          : "Failed to open billing portal"
      );
    } finally {
      setOpeningPortal(false);
    }
  };
  const handleSendOffer = async (channel: OutreachChannel) => {
    if (!lead) return;

    const followUpMetadata =
      pendingFollowUpMetadata?.channel === channel
        ? {
            reason: pendingFollowUpMetadata.reason,
            follow_up_stage: pendingFollowUpMetadata.follow_up_stage,
          }
        : null;
    const payload =
      channel === "sms"
        ? {
            channel,
            to: smsTo,
            body: smsBody,
            metadata: followUpMetadata,
          }
        : {
            channel,
            to: emailTo,
            subject: emailSubject,
            body: emailOfferBody,
            metadata: followUpMetadata,
          };

    setSendingOffer(channel);
    setOutreachNotice("");
    setOutreachError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.message) {
        setMessages((current) => [data.message, ...current]);
      }

      if (data.lead) {
        setLead(data.lead);
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to send offer");
      }

      setOutreachNotice(
        followUpMetadata
          ? channel === "sms"
            ? "Follow-up SMS sent."
            : "Follow-up email sent."
          : channel === "sms"
            ? "SMS offer sent."
            : "Email offer sent."
      );
      setPendingFollowUpMetadata(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send offer";

      setOutreachError(message);
    } finally {
      setSendingOffer("");
    }
  };
  const handlePrepareFollowUp = (stage: FollowUpStage) => {
    if (!lead) return;

    const latestInbound = getLatestLeadMessageTime(messages, "inbound");
    const latestOutbound = getLatestLeadMessageTime(messages, "outbound");

    if (latestInbound > latestOutbound) {
      setFollowUpNotice("");
      setFollowUpError("Lead has replied since the last outbound message.");
      return;
    }

    setPreparingFollowUp(stage);
    setFollowUpNotice("");
    setFollowUpError("");

    const destination = getFollowUpDestination({
      latestOutboundChannel:
        outreachChannel || getLatestOutboundMessageChannel(messages),
      phone: lead.phone,
      email: lead.email,
    });

    if (!destination) {
      setFollowUpError(
        "Lead needs a valid Australian mobile number or email before follow-up."
      );
      setPreparingFollowUp(null);
      return;
    }

    const leadName = lead.name || lead.businessName || "";
    const followUpBody = buildFollowUpBody(stage, leadName, {
      businessName: lead.businessName,
      channel: destination.channel,
      previewUrl: getCustomerPreviewUrl(lead),
      websiteEvaluation: lead.websiteEvaluation,
      websiteOpportunity: lead.websiteOpportunity,
      websiteOpportunityV2: lead.website_opportunity_v2,
      engagement: {
        engagement_state: engagementState,
        total_open_count: totalOpenCount,
        total_click_count: totalPreviewClickCount,
        last_engaged_at: lastClickedAt || lastOpenedAt || "",
      },
    });
    const composerFollowUpBody =
      destination.channel === "email"
        ? appendEmailUnsubscribeFooter(followUpBody)
        : followUpBody;

    setOutreachChannel(destination.channel);
    setPendingFollowUpMetadata({
      reason: "manual_follow_up",
      follow_up_stage: stage,
      channel: destination.channel,
    });

    if (destination.channel === "sms") {
      setSmsTo(destination.to);
      setSmsBody(composerFollowUpBody);
      setSmsBodyEdited(true);
    } else {
      setEmailTo(destination.to);
      setEmailSubject("Quick follow-up from CallBoost");
      setEmailOfferBody(composerFollowUpBody);
      setEmailSubjectEdited(true);
      setEmailBodyEdited(true);
    }

    setOutreachError("");
    setOutreachNotice(
      stage === 3
        ? `Final follow-up loaded into the ${destination.channel === "sms" ? "SMS" : "email"} composer.`
        : `Follow-up ${stage} loaded into the ${
            destination.channel === "sms" ? "SMS" : "email"
          } composer.`
    );
    setFollowUpNotice("Review the prepared follow-up in Outreach before sending.");
    setPreparingFollowUp(null);
  };
  const handlePrepareEngagedReply = (replyType: EngagedReplyType) => {
    setCloseReplyNotice("");
    setCloseReplyError("");
    setPendingFollowUpMetadata(null);
    setOutreachChannel(outreachChannel);
    const personalization = getInterestedReplyPersonalization(lead);

    if (outreachChannel === "sms") {
      setSmsBody(
        replyType === "soft_check_in"
          ? buildEngagedSoftCheckInSms(personalization)
          : buildInterestedReplySms(personalization)
      );
      setSmsBodyEdited(true);
      setCloseReplyNotice(
        replyType === "soft_check_in"
          ? "Soft check-in SMS loaded into composer."
          : "Pricing-ready SMS loaded into composer."
      );
      return;
    }

    setEmailSubject(
      replyType === "soft_check_in"
        ? buildEngagedSoftCheckInEmailSubject(personalization)
        : buildInterestedReplyEmailSubject(personalization)
    );
    setEmailOfferBody(
      replyType === "soft_check_in"
        ? buildEngagedSoftCheckInEmail(personalization)
        : buildInterestedReplyEmail(personalization)
    );
    setEmailSubjectEdited(true);
    setEmailBodyEdited(true);
    setCloseReplyNotice(
      replyType === "soft_check_in"
        ? "Soft check-in email loaded into composer."
        : "Pricing-ready email loaded into composer."
    );
  };
  const handleGeneratePaymentReplyLink = async () => {
    if (!lead) return;

    setGeneratingPaymentLink(true);
    setPaymentReplyNotice("");
    setPaymentReplyError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: lead.id,
          slug: lead.slug || slug,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to generate payment link");
      }

      setCheckoutUrl(data.url);
      setPaymentReplyNotice("Payment link generated.");
    } catch (error) {
      setPaymentReplyError(
        error instanceof Error
          ? error.message
          : "Failed to generate payment link"
      );
    } finally {
      setGeneratingPaymentLink(false);
    }
  };
  const handlePreparePaymentReply = () => {
    const paymentLink = getBrandedPaymentUrl(lead);

    if (!checkoutUrl || !paymentLink) return;

    setPaymentReplyNotice("");
    setPaymentReplyError("");
    setPendingFollowUpMetadata(null);
    setOutreachChannel(outreachChannel);

    if (outreachChannel === "sms") {
      setSmsBody(buildPaymentSms(paymentLink));
      setSmsBodyEdited(true);
      setPaymentReplyNotice("Payment SMS loaded into composer.");
      return;
    }

    setEmailSubject(buildPaymentEmailSubject());
    setEmailOfferBody(buildPaymentEmail(paymentLink));
    setEmailSubjectEdited(true);
    setEmailBodyEdited(true);
    setPaymentReplyNotice("Payment email loaded into composer.");
  };
  const generatedDescription =
    lead.description || lead.solution || lead.subheadline || "";
  const leadStage = getLeadStage(lead);
  const isLeadArchived = leadStage === "archived";
  const leadStatusUpdatedAt = lead.statusUpdatedAt || lead.status_updated_at || "";
  const leadLastActivityAt = lead.lastActivityAt || lead.last_activity_at || "";
  const generatedSiteUrl = isLeadArchived ? "" : lead.generatedSiteUrl || "";
  const websiteEvaluation = lead.websiteEvaluation;
  const websiteOpportunityV2 =
    lead.website_opportunity_v2 ||
    (websiteEvaluation
      ? buildWebsiteOpportunityResult({
          website: lead.website,
          homepageHtml: "",
          socials: {
            facebook: lead.facebook,
            instagram: lead.instagram,
          },
          websiteEvaluation,
          yellowPagesUrl: getYellowPagesUrl(lead),
          otherPresenceUrls: [
            lead.business_presence?.primaryBusinessPresenceUrl || "",
            lead.business_presence?.sourceUrl || "",
            lead.business_presence?.originalWebsiteUrl || "",
          ],
          businessPresenceType:
            lead.business_presence?.primaryBusinessPresenceType ||
            lead.business_presence?.sourceType,
        })
      : null);
  const websiteOpportunityIssues = websiteOpportunityV2
    ? getWebsiteOpportunityVisibleIssues(websiteOpportunityV2)
    : [];
  const reviewSource = getReviewSource(lead);
  const reviewCount = lead.reviews?.length || 0;
  const leadAddress = (lead.address || lead.formattedAddress || "").trim();
  const googleMapsUrl = leadAddress ? buildGoogleMapsUrl(leadAddress) : "";
  const yellowPagesUrl = getYellowPagesUrl(lead);
  const tradeProfile = lead.trade_profile;
  const serviceModifierLabels =
    tradeProfile?.service_modifiers?.map(getServiceModifierLabel).filter(Boolean) ||
    [];
  const hasPageCopy =
    Boolean(lead.headline) ||
    Boolean(lead.subheadline) ||
    Boolean(lead.problems) ||
    Boolean(lead.solution);

  const timeline = getTimeline(messages, callbacks);
  const bouncedEmailMessages = messages.filter(
    (message) =>
      message.channel === "email" &&
      message.direction === "outbound" &&
      (message.status === "bounced" ||
        message.metadata?.deliveryStatus === "bounced")
  );
  const latestBouncedEmail = bouncedEmailMessages[0] || null;
  const bounceReason = latestBouncedEmail
    ? getLeadMessageMetadataString(latestBouncedEmail, "bounceReason") ||
      latestBouncedEmail.error
    : "";
  const hasMobileFollowUp = Boolean(lead.phone);
  const outboundMessages = messages.filter(
    (message) => message.direction === "outbound"
  );
  const totalOpenCount = outboundMessages.reduce(
    (sum, message) => sum + (message.openCount || 0),
    0
  );
  const totalPreviewClickCount = outboundMessages.reduce(
    (sum, message) => sum + (message.clickCount || 0),
    0
  );
  const lastOpenedAt = outboundMessages
    .map((message) => message.openedAt || "")
    .filter(Boolean)
    .sort()
    .at(-1);
  const lastClickedAt = outboundMessages
    .map((message) => message.clickedAt || "")
    .filter(Boolean)
    .sort()
    .at(-1);
  const engagementState =
    lead.stage === "client" || lead.stage === "archived"
      ? "none"
      : totalPreviewClickCount > 0
        ? "hot"
        : totalOpenCount >= 3
          ? "warm"
          : "none";
  const engagementReason =
    engagementState === "hot"
      ? "Preview viewed"
      : engagementState === "warm"
        ? "Repeat engagement"
        : "";
  const engagementRecommendedAction =
    engagementState === "hot"
      ? "Send Follow-up 1"
      : engagementState === "warm"
        ? "Send Follow-up 2"
        : "";
  const engagementRecommendedStage: FollowUpStage | null =
    engagementState === "hot" ? 1 : engagementState === "warm" ? 2 : null;
  const isEngagedHotLead = engagementState === "hot" || engagementState === "warm";
  const latestInboundMessageTime = getLatestLeadMessageTime(messages, "inbound");
  const latestOutboundMessageTime = getLatestLeadMessageTime(
    messages,
    "outbound"
  );
  const latestInboundMessage =
    messages.find((message) => message.direction === "inbound") || null;
  const mayBeReadyForClose = looksLikeInterestedReply(latestInboundMessage);
  const mayBeReadyForPaymentLink =
    looksLikePaymentReadyReply(latestInboundMessage);
  const hasPaymentLink = Boolean(checkoutUrl);
  const brandedPaymentUrl = hasPaymentLink ? getBrandedPaymentUrl(lead) : "";
  const smsSegmentEstimate = estimateSmsSegments(smsBody);
  const hasReplyAfterLastOutbound =
    latestInboundMessageTime > latestOutboundMessageTime;
  const canShowFollowUpActions = leadStage === "contacted" || leadStage === "lead";
  const hasFollowUpDestination = hasUsableFollowUpContact({
    phone: lead.phone,
    email: lead.email,
  });
  const followUpDisabled =
    Boolean(preparingFollowUp) ||
    hasReplyAfterLastOutbound ||
    !hasFollowUpDestination;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/" className="text-sm font-bold text-blue-400">
          &larr; Back to leads
        </Link>

        <div className="mt-8">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
            Lead Detail
          </p>

          <h1 className="text-4xl font-black tracking-tight">
            {leadName}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${getStageBadgeClass(
                leadStage
              )}`}
            >
              {stageLabels[leadStage] || "Lead"}
            </span>

            {stageOptions
              .filter((option) => option.stage !== leadStage)
              .map((option) => (
                <button
                  key={option.stage}
                  onClick={() => handleStageChange(option.stage)}
                  disabled={Boolean(updatingStage)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingStage === option.stage ? "Saving..." : option.label}
                </button>
              ))}

            <button
              onClick={handleStartContactEdit}
              disabled={isEditingContact}
              className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="sticky top-0 z-20 -mx-4 mt-8 border-y border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex gap-2 overflow-x-auto">
            {LEAD_DETAIL_TABS.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <BusinessInfoTab isActive={activeTab === "business-info"}>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                  Lead summary
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                  Business info
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Core lead details, contact methods, online presence and CRM
                  metadata for assessment.
                </p>
              </div>

              {isEditingContact ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveContactEdit}
                    disabled={savingContact}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingContact ? "Saving..." : "Save"}
                  </button>

                  <button
                    onClick={handleCancelContactEdit}
                    disabled={savingContact}
                    className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartContactEdit}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600"
                >
                  Edit
                </button>
              )}
            </div>

            {contactError ? (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                {contactError}
              </p>
            ) : null}

            <div className="grid gap-4 text-slate-300 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                <h3 className="font-bold text-white">
                  Business profile & contact details
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  The editable information used across enrichment, outreach and
                  generated previews.
                </p>

                <div className="mt-4 space-y-3">
              <div>
                <strong className="text-white">Trade:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.trade}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        trade: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Plumber"
                  />
                ) : (
                  <span>{lead.trade || "-"}</span>
                )}
              </div>

              {tradeProfile ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
                  <p>
                    <strong className="text-white">Primary Trade:</strong>{" "}
                    {tradeProfile.primary_trade || "-"}
                  </p>
                  <p className="mt-2">
                    <strong className="text-white">Template Profile:</strong>{" "}
                    {tradeProfile.template_profile || "-"}
                  </p>
                  <p className="mt-2">
                    <strong className="text-white">Service Modifiers:</strong>{" "}
                    {serviceModifierLabels.length
                      ? serviceModifierLabels.join(", ")
                      : "None detected"}
                  </p>
                </div>
              ) : null}

              <div>
                <strong className="text-white">Display Name:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.displayName}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder={lead.businessName || lead.name || "Business name"}
                  />
                ) : (
                  <span>
                    {lead.displayName ||
                      lead.businessName ||
                      lead.name ||
                      "Not set yet"}
                  </span>
                )}
              </div>

              <div>
                <strong className="text-white">Town/Suburb:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.city}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Hobart"
                  />
                ) : (
                  <span>{lead.city || "-"}</span>
                )}
              </div>

              <div>
                <strong className="text-white">Address:</strong>{" "}
                {isEditingContact ? (
                  <textarea
                    value={contactDraft.address}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="Street address"
                  />
                ) : (
                  <span
                    className={
                      lead.address || lead.formattedAddress ? "" : "text-slate-500"
                    }
                  >
                    {lead.address || lead.formattedAddress || "Not found yet"}
                  </span>
                )}
              </div>

              <div>
                <strong className="text-white">Google Maps:</strong>{" "}
                {googleMapsUrl ? (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Open in Google Maps
                  </a>
                ) : (
                  <span className="text-slate-500">Not available</span>
                )}
              </div>

              <div>
                <strong className="text-white">Phone:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.phone}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="0400 000 000"
                  />
                ) : (
                  formatAustralianPhoneNumber(lead.phone || "") || "Not found"
                )}
              </div>

              <div>
                <strong className="text-white">Email:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.email}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="name@example.com"
                  />
                ) : (
                  <>
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {lead.email}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not found yet</span>
                    )}
                  </>
                )}
              </div>

              <div>
                <strong className="text-white">Website:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.website}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        website: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com"
                  />
                ) : (
                  <>
                    {lead.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {lead.website}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not found yet</span>
                    )}
                  </>
                )}
              </div>

              <div>
                <strong className="text-white">Yellow Pages:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.yellowPagesUrl}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        yellowPagesUrl: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://www.yellowpages.com.au/..."
                  />
                ) : yellowPagesUrl ? (
                  <a
                    href={yellowPagesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Open in Yellow Pages
                  </a>
                ) : (
                  <span className="text-slate-500">Not found yet</span>
                )}
              </div>

              <div>
                <strong className="text-white">Contact Page:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.contactPage}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        contactPage: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com/contact"
                  />
                ) : lead.contactPage ? (
                  <a
                    href={lead.contactPage}
                    target="_blank"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {lead.contactPage}
                  </a>
                ) : (
                  <span className="text-slate-500">Not found yet</span>
                )}
              </div>

              <div>
                <strong className="text-white">Facebook:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.facebook}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        facebook: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://facebook.com/example"
                  />
                ) : (
                  <>
                    {lead.facebook ? (
                      <a
                        href={lead.facebook}
                        target="_blank"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {lead.facebook}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not found yet</span>
                    )}
                  </>
                )}
              </div>

              <div>
                <strong className="text-white">Instagram:</strong>{" "}
                {isEditingContact ? (
                  <input
                    value={contactDraft.instagram}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        instagram: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://instagram.com/example"
                  />
                ) : (
                  <>
                    {lead.instagram ? (
                      <a
                        href={lead.instagram}
                        target="_blank"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {lead.instagram}
                      </a>
                    ) : (
                      <span className="text-slate-500">Not found yet</span>
                    )}
                  </>
                )}
              </div>

                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white">
                        Business enrichment
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Refresh external business data, reviews and source
                        links.
                      </p>
                    </div>

                    <div className="w-full min-w-0 [&>button]:min-h-10 [&>button]:w-full [&>button]:whitespace-nowrap [&>button]:border [&>button]:border-white/10 [&>button]:bg-slate-800/80 [&>button]:text-slate-200 [&>button]:hover:bg-slate-700 sm:w-auto sm:[&>button]:w-auto">
                      <EnrichButton lead={lead} onEnriched={handleLeadUpdated} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p>
                      <strong className="text-white">Rating:</strong>{" "}
                      {lead.rating || "-"} from {lead.reviewCount || "0"} reviews
                    </p>

                    <p>
                      <strong className="text-white">Google Maps:</strong>{" "}
                      {googleMapsUrl ? (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Open in Google Maps
                        </a>
                      ) : (
                        <span className="text-slate-500">Not available</span>
                      )}
                    </p>

                    <p>
                      <strong className="text-white">Yellow Pages:</strong>{" "}
                      {yellowPagesUrl ? (
                        <a
                          href={yellowPagesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Open in Yellow Pages
                        </a>
                      ) : (
                        <span className="text-slate-500">Not found yet</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                  <h3 className="font-bold text-white">CRM notes & metadata</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Workflow status and key lifecycle timestamps.
                  </p>

                  <div className="mt-4 space-y-3">

              <p>
                <strong className="text-white">Stage:</strong>{" "}
                {stageLabels[leadStage] || "Lead"}
              </p>

              <p>
                <strong className="text-white">Status:</strong>{" "}
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getLeadStatusBadgeClass(
                    lead.status
                  )}`}
                >
                  {getLeadStatusLabel(lead.status)}
                </span>
              </p>

              <p>
                <strong className="text-white">Last Activity:</strong>{" "}
                {getLastActivityLabel(leadLastActivityAt)}
              </p>

              <p>
                <strong className="text-white">Status Updated:</strong>{" "}
                {leadStatusUpdatedAt ? formatTimestamp(leadStatusUpdatedAt) : "-"}
              </p>

              {lead.contactedAt ? (
                <p>
                  <strong className="text-white">Contacted:</strong>{" "}
                  {formatTimestamp(lead.contactedAt)}
                </p>
              ) : null}

              {lead.clientAt ? (
                <p>
                  <strong className="text-white">Client:</strong>{" "}
                  {formatTimestamp(lead.clientAt)}
                </p>
              ) : null}

              {lead.archivedAt ? (
                <p>
                  <strong className="text-white">Archived:</strong>{" "}
                  {formatTimestamp(lead.archivedAt)}
                </p>
              ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </BusinessInfoTab>

        <DesignTab isActive={activeTab === "design"}>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Site generation
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Generate / update site
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Build the latest preview using the saved template, service
                profile, colours and image assets.
              </p>
            </div>

            <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">
                    Current preview
                  </p>
                  <p className="mt-1 break-all text-sm text-slate-300">
                    {isLeadArchived ? (
                      <span className="text-slate-500">
                        Generated site disabled because this lead is archived.
                      </span>
                    ) : generatedSiteUrl ? (
                      <a
                        href={generatedSiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:text-blue-200 hover:underline"
                      >
                        {generatedSiteUrl}
                      </a>
                    ) : (
                      <span className="text-slate-500">
                        Generate a site first
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
                  {!isLeadArchived ? (
                    <div className="w-full [&>button]:min-h-12 [&>button]:w-full [&>button]:bg-blue-600 [&>button]:px-5 [&>button]:py-3 [&>button]:text-base [&>button]:shadow-lg [&>button]:shadow-blue-950/30 [&>button]:hover:bg-blue-500 sm:w-auto sm:[&>button]:w-auto">
                      <GenerateSiteButton
                        lead={lead}
                        templateTrade={templateTrade}
                        templateType={templateType}
                        onGenerated={handleGeneratedSiteUpdated}
                      />
                    </div>
                  ) : null}
                  <Link
                    href={`/branding?lead=${encodeURIComponent(lead.slug || lead.id)}`}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-blue-300/30 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15 sm:w-auto"
                  >
                    Open Branding Workspace
                  </Link>
                </div>
              </div>

            </div>

            <PreviewCard
              generatedSiteUrl={generatedSiteUrl}
              isLeadArchived={isLeadArchived}
              refreshSignal={mobilePreviewRefreshSignal}
            />

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-4">
                <h3 className="font-bold text-white">
                  Template & service profile
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Choose the trade template and specialisms that should shape
                  generated services, FAQs and supporting copy.
                </p>
              </div>

              <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
                <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-300">
                  Template Trade
                  <select
                    value={templateTrade}
                    onChange={(event) => setTemplateTrade(event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  >
                    {templateTradeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatTemplateTradeLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-300">
                  Template Type
                  <select
                    value={templateType}
                    onChange={(event) => setTemplateType(event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  >
                    {templateTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatTemplateTypeLabel(option)}
                      </option>
                    ))}
                  </select>
                  {templateType === "hero-image-led" ? (
                    <span className="text-xs font-medium text-slate-400">
                      Uses the generated hero image as the main above-the-fold
                      message with minimal overlay text.
                    </span>
                  ) : null}
                </label>

              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      Service Modifiers
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Used to adjust services, hero copy, FAQs and trust sections.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearServiceModifiers}
                      disabled={
                        savingServiceModifiers ||
                        selectedServiceModifiers.length === 0
                      }
                      className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear modifiers
                    </button>

                    <details className="relative">
                      <summary className="list-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                        Select modifiers
                      </summary>
                      <div className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
                        <button
                          type="button"
                          onClick={clearServiceModifiers}
                          disabled={savingServiceModifiers}
                          className="mb-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2 py-2 text-left text-sm font-bold text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          No modifiers
                        </button>
                        {serviceModifierOptions.map((option) => (
                          <label
                            key={option.value}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-200 hover:bg-white/10"
                          >
                            <input
                              type="checkbox"
                              checked={selectedServiceModifiers.includes(
                                option.value
                              )}
                              disabled={savingServiceModifiers}
                              onChange={() =>
                                toggleServiceModifier(option.value)
                              }
                              className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500"
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedServiceModifiers.length ? (
                    selectedServiceModifiers.map((modifier) => (
                      <button
                        key={modifier}
                        type="button"
                        onClick={() => toggleServiceModifier(modifier)}
                        disabled={savingServiceModifiers}
                        className="rounded-full border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-blue-100 hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Remove modifier"
                      >
                        {getServiceModifierLabel(modifier)} x
                      </button>
                    ))
                  ) : (
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-100">
                      No service modifiers selected.
                    </span>
                  )}
                </div>

                {savingServiceModifiers ? (
                  <p className="mt-2 text-xs font-bold text-blue-200">
                    Saving modifiers...
                  </p>
                ) : null}
                {serviceModifierNotice ? (
                  <p className="mt-2 text-xs font-bold text-emerald-300">
                    {serviceModifierNotice}
                  </p>
                ) : null}
                {serviceModifierError ? (
                  <p className="mt-2 text-xs font-bold text-red-300">
                    {serviceModifierError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">Brand colours</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Applied to generated site CTAs and coloured accent text.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSiteDesign}
                  disabled={savingSiteDesign}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSiteDesign ? "Saving..." : "Save Colours"}
                </button>
              </div>

              <div className="grid w-full gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Button colour
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={isHexColor(buttonColor) ? buttonColor : DEFAULT_BUTTON_COLOR}
                      onChange={(event) => {
                        setButtonColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={buttonColor}
                      onChange={(event) => {
                        setButtonColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_BUTTON_COLOR}
                    />
                  </div>
                </label>

                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Button text colour
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={
                        isHexColor(buttonTextColor)
                          ? buttonTextColor
                          : DEFAULT_BUTTON_TEXT_COLOR
                      }
                      onChange={(event) => {
                        setButtonTextColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={buttonTextColor}
                      onChange={(event) => {
                        setButtonTextColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_BUTTON_TEXT_COLOR}
                    />
                  </div>
                </label>

                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Hero coloured text
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={
                        isHexColor(heroAccentColor)
                          ? heroAccentColor
                          : DEFAULT_HERO_ACCENT_COLOR
                      }
                      onChange={(event) => {
                        setHeroAccentColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={heroAccentColor}
                      onChange={(event) => {
                        setHeroAccentColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_HERO_ACCENT_COLOR}
                    />
                  </div>
                </label>

                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Site body coloured text
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={
                        isHexColor(bodyAccentColor)
                          ? bodyAccentColor
                          : DEFAULT_BODY_ACCENT_COLOR
                      }
                      onChange={(event) => {
                        setBodyAccentColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={bodyAccentColor}
                      onChange={(event) => {
                        setBodyAccentColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_BODY_ACCENT_COLOR}
                    />
                  </div>
                </label>

                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Service Areas card
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={
                        isHexColor(serviceAreaCardColor)
                          ? serviceAreaCardColor
                          : DEFAULT_SERVICE_AREA_CARD_COLOR
                      }
                      onChange={(event) => {
                        setServiceAreaCardColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={serviceAreaCardColor}
                      onChange={(event) => {
                        setServiceAreaCardColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_SERVICE_AREA_CARD_COLOR}
                    />
                  </div>
                </label>

                <label className="grid w-full min-w-0 gap-1.5 text-sm font-bold text-slate-300">
                  Footer background
                  <div className="flex w-full min-w-0 items-center gap-2.5">
                    <input
                      type="color"
                      value={
                        isHexColor(footerBackgroundColor)
                          ? footerBackgroundColor
                          : DEFAULT_FOOTER_BACKGROUND_COLOR
                      }
                      onChange={(event) => {
                        setFooterBackgroundColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="h-11 w-16 flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 p-1"
                    />
                    <input
                      value={footerBackgroundColor}
                      onChange={(event) => {
                        setFooterBackgroundColor(event.target.value);
                        setSiteDesignNotice("");
                        setSiteDesignError("");
                      }}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      placeholder={DEFAULT_FOOTER_BACKGROUND_COLOR}
                    />
                  </div>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span
                  className="rounded-lg px-3 py-2 font-bold"
                  style={{
                    backgroundColor: isHexColor(buttonColor)
                      ? buttonColor
                      : DEFAULT_BUTTON_COLOR,
                    color: isHexColor(buttonTextColor)
                      ? buttonTextColor
                      : DEFAULT_BUTTON_TEXT_COLOR,
                  }}
                >
                  CTA preview
                </span>
                <span
                  className="font-bold"
                  style={{
                    color: isHexColor(heroAccentColor)
                      ? heroAccentColor
                      : DEFAULT_HERO_ACCENT_COLOR,
                  }}
                >
                  Hero accent
                </span>
                <span
                  className="font-bold"
                  style={{
                    color: isHexColor(bodyAccentColor)
                      ? bodyAccentColor
                      : DEFAULT_BODY_ACCENT_COLOR,
                  }}
                >
                  Body accent
                </span>
                <span
                  className="rounded-lg px-3 py-2 font-bold text-white"
                  style={{
                    backgroundColor: isHexColor(serviceAreaCardColor)
                      ? serviceAreaCardColor
                      : DEFAULT_SERVICE_AREA_CARD_COLOR,
                  }}
                >
                  Service Areas
                </span>
                <span
                  className="rounded-lg px-3 py-2 font-bold text-white"
                  style={{
                    backgroundColor: isHexColor(footerBackgroundColor)
                      ? footerBackgroundColor
                      : DEFAULT_FOOTER_BACKGROUND_COLOR,
                  }}
                >
                  Footer
                </span>
              </div>

              {siteDesignNotice ? (
                <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                  {siteDesignNotice}
                </p>
              ) : null}

              {siteDesignError ? (
                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                  {siteDesignError}
                </p>
              ) : null}
            </div>

            <div className="mt-6">
              <h3 className="font-bold text-white">
                Logo / favicon / hero assets
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Save the visual assets used by generated previews, including
                navigation branding, desktop and mobile hero imagery, and the
                browser icon.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">Site Branding</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Replaces the plain business name in the generated site top
                    navigation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSiteBranding}
                  disabled={savingSiteBranding}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSiteBranding ? "Saving..." : "Save Branding"}
                </button>
              </div>

              <div className="space-y-3">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Site Branding URL
                  <input
                    value={siteBrandingUrl}
                    onChange={(event) => {
                      setSiteBrandingUrl(event.target.value);
                      setSiteBrandingNotice("");
                      setSiteBrandingError("");
                    }}
                    className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com/logo.png"
                  />
                </label>

                {isPreviewableImageUrl(siteBrandingUrl) ? (
                  <div className="flex min-h-20 items-center rounded-lg border border-white/10 bg-slate-900 px-4 py-3">
                    <Image
                      src={siteBrandingUrl}
                      alt="Site branding preview"
                      width={440}
                      height={80}
                      sizes="220px"
                      className="max-h-10 w-auto max-w-[220px] object-contain"
                    />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-500">
                    No branding image set. Generated sites will show the
                    business name in the top navigation.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 bg-slate-900 p-3">
                  <label className="grid gap-2 text-sm font-bold text-slate-300">
                    Upload site branding
                    <input
                      type="file"
                      accept={BRANDING_IMAGE_ACCEPT}
                      onChange={handleBrandingImageFileChange}
                      disabled={uploadingBrandingImage}
                      className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUploadBrandingImage}
                      disabled={uploadingBrandingImage || !brandingImageFile}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadingBrandingImage ? "Uploading..." : "Upload"}
                    </button>

                    {brandingImageFile ? (
                      <span className="text-xs text-slate-400">
                        {brandingImageFile.name}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    JPG, PNG or WebP. Maximum 2MB.
                  </p>

                  {brandingImageUploadNotice ? (
                    <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-bold text-green-300">
                      {brandingImageUploadNotice}
                    </p>
                  ) : null}

                  {brandingImageUploadError ? (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                      {brandingImageUploadError}
                    </p>
                  ) : null}
                </div>

                {siteBrandingNotice ? (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                    {siteBrandingNotice}
                  </p>
                ) : null}

                {siteBrandingError ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                    {siteBrandingError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">Desktop Hero Image</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Used as the generated site desktop hero/background image.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSiteHeroImage}
                  disabled={savingSiteHeroImage}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSiteHeroImage ? "Saving..." : "Save Desktop Hero Image"}
                </button>
              </div>

              <div className="space-y-3">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Desktop Hero Image URL
                  <input
                    value={siteHeroImageUrl}
                    onChange={(event) => {
                      setSiteHeroImageUrl(event.target.value);
                      setSiteHeroImageNotice("");
                      setSiteHeroImageError("");
                    }}
                    className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com/hero.jpg"
                  />
                </label>

                {isPreviewableImageUrl(siteHeroImageUrl) ? (
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                    <Image
                      src={siteHeroImageUrl}
                      alt="Desktop hero image preview"
                      width={640}
                      height={240}
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-500">
                    No desktop hero image override set. Generated sites will use the
                    business, trade or default fallback image.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 bg-slate-900 p-3">
                  <label className="grid gap-2 text-sm font-bold text-slate-300">
                    Upload desktop hero image
                    <input
                      type="file"
                      accept={HERO_IMAGE_ACCEPT}
                      onChange={handleHeroImageFileChange}
                      disabled={uploadingHeroImage}
                      className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUploadHeroImage}
                      disabled={uploadingHeroImage || !heroImageFile}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadingHeroImage ? "Uploading..." : "Upload desktop hero image"}
                    </button>

                    {heroImageFile ? (
                      <span className="text-xs text-slate-400">
                        {heroImageFile.name}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    JPG, PNG or WebP. Maximum 5MB.
                  </p>

                  {heroImageUploadNotice ? (
                    <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-bold text-green-300">
                      {heroImageUploadNotice}
                    </p>
                  ) : null}

                  {heroImageUploadError ? (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                      {heroImageUploadError}
                    </p>
                  ) : null}
                </div>

                {siteHeroImageNotice ? (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                    {siteHeroImageNotice}
                  </p>
                ) : null}

                {siteHeroImageError ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                    {siteHeroImageError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">Mobile Hero Image</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Used as the generated site mobile hero/background image.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveMobileHeroImage}
                  disabled={savingMobileHeroImage}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingMobileHeroImage ? "Saving..." : "Save Mobile Hero Image"}
                </button>
              </div>

              <div className="space-y-3">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Mobile Hero Image URL
                  <input
                    value={mobileHeroImageUrl}
                    onChange={(event) => {
                      setMobileHeroImageUrl(event.target.value);
                      setMobileHeroImageNotice("");
                      setMobileHeroImageError("");
                    }}
                    className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com/mobile-hero.jpg"
                  />
                </label>

                {isPreviewableImageUrl(mobileHeroImageUrl) ? (
                  <div className="mx-auto max-w-xs overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                    <Image
                      src={mobileHeroImageUrl}
                      alt="Mobile hero image preview"
                      width={360}
                      height={520}
                      sizes="320px"
                      className="h-72 w-full object-cover"
                    />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-500">
                    No mobile hero image override set. Generated sites will use
                    the desktop hero image on mobile.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 bg-slate-900 p-3">
                  <label className="grid gap-2 text-sm font-bold text-slate-300">
                    Upload mobile hero image
                    <input
                      type="file"
                      accept={HERO_IMAGE_ACCEPT}
                      onChange={handleMobileHeroImageFileChange}
                      disabled={uploadingMobileHeroImage}
                      className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUploadMobileHeroImage}
                      disabled={uploadingMobileHeroImage || !mobileHeroImageFile}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadingMobileHeroImage
                        ? "Uploading..."
                        : "Upload mobile hero image"}
                    </button>

                    {mobileHeroImageFile ? (
                      <span className="text-xs text-slate-400">
                        {mobileHeroImageFile.name}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    JPG, PNG or WebP. Maximum 5MB.
                  </p>

                  {mobileHeroImageUploadNotice ? (
                    <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-bold text-green-300">
                      {mobileHeroImageUploadNotice}
                    </p>
                  ) : null}

                  {mobileHeroImageUploadError ? (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                      {mobileHeroImageUploadError}
                    </p>
                  ) : null}
                </div>

                {mobileHeroImageNotice ? (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                    {mobileHeroImageNotice}
                  </p>
                ) : null}

                {mobileHeroImageError ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                    {mobileHeroImageError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">Site Icon</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Used as the generated site favicon and mobile home screen
                    icon.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSiteIcon}
                  disabled={savingSiteIcon}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSiteIcon ? "Saving..." : "Save Site Icon"}
                </button>
              </div>

              <div className="space-y-3">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Site Icon URL
                  <input
                    value={siteIconUrl}
                    onChange={(event) => {
                      setSiteIconUrl(event.target.value);
                      setSiteIconNotice("");
                      setSiteIconError("");
                    }}
                    className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                    placeholder="https://example.com/icon.png"
                  />
                </label>

                {isPreviewableImageUrl(siteIconUrl) ? (
                  <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-slate-900 px-4 py-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950">
                      <Image
                        src={siteIconUrl}
                        alt="Site icon preview"
                        width={64}
                        height={64}
                        sizes="64px"
                        className="h-14 w-14 object-contain"
                      />
                    </div>
                    <a
                      href={siteIconUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 break-all text-sm text-blue-300 hover:text-blue-200"
                    >
                      {siteIconUrl}
                    </a>
                  </div>
                ) : (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-500">
                    No site icon set. Generated sites will use the browser
                    default icon.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 bg-slate-900 p-3">
                  <label className="grid gap-2 text-sm font-bold text-slate-300">
                    Upload site icon
                    <input
                      type="file"
                      accept={SITE_ICON_IMAGE_ACCEPT}
                      onChange={handleSiteIconFileChange}
                      disabled={uploadingSiteIcon}
                      className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUploadSiteIcon}
                      disabled={uploadingSiteIcon || !siteIconFile}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadingSiteIcon ? "Uploading..." : "Upload"}
                    </button>

                    {siteIconFile ? (
                      <span className="text-xs text-slate-400">
                        {siteIconFile.name}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    PNG, JPG or WebP. Maximum 2MB.
                  </p>

                  {siteIconUploadNotice ? (
                    <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-bold text-green-300">
                      {siteIconUploadNotice}
                    </p>
                  ) : null}

                  {siteIconUploadError ? (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                      {siteIconUploadError}
                    </p>
                  ) : null}
                </div>

                {siteIconNotice ? (
                  <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                    {siteIconNotice}
                  </p>
                ) : null}

                {siteIconError ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                    {siteIconError}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </DesignTab>

        <ClientSettingsTab isActive={activeTab === "client-settings"}>
        {leadStage === "client" ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Client settings
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Account & billing
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Client lifecycle, Stripe billing details and account settings
                for converted customers.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                <h3 className="font-bold text-white">Client status</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Current CRM and payment state for this converted lead.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Lead Stage
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-200">
                      {stageLabels[leadStage] || "Client"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Lead Status
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getLeadStatusBadgeClass(
                        lead.status
                      )}`}
                    >
                      {getLeadStatusLabel(lead.status)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Payment Status
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPaymentStatusBadgeClass(
                        lead.paymentStatus
                      )}`}
                    >
                      {formatClientValue(lead.paymentStatus)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Client Since
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-200">
                      {formatClientTimestamp(lead.clientStartedAt)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white">Billing</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Stripe customer, subscription and payment recovery
                        details.
                      </p>
                    </div>

                    {leadStage === "client" && lead.stripeCustomerId ? (
                      <button
                        onClick={handleOpenBillingPortal}
                        disabled={openingPortal}
                        className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {openingPortal ? "Opening..." : "Open Billing Portal"}
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Paid At
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-200">
                        {formatClientTimestamp(lead.paidAt)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Subscription State
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-200">
                        {formatClientValue(lead.paymentStatus)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Stripe Customer
                      </p>
                      <p className="mt-2 break-all text-sm font-bold text-slate-200">
                        {formatClientValue(lead.stripeCustomerId)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Stripe Subscription
                      </p>
                      <p className="mt-2 break-all text-sm font-bold text-slate-200">
                        {formatClientValue(lead.stripeSubscriptionId)}
                      </p>
                    </div>
                  </div>

                  {portalError ? (
                    <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {portalError}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
                  <h3 className="font-bold text-white">
                    Publishing & account settings
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Domain, hosting, publishing and client account controls will
                    appear here when available for this client.
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {leadStage !== "client" ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              Client settings
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Not a client yet
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Billing, subscription and account controls will appear here once
              this lead is marked as a client.
            </p>
          </section>
        ) : null}
        </ClientSettingsTab>

        <CommunicationTab
          isActive={activeTab === "communication"}
          previewUrl={generatedSiteUrl}
          communicationChannel={outreachChannel}
          onCommunicationChannelChange={handleOutreachChannelChange}
          stageLabel={stageLabels[leadStage] || "Lead"}
          stageBadgeClass={getStageBadgeClass(leadStage)}
          statusLabel={getLeadStatusLabel(lead.status)}
          statusBadgeClass={getLeadStatusBadgeClass(lead.status)}
          opportunityLabel={getCompactOpportunityLevelLabel(
            websiteOpportunityV2?.level
          )}
          opportunityBadgeClass={getOpportunityLevelBadgeClass(
            websiteOpportunityV2?.level
          )}
        >
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Outreach actions
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Prepare next reply
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Prepare follow-ups, close replies and payment-link messages
                before loading them into the composer.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
        {canShowFollowUpActions ? (
          <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-white">Follow-ups</h3>
              <p className="mt-1 text-sm text-slate-400">
                Follow-ups use the selected channel where possible.
              </p>
            </div>

            {followUpNotice ? (
              <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                {followUpNotice}
              </p>
            ) : null}

            {followUpError ? (
              <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {followUpError}
              </p>
            ) : null}

            {hasReplyAfterLastOutbound ? (
              <p className="mb-4 rounded-lg bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                This lead has replied since the last outbound message.
              </p>
            ) : null}

            {!hasFollowUpDestination ? (
              <p className="mb-4 rounded-lg bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                Add a valid Australian mobile number or email before sending a
                follow-up.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {([1, 2, 3] as FollowUpStage[]).map((stage) => (
                <button
                  key={stage}
                  onClick={() => handlePrepareFollowUp(stage)}
                  disabled={followUpDisabled}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {preparingFollowUp === stage
                    ? "Preparing..."
                    : stage === 3
                      ? "Prepare Final Follow-up"
                      : `Prepare Follow-up ${stage}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-white">Engaged reply</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use this when a lead replies positively or re-engages with their preview.
            </p>
          </div>

          {mayBeReadyForClose ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              This lead may be ready for a pricing-ready reply.
            </p>
          ) : null}

          {closeReplyNotice ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              {closeReplyNotice}
            </p>
          ) : null}

          {closeReplyError ? (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {closeReplyError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handlePrepareEngagedReply("soft_check_in")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
            >
              Prepare soft check-in
            </button>

            <button
              onClick={() => handlePrepareEngagedReply("pricing_ready")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
            >
              Prepare pricing-ready reply
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-white">Payment link reply</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use this after the lead confirms they want to go ahead.
            </p>
          </div>

          {mayBeReadyForPaymentLink ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              This lead may be ready for a payment link.
            </p>
          ) : null}

          {paymentReplyNotice ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              {paymentReplyNotice}
            </p>
          ) : null}

          {paymentReplyError ? (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {paymentReplyError}
            </p>
          ) : null}

          {brandedPaymentUrl ? (
            <div className="mb-4 rounded-xl border border-green-400/20 bg-green-500/10 p-4">
              <p className="mb-2 text-sm font-bold text-green-300">
                Checkout summary
              </p>
              <p className="mb-3 text-sm text-green-100">
                {CALLBOOST_CHECKOUT_SUMMARY}.
              </p>
              <a
                href={brandedPaymentUrl}
                target="_blank"
                className="block break-all text-sm text-blue-300 hover:text-blue-200"
              >
                {brandedPaymentUrl}
              </a>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGeneratePaymentReplyLink}
              disabled={generatingPaymentLink}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingPaymentLink
                ? "Generating..."
                : "Generate payment link"}
            </button>

            <button
              onClick={handlePreparePaymentReply}
              disabled={!hasPaymentLink}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prepare payment reply
            </button>
          </div>
        </div>
            </div>
          </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Message composer
              </p>
              <h2 className="mt-2 text-xl font-bold">Send outreach</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Review the SMS or email body, recipient and delivery feedback
                before sending.
              </p>
            </div>
          </div>

          {outreachNotice ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm font-bold text-green-300">
              {outreachNotice}
            </p>
          ) : null}

          {pendingFollowUpMetadata?.channel === outreachChannel ? (
            <p className="mb-4 rounded-lg bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-300">
              {pendingFollowUpMetadata.follow_up_stage === 3
                ? "Prepared final follow-up. Review and edit before sending."
                : `Prepared follow-up ${pendingFollowUpMetadata.follow_up_stage}. Review and edit before sending.`}
            </p>
          ) : null}

          {outreachError ? (
            <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
              {outreachError}
            </p>
          ) : null}

          {outreachChannel === "sms" ? (
            <div className="space-y-4">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                To
                <input
                  value={smsTo}
                  onChange={(event) => setSmsTo(event.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  placeholder="No phone found"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                <span className="flex items-center justify-between gap-3">
                  <span>Message</span>
                  <span className="text-xs font-bold text-slate-500">
                    {smsSegmentEstimate.encoding} |{" "}
                    {smsSegmentEstimate.estimatedSegments}{" "}
                    {smsSegmentEstimate.estimatedSegments === 1
                      ? "segment"
                      : "segments"}
                  </span>
                </span>
                <textarea
                  value={smsBody}
                  onChange={(event) => {
                    setSmsBodyEdited(true);
                    setSmsBody(event.target.value);
                  }}
                  className="min-h-[220px] rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none"
                />
              </label>

              {!lead.phone ? (
                <p className="text-sm text-slate-500">No phone found.</p>
              ) : null}

              <button
                onClick={() => handleSendOffer("sms")}
                disabled={Boolean(sendingOffer) || !smsTo || !smsBody}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingOffer === "sms" ? "Sending..." : "Send SMS Offer"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="grid gap-2 text-sm font-bold text-slate-300">
                To
                <input
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  placeholder="No email found yet"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Subject
                <input
                  value={emailSubject}
                  onChange={(event) => {
                    setEmailSubjectEdited(true);
                    setEmailSubject(event.target.value);
                  }}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Body
                <textarea
                  value={emailOfferBody}
                  onChange={(event) => {
                    setEmailBodyEdited(true);
                    setEmailOfferBody(event.target.value);
                  }}
                  className="min-h-[280px] rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none"
                />
              </label>

              {!lead.email ? (
                <p className="text-sm text-slate-500">No email found yet.</p>
              ) : null}

              <button
                onClick={() => handleSendOffer("email")}
                disabled={
                  Boolean(sendingOffer) ||
                  !emailTo ||
                  !emailSubject ||
                  !emailOfferBody
                }
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingOffer === "email"
                  ? "Sending..."
                  : "Send Email Offer"}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Engagement
              </p>
              <h2 className="mt-2 text-xl font-bold">Tracking and delivery</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Open/click signals, delivery alerts and recommended follow-up
                actions.
              </p>
            </div>
            {isEngagedHotLead ? (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase text-emerald-300">
                {engagementState === "hot" ? "Hot lead" : "Warm lead"}
              </span>
            ) : null}
          </div>
          {latestBouncedEmail ? (
            <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold uppercase text-rose-300">
                  Email bounced
                </span>
                {hasMobileFollowUp ? (
                  <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
                    Mobile follow-up available
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-bold text-white">
                {hasMobileFollowUp
                  ? "Email bounced. Mobile is available for SMS follow-up."
                  : "Email bounced. Use SMS/mobile follow-up if available."}
              </p>
              <p className="mt-2 text-sm text-rose-100/80">
                {latestBouncedEmail.toAddress
                  ? `Bounced recipient: ${latestBouncedEmail.toAddress}`
                  : "The latest outbound email could not be delivered."}
                {bounceReason ? ` Reason: ${bounceReason}` : ""}
              </p>
            </div>
          ) : null}
          {engagementReason ? (
            <div className="mb-4 rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-sm font-bold text-white">{engagementReason}</p>
              <p className="mt-1 text-sm text-slate-400">
                Recommended action: {engagementRecommendedAction}
              </p>
              {engagementRecommendedStage ? (
                <button
                  onClick={() => handlePrepareFollowUp(engagementRecommendedStage)}
                  disabled={followUpDisabled}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {preparingFollowUp === engagementRecommendedStage
                    ? "Preparing..."
                    : engagementRecommendedAction}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Sent
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {outboundMessages.length}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Opens
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {totalOpenCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Last opened
              </p>
              <p className="mt-2 text-sm font-bold text-slate-200">
                {lastOpenedAt ? formatTimestamp(lastOpenedAt) : "Not opened"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Preview clicks
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {totalPreviewClickCount}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Last click
              </p>
              <p className="mt-2 text-sm font-bold text-slate-200">
                {lastClickedAt ? formatTimestamp(lastClickedAt) : "No clicks"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              Conversation history
            </p>
            <h2 className="mt-2 text-xl font-bold">Message history</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Sent and received activity with channel, delivery status and
              timestamps.
            </p>
          </div>

          {timeline.length ? (
            <div className="space-y-3">
              {timeline.map((item) =>
                item.type === "message" ? (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-slate-900 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold uppercase text-blue-300">
                          {item.message.channel}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getLeadMessageStatusBadgeClass(
                            item.message.status
                          )}`}
                        >
                          {getLeadMessageStatusLabel(item.message.status)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        {formatTimestamp(item.message.createdAt)}
                      </p>
                    </div>

                    <p className="mt-3 text-sm text-slate-400">
                      To: {item.message.toAddress || "Unknown"}
                    </p>

                    {item.message.subject ? (
                      <p className="mt-2 font-bold text-white">
                        {item.message.subject}
                      </p>
                    ) : null}

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {item.message.body}
                    </p>

                    {item.message.error ? (
                      <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {item.message.error}
                      </p>
                    ) : null}

                    {item.message.status === "bounced" ? (
                      <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                        Email bounced
                        {getLeadMessageMetadataString(item.message, "bounceReason")
                          ? `: ${getLeadMessageMetadataString(
                              item.message,
                              "bounceReason"
                            )}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-slate-900 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-300">
                          Callback
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            item.callback.forwarded
                              ? "bg-green-500/15 text-green-300"
                              : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {item.callback.forwarded
                            ? `Forwarded to ${item.callback.forwardedTo}`
                            : "Saved"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        {formatTimestamp(item.callback.createdAt)}
                      </p>
                    </div>

                    <p className="mt-3 font-bold text-white">
                      {item.callback.visitorName || "Unknown visitor"}
                    </p>
                    <p className="text-sm text-blue-300">
                      {item.callback.visitorPhone || "No phone"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {item.callback.visitorMessage || "No message provided."}
                    </p>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-slate-400">No messages or callbacks yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              Callback requests
            </p>
            <h2 className="mt-2 text-xl font-bold">Callback submissions</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Review submitted callback requests and manage forwarding
              destinations.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
              <h3 className="mb-3 font-bold text-white">Forwarding</h3>

              <label className="flex items-center gap-3 text-sm font-bold text-slate-200">
                <input
                  type="checkbox"
                  checked={callbackForwardingEnabled}
                  onChange={(event) =>
                    setCallbackForwardingEnabled(event.target.checked)
                  }
                  className="h-4 w-4"
                />
                Forward callback requests
              </label>

              <div className="mt-4 space-y-3">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Forward to email
                  <input
                    value={callbackForwardToEmail}
                    onChange={(event) =>
                      setCallbackForwardToEmail(event.target.value)
                    }
                    className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="owner@example.com"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-300">
                  Forward to mobile
                  <input
                    value={callbackForwardToPhone}
                    onChange={(event) =>
                      setCallbackForwardToPhone(event.target.value)
                    }
                    className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    placeholder="+614..."
                  />
                </label>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Email forwarding uses Resend when configured. Mobile forwarding
                uses Twilio.
              </p>

              <button
                onClick={handleSaveForwarding}
                disabled={savingForwarding}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingForwarding ? "Saving..." : "Save forwarding"}
              </button>
            </div>

            <div>
              {callbacks.length ? (
                <div className="space-y-3">
                  {callbacks.map((callback) => (
                    <div
                      key={callback.id || `${callback.createdAt}-${callback.visitorPhone}`}
                      className="rounded-xl border border-white/10 bg-slate-900 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-white">
                            {callback.visitorName || "Unknown visitor"}
                          </p>
                          <p className="text-sm text-blue-300">
                            {callback.visitorPhone || "No phone"}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            callback.forwarded
                              ? "bg-green-500/15 text-green-300"
                              : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {callback.forwarded
                            ? `Forwarded to ${callback.forwardedTo}`
                            : "Saved only"}
                        </span>
                      </div>

                      <p className="mt-3 text-slate-300">
                        {callback.visitorMessage || "No message provided."}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {formatTimestamp(callback.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">
                  No callback requests have been submitted yet.
                </p>
              )}
            </div>
          </div>
        </section>
        </CommunicationTab>

        <section
          className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${
            activeTab === "business-info" ? "mt-6" : "hidden"
          }`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                Opportunity snapshot
              </p>
              <h2 className="mt-2 text-xl font-bold">Website Opportunity</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Ranking, signal counts, presence confidence and key assessment
                notes for this lead.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRedoWebsiteOpportunity}
              disabled={redoingOpportunity}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redoingOpportunity
                ? "Redoing..."
                : "Redo Website Opportunity"}
            </button>
          </div>

          {opportunityError ? (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {opportunityError}
            </p>
          ) : null}

          {lead.business_info_match ? (
            <div className="mb-5 rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <h3 className="mb-3 font-bold text-white">
                Business presence confidence
              </h3>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getBusinessInfoMatchBadgeClass(
                    lead.business_info_match
                  )}`}
                >
                  {getBusinessInfoMatchLabel(lead.business_info_match)}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                  Score {lead.business_info_match.score}
                </span>
                {lead.business_info_match.candidate_source ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                    Source {lead.business_info_match.candidate_source}
                  </span>
                ) : null}
              </div>

              {lead.business_info_match.reasons?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  {lead.business_info_match.reasons
                    .slice(0, 4)
                    .map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {websiteEvaluation || websiteOpportunityV2 ? (
            <div className="space-y-5">
              {websiteOpportunityV2 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${getOpportunityLevelBadgeClass(
                        websiteOpportunityV2.level
                      )}`}
                    >
                      {getOpportunityLevelLabel(websiteOpportunityV2.level)}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                      High {websiteOpportunityV2.highSignals.length}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                      Medium {websiteOpportunityV2.mediumSignals.length}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                      Low {websiteOpportunityV2.lowSignals.length}
                    </span>
                    {websiteOpportunityV2.requiresManualReview ? (
                      <span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-300">
                        Manual review required
                      </span>
                    ) : null}
                    {websiteOpportunityV2.requiresSocialsReview ? (
                      <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-300">
                        Socials review required
                      </span>
                    ) : null}
                  </div>

                  <p className="text-slate-300">{websiteOpportunityV2.reason}</p>

                  <p className="text-slate-300">
                    {websiteOpportunityV2.summary || "No opportunity summary yet."}
                  </p>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <h3 className="mb-2 font-bold text-white">
                        Opportunity issues
                      </h3>
                      {websiteOpportunityIssues.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-slate-300">
                          {websiteOpportunityIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : websiteOpportunityV2.level === "unranked" ? (
                        <p className="text-slate-400">
                          Manual review required before opportunity issues are shown.
                        </p>
                      ) : (
                        <p className="text-slate-400">
                          No qualifying opportunity issues found.
                        </p>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-2 font-bold text-white">
                        Opportunity positives
                      </h3>
                      {websiteOpportunityV2.positives?.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-slate-300">
                          {websiteOpportunityV2.positives.map((positive) => (
                            <li key={positive}>{positive}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">No v2 positives listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {!websiteOpportunityV2 && websiteEvaluation ? (
                <div className="space-y-4 border-t border-white/10 pt-5">
                  <div>
                    <h3 className="mb-2 font-bold text-white">
                      Website analysis details
                    </h3>
                    <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p>
                        Score:{" "}
                        <span className="font-semibold text-slate-100">
                          {websiteEvaluation.score}/100
                        </span>
                      </p>
                      <p>
                        Confidence:{" "}
                        <span className="font-semibold text-slate-100">
                          {websiteEvaluation.recommendation}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="text-slate-300">
                    {websiteEvaluation.summary || "No evaluation summary yet."}
                  </p>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <h3 className="mb-2 font-bold text-white">
                        Website analysis issues
                      </h3>
                      {websiteEvaluation.issues?.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-slate-300">
                          {websiteEvaluation.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">No issues listed.</p>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-2 font-bold text-white">
                        Website analysis positives
                      </h3>
                      {websiteEvaluation.positives?.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-slate-300">
                          {websiteEvaluation.positives.map((positive) => (
                            <li key={positive}>{positive}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">No positives listed.</p>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-500">
                    Evaluated:{" "}
                    {websiteEvaluation.evaluatedAt
                      ? formatTimestamp(websiteEvaluation.evaluatedAt)
                      : "Not yet"}
                  </p>
                </div>
              ) : !websiteOpportunityV2 ? (
                <p className="text-slate-400">
                  Legacy website evaluation details are not available.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-slate-400">
              No website opportunity evaluation has been generated yet.
            </p>
          )}
        </section>

        <section
          className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${
            activeTab === "design" ? "mt-6" : "hidden"
          }`}
        >
          <div className="mb-4">
            <h2 className="text-xl font-bold">Generated content</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Review the current generated description and page copy without
              changing the saved site design controls.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="mb-2 font-bold text-white">Description</h3>
              <p className="text-slate-300">
                {generatedDescription || "No description generated yet."}
              </p>
            </div>

            {hasPageCopy ? (
              <div>
                <h3 className="mb-2 font-bold text-white">Page Copy</h3>
                <div className="space-y-3 text-slate-300">
                  {lead.headline ? (
                    <p>
                      <strong className="text-white">Headline:</strong>{" "}
                      {lead.headline}
                    </p>
                  ) : null}

                  {lead.subheadline ? (
                    <p>
                      <strong className="text-white">Subheadline:</strong>{" "}
                      {lead.subheadline}
                    </p>
                  ) : null}

                  {lead.problems ? (
                    <p>
                      <strong className="text-white">Problems:</strong>{" "}
                      {lead.problems}
                    </p>
                  ) : null}

                  {lead.solution ? (
                    <p>
                      <strong className="text-white">Solution:</strong>{" "}
                      {lead.solution}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 font-bold text-white">Services</h3>

              {lead.services?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {lead.services.map((service) => (
                    <li key={service}>{service}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">No services generated yet.</p>
              )}
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="font-bold text-white">Reviews</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${reviewSource.badgeClass}`}
                >
                  {reviewSource.label}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                  {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                </span>
              </div>

              {lead.reviews?.length ? (
                <div className="space-y-3">
                  {lead.reviews.map((review, index) => (
                    <div key={index} className="rounded-lg bg-slate-900 p-4">
                      <p className="font-bold text-white">
                        {review.author || review.name || "Local Customer"}
                      </p>
                      <p className="text-yellow-400">
                        {"★".repeat(Number(review.rating) || 5)}
                      </p>
                      <p className="text-slate-300">{review.text}</p>
                      {review.relativeTimeDescription ? (
                        <p className="mt-2 text-xs text-slate-500">
                          {review.relativeTimeDescription}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">No reviews generated yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

