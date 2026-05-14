import type { TradeProfile } from "./leadTargeting/tradeModifiers";

import type { StoredWebsiteOpportunityResult } from "./websiteOpportunity";

export type LeadStage =
  | "lead"
  | "contacted"
  | "client"
  | "archived";

export type LeadStatus =
  | "new"
  | "in_progress"
  | "ready_for_client"
  | "waiting_client"
  | "follow_up_1"
  | "follow_up_2"
  | "final_follow_up"
  | "replied"
  | "paid"
  | "closed";

export type LeadReview = {
  name?: string;
  author?: string;
  rating: number;
  text: string;
  relativeTimeDescription?: string | null;
  source?: "google";
};

export type WebsiteEvaluation = {
  evaluatedAt: string | null;
  websiteUrl: string | null;
  hasWebsite: boolean;
  isWorking: boolean | null;
  quality: "none" | "bad" | "weak" | "average" | "good" | "unknown";
  score: number;
  issues: string[];
  positives: string[];
  summary: string;
  recommendation: "target" | "maybe" | "skip";
};

export type CallbackRequest = {
  id?: string;
  leadId?: string | number | null;
  sourceSlug: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string;
  forwarded: boolean;
  forwardedTo: string;
  createdAt: string;
};

export type LeadMessage = {
  id?: string;
  leadId?: string | number | null;
  slug: string;
  channel: "sms" | "email";
  direction: string;
  toAddress: string;
  fromAddress: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "delivered" | "bounced" | "failed" | "received";
  provider: string;
  providerMessageId: string;
  error: string;
  metadata?: Record<string, unknown>;
  openedAt?: string;
  firstOpenedAt?: string;
  openCount?: number;
  clickedAt?: string;
  firstClickedAt?: string;
  clickCount?: number;
  trackingToken?: string;
  publicTrackingToken?: string;
  previewUrl?: string;
  createdAt: string;
  readAt: string;
};

export type Lead = {
  id: string;
  name?: string;
  businessName: string;
  slug: string;
  city: string;
  address?: string;
  formattedAddress?: string;
  trade: string;
  phone: string;
  email: string;
  rating: string;
  reviewCount: string;
  website?: string;
  contactPage?: string;
  facebook?: string;
  instagram?: string;
  stage: LeadStage;
  status: LeadStatus;
  statusUpdatedAt?: string | null;
  status_updated_at?: string | null;
  lastActivityAt?: string | null;
  last_activity_at?: string | null;
  contactedAt?: string | null;
  clientAt?: string | null;
  archivedAt?: string | null;
  reviewNotes?: string;

  description?: string;
  services?: string[];
  reviews?: LeadReview[];
  reviewsSource?: "google" | "none";
  aiGeneratedAt?: string;
  enrichedAt?: string;
  generatedSiteUrl?: string;
  websiteEvaluation?: WebsiteEvaluation;
  website_opportunity_v2?: StoredWebsiteOpportunityResult;
  callbackForwardingEnabled?: boolean;
  callbackForwardToEmail?: string | null;
  callbackForwardToPhone?: string | null;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeSubscriptionId?: string | null;
  paymentStatus?: string | null;
  paidAt?: string | null;
  clientStartedAt?: string | null;
  trade_profile?: TradeProfile;
};

export const leads: Lead[] = [
  {
    id: "aande-plumbing",
    businessName: "A&E Plumbing",
    slug: "aande-plumbing",
    city: "Hobart",
    trade: "Plumber",
    phone: "(03) 6234 1051",
    email: "contact@example.com",
    rating: "4.8",
    reviewCount: "42",
    website: "",
    contactPage: "",
    facebook: "",
    instagram: "",
    stage: "lead",
    status: "new",
    statusUpdatedAt: null,
    lastActivityAt: null,
    contactedAt: null,
    clientAt: null,
    archivedAt: null,
    reviewNotes: "",

    description: "",
    services: [],
    reviews: [],
    aiGeneratedAt: "",
    enrichedAt: "",
  },
];

