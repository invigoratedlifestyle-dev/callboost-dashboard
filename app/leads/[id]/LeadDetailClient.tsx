"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  CallbackRequest,
  Lead,
  LeadMessage,
  LeadStatus,
  WebsiteEvaluation,
} from "../../lib/leads";
import { EnrichButton } from "./EnrichButton";
import { GenerateSiteButton } from "./GenerateSiteButton";

type LeadWithGeneratedContent = Lead & {
  headline?: string;
  subheadline?: string;
  problems?: string;
  solution?: string;
  websiteOpportunity?: {
    issue?: string;
    summary?: string;
  };
};

type OutreachChannel = "sms" | "email";
type FollowUpStage = 1 | 2 | 3;

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

const statusOptions: Array<{ status: LeadStatus; label: string }> = [
  { status: "contacted", label: "Mark Contacted" },
  { status: "client", label: "Mark Client" },
  { status: "archived", label: "Archive" },
];

const statusLabels: Record<LeadStatus, string> = {
  lead: "Lead",
  contacted: "Contacted",
  client: "Client",
  archived: "Archived",
};

const qualityLabels: Record<WebsiteEvaluation["quality"], string> = {
  none: "No website",
  bad: "Bad website",
  weak: "Weak website",
  average: "Average website",
  good: "Good website",
  unknown: "Unknown",
};

