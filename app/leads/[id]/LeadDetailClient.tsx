"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { generateOfferEmail } from "../../lib/emailTemplate";
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
};

type OutreachChannel = "sms" | "email";

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

function getWebsiteOpportunityLine(lead: LeadWithGeneratedContent) {
  const evaluation = lead.websiteEvaluation;

  if (!evaluation || evaluation.quality === "none" || !evaluation.hasWebsite) {
    return "I couldn't find a proper website for your business.";
  }

  if (evaluation.quality === "bad" || evaluation.quality === "weak") {
    return "your current website could do more to turn visitors into calls.";
  }

  return "there may be a few quick wins to improve local enquiries.";
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

function buildSmsOffer(lead: LeadWithGeneratedContent) {
  const previewUrl = getPreviewUrl(lead);
  const leadName = getLeadName(lead);

  return [
    `Hey ${leadName}, I built a quick website preview for your ${lead.trade} business:`,
    "",
    previewUrl,
    "",
    "If you like it, I can set it up properly for $99 setup + $99/month.",
    "",
    "- Jamie",
    "Reply STOP to opt out",
  ].join("\n");
}

function buildEmailSubject(lead: LeadWithGeneratedContent) {
  return `Quick website preview for ${getLeadName(lead)}`;
}

function buildEmailOffer(lead: LeadWithGeneratedContent) {
  const previewUrl = getPreviewUrl(lead);
  const leadName = getLeadName(lead);

  return [
    `Hey ${leadName},`,
    "",
    `I built a quick website preview for your ${lead.trade} business here:`,
    "",
    previewUrl,
    "",
    `I noticed ${getWebsiteOpportunityLine(lead)}`,
    "",
    "If you like it, I can set it up properly for $99 setup + $99/month.",
    "",
    "- Jamie",
  ].join("\n");
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
  const [sendingOffer, setSendingOffer] = useState("");
  const [outreachNotice, setOutreachNotice] = useState("");
  const [outreachError, setOutreachError] = useState("");
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
      setSmsBody(buildSmsOffer(loadedLead));
      setEmailTo(loadedLead.email || "");
      setEmailSubject(buildEmailSubject(loadedLead));
      setEmailOfferBody(buildEmailOffer(loadedLead));
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

  const emailBody = generateOfferEmail(lead);
  const leadName = getLeadName(lead);
  const subject = `Quick win for ${leadName}`;
  const handleLeadUpdated = (updatedLead: Lead) => {
    setLead(updatedLead);
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

  const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
    lead.email || ""
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  const timeline = getTimeline(messages, callbacks);

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
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Outreach</h2>

            <div className="flex rounded-lg border border-white/10 bg-slate-900 p-1">
              {(["sms", "email"] as OutreachChannel[]).map((channel) => (
                <button
                  key={channel}
                  onClick={() => setOutreachChannel(channel)}
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
                  onChange={(event) => setSmsBody(event.target.value)}
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
                  onChange={(event) => setEmailSubject(event.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-300">
                Body
                <textarea
                  value={emailOfferBody}
                  onChange={(event) => setEmailOfferBody(event.target.value)}
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
          <h2 className="mb-4 text-xl font-bold">Website Opportunity</h2>

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
          <h2 className="mb-4 text-xl font-bold">Email Offer</h2>

          <textarea
            readOnly
            value={emailBody}
            className="min-h-[320px] w-full rounded-xl border border-white/10 bg-slate-900 p-4 text-sm leading-6 text-slate-100 outline-none"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={gmailUrl}
              target="_blank"
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
            >
              Open Gmail
            </a>

            <a
              href={`mailto:${lead.email || ""}?subject=${encodeURIComponent(
                subject
              )}&body=${encodeURIComponent(emailBody)}`}
              className="rounded-lg bg-slate-700 px-5 py-3 text-sm font-bold text-white hover:bg-slate-600"
            >
              Open Mail App
            </a>
          </div>
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
