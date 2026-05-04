export type LeadStatus =
  | "new"
  | "archived"
  | "contacted";

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
  status: "draft" | "sent" | "failed" | "received";
  provider: string;
  providerMessageId: string;
  error: string;
  createdAt: string;
  readAt: string;
};

export type Lead = {
  id: string;
  businessName: string;
  slug: string;
  city: string;
  trade: string;
  phone: string;
  email: string;
  rating: string;
  reviewCount: string;
  website?: string;
  contactPage?: string;
  facebook?: string;
  instagram?: string;
  status: LeadStatus;
  archivedAt?: string | null;
  contactedAt?: string | null;
  reviewNotes?: string;

  description?: string;
  services?: string[];
  reviews?: LeadReview[];
  reviewsSource?: "google" | "none";
  aiGeneratedAt?: string;
  enrichedAt?: string;
  generatedSiteUrl?: string;
  websiteEvaluation?: WebsiteEvaluation;
  callbackForwardingEnabled?: boolean;
  callbackForwardToEmail?: string | null;
  callbackForwardToPhone?: string | null;
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
    status: "new",
    archivedAt: null,
    contactedAt: null,
    reviewNotes: "",

    description: "",
    services: [],
    reviews: [],
    aiGeneratedAt: "",
    enrichedAt: "",
  },
];