function getStatusBadgeClass(status?: string) {
  if (status === "lead") return "bg-blue-500/15 text-blue-300";
  if (status === "contacted") return "bg-slate-500/15 text-slate-300";
  if (status === "client") return "bg-green-500/15 text-green-300";
  if (status === "archived") return "bg-slate-700 text-slate-300";
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

function getQualityLabel(evaluation?: WebsiteEvaluation) {
  if (!evaluation) return "Unknown";
  if (evaluation.hasWebsite && evaluation.isWorking === false) {
    return "Broken website";
  }

  return qualityLabels[evaluation.quality] || "Unknown";
}

function getQualityBadgeClass(evaluation?: WebsiteEvaluation) {
  if (!evaluation) return "bg-white/10 text-slate-400";
  if (!evaluation.hasWebsite) return "bg-red-500/15 text-red-300";
  if (evaluation.isWorking === false) return "bg-red-500/15 text-red-300";
  if (evaluation.quality === "bad") return "bg-red-500/15 text-red-300";
  if (evaluation.quality === "weak") return "bg-yellow-500/15 text-yellow-300";
  if (evaluation.quality === "average") return "bg-blue-500/15 text-blue-300";
  if (evaluation.quality === "good") return "bg-green-500/15 text-green-300";
  return "bg-white/10 text-slate-400";
}

function getRecommendationBadgeClass(recommendation?: string) {
  if (recommendation === "target") return "bg-red-500/15 text-red-300";
  if (recommendation === "maybe") return "bg-yellow-500/15 text-yellow-300";
  if (recommendation === "skip") return "bg-green-500/15 text-green-300";
  return "bg-white/10 text-slate-400";
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

function getWebsiteOpportunityIssue(lead: LeadWithGeneratedContent) {
  const evaluation = lead.websiteEvaluation;
  const isBrokenOrUnreachable =
    evaluation?.isWorking === false ||
    evaluation?.issues?.some((issue) =>
      /broken|unreachable|failed to load|could not be loaded/i.test(issue)
    );

  if (isBrokenOrUnreachable) {
    return "I couldn’t get your site to load on mobile";
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

function getPreviewUrl(lead: LeadWithGeneratedContent) {
  if (lead.generatedSiteUrl) return lead.generatedSiteUrl;

  if (typeof window !== "undefined") {
    return `${window.location.origin}/sites/${lead.slug || lead.id}`;
  }

  return "";
}

function getLeadName(lead: LeadWithGeneratedContent) {
  return lead.name || lead.businessName || "this business";
}

function buildOpportunitySms(lead: LeadWithGeneratedContent) {
  const previewUrl = getPreviewUrl(lead);
  const leadName = getLeadName(lead);
  const issue =
    getWebsiteOpportunityIssue(lead) ||
    "a couple of things that might be costing you calls";

  if (!previewUrl) {
    return [
      `Hey ${leadName}, I had a quick look and noticed ${issue}.`,
      "",
      "I made a cleaner preview and can send it through if you want to take a look.",
      "",
      "It’s designed to make it easier for people to call quickly from mobile. Want me to set this up properly for you?",
      "",
      "- Jamie",
    ].join("\n");
  }

  return [
    `Hey ${leadName}, I had a quick look and noticed ${issue}. I made a cleaner preview here: ${previewUrl}`,
    "",
    "It’s designed to make it easier for people to call quickly from mobile. Want me to set this up properly for you?",
    "",
    "- Jamie",
  ].join("\n");
}

function buildOpportunityEmailSubject(lead: LeadWithGeneratedContent) {
  return `Quick website preview for ${getLeadName(lead)}`;
}

function buildOpportunityEmail(lead: LeadWithGeneratedContent) {
  const previewUrl = getPreviewUrl(lead);
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
    "It’s designed to make it easier for people to call you quickly from mobile.",
    "",
    "Want me to set this up properly for you?",
    "",
    "Thanks,",
    "Jamie"
  );

  return lines.join("\n");
}

function buildCloseSms() {
  return [
    "Glad you like it 👍 I handle everything — setup, hosting, updates and small changes — for $99 setup + $99/month.",
    "",
    "Want me to set it up and send the payment link?",
  ].join("\n");
}

function buildCloseEmailSubject() {
  return "Website preview setup";
}

function buildCloseEmail() {
  return [
    "Glad you like it 👍",
    "",
    "I handle everything — setup, hosting, updates, and small changes — for $99 setup + $99/month.",
    "",
    "I can get it live for you and send through the payment link to start.",
    "",
    "Want me to set it up?",
    "",
    "Thanks,",
    "Jamie",
  ].join("\n");
}

function buildPaymentSms(paymentLink: string) {
  return [
    "Perfect — here’s the secure payment link to get started:",
    paymentLink,
    "",
    "Once that’s done, I’ll get everything set up and live for you.",
  ].join("\n");
}

function buildPaymentEmailSubject() {
  return "Payment link to get started";
}

function buildPaymentEmail(paymentLink: string) {
  return [
    "Perfect — here’s the secure payment link to get started:",
    "",
    paymentLink,
    "",
    "Once that’s done, I’ll get everything set up and live for you.",
    "",
    "Thanks,",
    "Jamie",
  ].join("\n");
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

function normalizeEmail(value: string) {
  return value.trim();
}

function normalizePhone(value: string) {
  return value.trim();
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
  const [lead, setLead] = useState<LeadWithGeneratedContent | null>(null);
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState("");
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
  const [sendingFollowUp, setSendingFollowUp] =
    useState<FollowUpStage | null>(null);
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
  const [contactDraft, setContactDraft] = useState({
    phone: "",
    email: "",
    website: "",
  });
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [redoingOpportunity, setRedoingOpportunity] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");

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
      setCallbacks(data.callbacks || []);
      setContactDraft({
        phone: loadedLead.phone || "",
        email: loadedLead.email || "",
        website: loadedLead.website || "",
      });
      setSmsTo(loadedLead.phone || "");
      setSmsBody(buildOpportunitySms(loadedLead));
      setSmsBodyEdited(false);
      setEmailTo(loadedLead.email || "");
      setEmailSubject(buildOpportunityEmailSubject(loadedLead));
      setEmailSubjectEdited(false);
      setEmailOfferBody(buildOpportunityEmail(loadedLead));
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

    if (!smsBodyEdited) {
      setSmsBody(buildOpportunitySms(nextLead));
    }

    if (!emailSubjectEdited) {
      setEmailSubject(buildOpportunityEmailSubject(nextLead));
    }

    if (!emailBodyEdited) {
      setEmailOfferBody(buildOpportunityEmail(nextLead));
    }
  };
  const handleOutreachChannelChange = (channel: OutreachChannel) => {
    setOutreachChannel(channel);

    if (!lead) return;

    if (channel === "sms" && !smsBodyEdited) {
      setSmsBody(buildOpportunitySms(lead));
    }

    if (channel === "email") {
      if (!emailSubjectEdited) {
        setEmailSubject(buildOpportunityEmailSubject(lead));
      }

      if (!emailBodyEdited) {
        setEmailOfferBody(buildOpportunityEmail(lead));
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
      phone: lead.phone || "",
      email: lead.email || "",
      website: lead.website || "",
    });
    setContactError("");
    setIsEditingContact(true);
  };
  const handleCancelContactEdit = () => {
    if (lead) {
      setContactDraft({
        phone: lead.phone || "",
        email: lead.email || "",
        website: lead.website || "",
      });
    }

    setContactError("");
    setIsEditingContact(false);
  };
  const handleSaveContactEdit = async () => {
    if (!lead) return;

    const nextPhone = normalizePhone(contactDraft.phone);
    const nextEmail = normalizeEmail(contactDraft.email);
    const nextWebsite = normalizeWebsite(contactDraft.website);

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
          phone: nextPhone,
          email: nextEmail,
          website: nextWebsite,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update contact fields");
      }

      const updatedLead = data.lead as LeadWithGeneratedContent;

      setLead(updatedLead);
      setContactDraft({
        phone: updatedLead.phone || "",
        email: updatedLead.email || "",
        website: updatedLead.website || "",
      });
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
  const handleStatusChange = async (status: LeadStatus) => {
    if (!lead) return;
    if (status === lead.status) return;

    setUpdatingStatus(status);

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          reviewNotes: lead.reviewNotes || "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update lead");
      }

      setLead(data.lead);
    } catch (error) {
      console.error("Failed to update lead status:", error);
      alert("Failed to update lead.");
    } finally {
      setUpdatingStatus("");
    }
  };
  const handleCreateCheckoutLink = async () => {
    if (!lead) return;

    setCreatingCheckout(true);
    setCheckoutUrl("");
    setCheckoutNotice("");
    setCheckoutError("");

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
        throw new Error(data.error || "Failed to create checkout link");
      }

      setCheckoutUrl(data.url);

      try {
        await navigator.clipboard.writeText(data.url);
        setCheckoutNotice("Checkout link copied to clipboard.");
      } catch {
        setCheckoutNotice("Checkout link created.");
      }

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Failed to create checkout link"
      );
    } finally {
      setCreatingCheckout(false);
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

    const payload =
      channel === "sms"
        ? {
            channel,
            to: smsTo,
            body: smsBody,
          }
        : {
            channel,
            to: emailTo,
            subject: emailSubject,
            body: emailOfferBody,
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
        channel === "sms" ? "SMS offer sent." : "Email offer sent."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send offer";

      setOutreachError(message);
    } finally {
      setSendingOffer("");
    }
  };
  const reloadLeadMessages = async () => {
    if (!lead) return;

    const messagesRes = await fetch(`/api/leads/${lead.slug || lead.id}/messages`, {
      cache: "no-store",
    });

    if (!messagesRes.ok) return;

    const messagesData = await messagesRes.json();

    setMessages(messagesData.messages || []);
    setCallbacks(messagesData.callbacks || callbacks);
  };
  const handleSendFollowUp = async (stage: FollowUpStage) => {
    if (!lead) return;

    const latestInbound = getLatestLeadMessageTime(messages, "inbound");
    const latestOutbound = getLatestLeadMessageTime(messages, "outbound");

    if (latestInbound > latestOutbound) {
      setFollowUpNotice("");
      setFollowUpError("Lead has replied since the last outbound message.");
      return;
    }

    setSendingFollowUp(stage);
    setFollowUpNotice("");
    setFollowUpError("");

    try {
      const res = await fetch(`/api/leads/${lead.slug || lead.id}/follow-up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send follow-up");
      }

      await reloadLeadMessages();

      setFollowUpNotice(
        stage === 3
          ? `Final follow-up sent by ${data.channel === "email" ? "email" : "SMS"}.`
          : `Follow-up ${stage} sent by ${
              data.channel === "email" ? "email" : "SMS"
            }.`
      );
    } catch (error) {
      setFollowUpError(
        error instanceof Error ? error.message : "Failed to send follow-up"
      );
    } finally {
      setSendingFollowUp(null);
    }
  };
  const handleCopyCloseReply = async (channel: OutreachChannel) => {
    setCloseReplyNotice("");
    setCloseReplyError("");

    try {
      const copyText =
        channel === "sms"
          ? buildCloseSms()
          : `${buildCloseEmailSubject()}\n\n${buildCloseEmail()}`;

      await navigator.clipboard.writeText(copyText);
      setCloseReplyNotice(
        channel === "sms" ? "Close SMS copied." : "Close email copied."
      );
    } catch {
      setCloseReplyError("Could not copy close reply.");
    }
  };
  const handleUseCloseReply = (channel: OutreachChannel) => {
    setCloseReplyNotice("");
    setCloseReplyError("");
    setOutreachChannel(channel);

    if (channel === "sms") {
      setSmsBody(buildCloseSms());
      setSmsBodyEdited(true);
      setCloseReplyNotice("Close SMS loaded into composer.");
      return;
    }

    setEmailSubject(buildCloseEmailSubject());
    setEmailOfferBody(buildCloseEmail());
    setEmailSubjectEdited(true);
    setEmailBodyEdited(true);
    setCloseReplyNotice("Close email loaded into composer.");
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
  const handleCopyPaymentReply = async (channel: OutreachChannel) => {
    if (!checkoutUrl) return;

    setPaymentReplyNotice("");
    setPaymentReplyError("");

    try {
      const copyText =
        channel === "sms"
          ? buildPaymentSms(checkoutUrl)
          : `${buildPaymentEmailSubject()}\n\n${buildPaymentEmail(checkoutUrl)}`;

      await navigator.clipboard.writeText(copyText);
      setPaymentReplyNotice(
        channel === "sms" ? "Payment SMS copied." : "Payment email copied."
      );
    } catch {
      setPaymentReplyError("Could not copy payment reply.");
    }
  };
  const handleUsePaymentReply = (channel: OutreachChannel) => {
    if (!checkoutUrl) return;

    setPaymentReplyNotice("");
    setPaymentReplyError("");
    setOutreachChannel(channel);

    if (channel === "sms") {
      setSmsBody(buildPaymentSms(checkoutUrl));
      setSmsBodyEdited(true);
      setPaymentReplyNotice("Payment SMS loaded into composer.");
      return;
    }

    setEmailSubject(buildPaymentEmailSubject());
    setEmailOfferBody(buildPaymentEmail(checkoutUrl));
    setEmailSubjectEdited(true);
    setEmailBodyEdited(true);
    setPaymentReplyNotice("Payment email loaded into composer.");
  };
  const generatedDescription =
    lead.description || lead.solution || lead.subheadline || "";
  const generatedSiteUrl = lead.generatedSiteUrl || "";
  const websiteEvaluation = lead.websiteEvaluation;
  const reviewSource = getReviewSource(lead);
  const reviewCount = lead.reviews?.length || 0;
  const hasPageCopy =
    Boolean(lead.headline) ||
    Boolean(lead.subheadline) ||
    Boolean(lead.problems) ||
    Boolean(lead.solution);

  const timeline = getTimeline(messages, callbacks);
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
  const hasReplyAfterLastOutbound =
    latestInboundMessageTime > latestOutboundMessageTime;
  const canShowFollowUpActions = lead.status === "contacted";
  const hasFollowUpDestination = Boolean(lead.phone || lead.email);
  const followUpDisabled =
    Boolean(sendingFollowUp) ||
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
              className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                lead.status
              )}`}
            >
              {statusLabels[lead.status || "lead"] || "Lead"}
            </span>

            {statusOptions
              .filter((option) => option.status !== lead.status)
              .map((option) => (
                <button
                  key={option.status}
                  onClick={() => handleStatusChange(option.status)}
                  disabled={Boolean(updatingStatus)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingStatus === option.status ? "Saving..." : option.label}
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

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Business Info</h2>

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

            <div className="space-y-3 text-slate-300">
              <p>
                <strong className="text-white">Trade:</strong> {lead.trade || "-"}
              </p>

              <p>
                <strong className="text-white">City:</strong> {lead.city || "-"}
              </p>

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
                  lead.phone || "Not found"
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

              <p>
                <strong className="text-white">Contact Page:</strong>{" "}
                {lead.contactPage ? (
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
              </p>

              <p>
                <strong className="text-white">Facebook:</strong>{" "}
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
              </p>

              <p>
                <strong className="text-white">Instagram:</strong>{" "}
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
              </p>

              <p>
                <strong className="text-white">Rating:</strong>{" "}
                {lead.rating || "-"} from {lead.reviewCount || "0"} reviews
              </p>

              <p>
                <strong className="text-white">Status:</strong>{" "}
                {statusLabels[lead.status || "lead"] || "Lead"}
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
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-xl font-bold">Generated Site</h2>

            <p className="break-all text-slate-300">
              <strong className="text-white">Live URL:</strong>{" "}
              {generatedSiteUrl ? (
                <a
                  href={generatedSiteUrl}
                  target="_blank"
                  className="text-blue-400"
                >
                  {generatedSiteUrl}
                </a>
              ) : (
                <span className="text-slate-500">Generate a site first</span>
              )}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (!generatedSiteUrl) {
                    alert("Generate a site first.");
                    return;
                  }

                  window.open(generatedSiteUrl, "_blank", "noopener,noreferrer");
                }}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600"
              >
                View Page
              </button>

              <EnrichButton lead={lead} onEnriched={handleLeadUpdated} />

              <GenerateSiteButton lead={lead} onGenerated={handleLeadUpdated} />

              <button
                onClick={handleCreateCheckoutLink}
                disabled={creatingCheckout}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingCheckout ? "Creating..." : "Create Checkout Link"}
              </button>
            </div>

            {checkoutUrl ? (
              <div className="mt-4 rounded-xl border border-green-400/20 bg-green-500/10 p-4">
                <p className="mb-2 text-sm font-bold text-green-300">
                  Stripe Checkout URL
                </p>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  className="break-all text-sm text-blue-300 hover:text-blue-200"
                >
                  {checkoutUrl}
                </a>
              </div>
            ) : null}

            {checkoutNotice ? (
              <p className="mt-3 text-sm font-bold text-green-300">
                {checkoutNotice}
              </p>
            ) : null}

            {checkoutError ? (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {checkoutError}
              </p>
            ) : null}
          </section>
        </div>

        {lead.status === "client" ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-xl font-bold">Client Details</h2>

            <div className="grid gap-4 md:grid-cols-2">
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

            {lead.status === "client" && lead.stripeCustomerId ? (
              <div className="mt-5">
                <button
                  onClick={handleOpenBillingPortal}
                  disabled={openingPortal}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openingPortal ? "Opening..." : "Open Billing Portal"}
                </button>

                {portalError ? (
                  <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {portalError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {canShowFollowUpActions ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Follow-ups</h2>
              <p className="mt-1 text-sm text-slate-400">
                Send a short manual follow-up by SMS first, or email if there is
                no phone number.
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
                Add a phone number or email before sending a follow-up.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {([1, 2, 3] as FollowUpStage[]).map((stage) => (
                <button
                  key={stage}
                  onClick={() => handleSendFollowUp(stage)}
                  disabled={followUpDisabled}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingFollowUp === stage
                    ? "Sending..."
                    : stage === 3
                      ? "Send Final Follow-up"
                      : `Send Follow-up ${stage}`}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Interested reply</h2>
            <p className="mt-1 text-sm text-slate-400">
              Use this when a lead replies positively and is ready for pricing.
            </p>
          </div>

          {mayBeReadyForClose ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              This lead may be ready for a close reply.
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
              onClick={() => handleCopyCloseReply("sms")}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600"
            >
              Copy close SMS
            </button>

            <button
              onClick={() => handleCopyCloseReply("email")}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600"
            >
              Copy close Email
            </button>

            <button
              onClick={() => handleUseCloseReply("sms")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
            >
              Use in SMS
            </button>

            <button
              onClick={() => handleUseCloseReply("email")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
            >
              Use in Email
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Payment link reply</h2>
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

          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              className="mb-4 block break-all text-sm text-blue-300 hover:text-blue-200"
            >
              {checkoutUrl}
            </a>
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
              onClick={() => handleCopyPaymentReply("sms")}
              disabled={!hasPaymentLink}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Copy payment SMS
            </button>

            <button
              onClick={() => handleCopyPaymentReply("email")}
              disabled={!hasPaymentLink}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Copy payment Email
            </button>

            <button
              onClick={() => handleUsePaymentReply("sms")}
              disabled={!hasPaymentLink}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use in SMS
            </button>

            <button
              onClick={() => handleUsePaymentReply("email")}
              disabled={!hasPaymentLink}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use in Email
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Outreach</h2>

            <div className="flex rounded-lg border border-white/10 bg-slate-900 p-1">
              {(["sms", "email"] as OutreachChannel[]).map((channel) => (
                <button
                  key={channel}
                  onClick={() => handleOutreachChannelChange(channel)}
                  className={`rounded-md px-4 py-2 text-sm font-bold ${
                    outreachChannel === channel
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {channel === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>
          </div>

          {outreachNotice ? (
            <p className="mb-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm font-bold text-green-300">
              {outreachNotice}
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
                Message
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

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold">Message History</h2>

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
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            item.message.status === "sent"
                              ? "bg-green-500/15 text-green-300"
                              : item.message.status === "received"
                                ? "bg-cyan-500/15 text-cyan-300"
                              : item.message.status === "failed"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {item.message.status === "sent"
                            ? "Sent"
                            : item.message.status === "received"
                              ? "Received"
                            : item.message.status === "failed"
                              ? "Failed"
                              : "Draft"}
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

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold">Callback Requests</h2>

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

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Website Opportunity</h2>

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

          {websiteEvaluation ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getQualityBadgeClass(
                    websiteEvaluation
                  )}`}
                >
                  {getQualityLabel(websiteEvaluation)}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                  {websiteEvaluation.score}/100
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getRecommendationBadgeClass(
                    websiteEvaluation.recommendation
                  )}`}
                >
                  {websiteEvaluation.recommendation}
                </span>
              </div>

              <p className="text-slate-300">
                {websiteEvaluation.summary || "No evaluation summary yet."}
              </p>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-bold text-white">Issues</h3>
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
                  <h3 className="mb-2 font-bold text-white">Positives</h3>
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
          ) : (
            <p className="text-slate-400">
              No website opportunity evaluation has been generated yet.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold">Generated Content</h2>

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
