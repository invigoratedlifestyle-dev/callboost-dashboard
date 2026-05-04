"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lead, LeadStatus, WebsiteEvaluation } from "./lib/leads";

type LeadPriority = "high" | "medium" | "low";
type WebsiteStatus = "no_website" | "weak_website" | "has_website";
type LeadFilter = "active" | "archived" | "all";
type DashboardLead = Lead & {
  priority?: LeadPriority;
  leadScore?: number;
  websiteStatus?: WebsiteStatus;
  websiteStatusReasons?: string[];
  websiteEvaluation?: WebsiteEvaluation;
};

type ReplyNotification = {
  id: string;
  lead_id: string | number | null;
  lead_slug: string;
  business_name: string;
  channel: "sms" | "email";
  body: string;
  subject: string;
  created_at: string;
};

const lifecycleActions: Array<{ status: LeadStatus; label: string }> = [
  { status: "archived", label: "Archive" },
  { status: "contacted", label: "Mark contacted" },
];

const leadFilters: Array<{ value: LeadFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const qualityLabels: Record<WebsiteEvaluation["quality"], string> = {
  none: "No website",
  bad: "Bad website",
  weak: "Weak website",
  average: "Average website",
  good: "Good website",
  unknown: "Unknown",
};

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  archived: "Archived",
  contacted: "Contacted",
};

const filterTitles: Record<LeadFilter, string> = {
  active: "Active Leads",
  archived: "Archived Leads",
  all: "All Leads",
};

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

function getQualityLabel(evaluation?: WebsiteEvaluation) {
  if (!evaluation) return "Unknown";
  if (evaluation.hasWebsite && evaluation.isWorking === false) {
    return "Broken website";
  }

  return qualityLabels[evaluation.quality] || "Unknown";
}

function getOpportunityScore(lead: DashboardLead) {
  return typeof lead.websiteEvaluation?.score === "number"
    ? lead.websiteEvaluation.score
    : typeof lead.leadScore === "number"
      ? lead.leadScore
      : null;
}

function getOpportunityLabel(score: number | null) {
  if (score === null) return "Unscored";
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function getOpportunityBadgeClass(score: number | null) {
  if (score === null) return "bg-white/10 text-slate-400";
  if (score >= 70) return "bg-red-500/15 text-red-300";
  if (score >= 40) return "bg-yellow-500/15 text-yellow-300";
  return "bg-slate-500/15 text-slate-300";
}

function getMainIssue(lead: DashboardLead) {
  return (
    lead.websiteEvaluation?.issues?.[0] ||
    lead.websiteStatusReasons?.[0] ||
    "No evaluation yet"
  );
}

function getStatusBadgeClass(status?: string) {
  if (status === "new") return "bg-blue-500/15 text-blue-300";
  if (status === "contacted") return "bg-cyan-500/15 text-cyan-300";
  if (status === "archived") return "bg-slate-500/15 text-slate-300";
  return "bg-white/10 text-slate-400";
}

function isPlaceholderEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  return (
    normalizedEmail === "contact@example.com" ||
    normalizedEmail === "admin@example.com" ||
    normalizedEmail === "test@example.com" ||
    normalizedEmail.endsWith("@example.com")
  );
}

function formatNotificationTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getReplyPreview(notification: ReplyNotification) {
  const text = notification.body || notification.subject || "New reply";

  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<DashboardLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<LeadFilter>("active");
  const [updatingLead, setUpdatingLead] = useState("");
  const [replyNotifications, setReplyNotifications] = useState<
    ReplyNotification[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const prevNotificationIdsRef = useRef<Set<string>>(new Set());
  const isFirstNotificationLoadRef = useRef(true);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const permissionRequestedRef = useRef(false);
  const actionRunning = generating || enriching;

  async function loadLeads() {
    const res = await fetch("/api/leads", {
      cache: "no-store",
    });

    const data = await res.json();

    setLeads(data.leads || []);
    setLoading(false);
  }

  async function loadReplyNotifications() {
    try {
      const res = await fetch("/api/notifications/replies", {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      const notifications = (data.notifications || []) as ReplyNotification[];
      const nextIds = new Set(
        notifications.map((notification) => notification.id).filter(Boolean)
      );
      const newestNotification = notifications.find(
        (notification) => !prevNotificationIdsRef.current.has(notification.id)
      );

      if (!isFirstNotificationLoadRef.current && newestNotification) {
        notificationSoundRef.current?.play().catch(() => {});

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("New Lead Reply", {
            body: `${newestNotification.business_name}: ${newestNotification.body.slice(
              0,
              80
            )}`,
          });
        }
      }

      prevNotificationIdsRef.current = nextIds;
      isFirstNotificationLoadRef.current = false;
      setReplyNotifications(notifications);
    } catch (error) {
      console.error("Failed to load reply notifications:", error);
    }
  }

  async function handleGenerateLeads() {
    setGenerating(true);

    try {
      const res = await fetch("/api/leads/generate", {
        method: "POST",
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));

        console.error("Generate leads failed:", result);
        alert(result.message || result.error || "Lead generation failed");
        return;
      }

      await loadLeads();
    } catch (error) {
      console.error("Generate leads failed:", error);
      alert("Lead generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleEnrichAll() {
    setEnriching(true);

    try {
      const res = await fetch("/api/leads/enrich-all", {
        method: "POST",
      });
      const result = await res.json();

      console.log("Enrich Active result:", result);

      await loadLeads();
    } finally {
      setEnriching(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    window.location.href = "/login";
  }

  async function updateLeadLifecycle(
    lead: DashboardLead,
    status: LeadStatus
  ) {
    const slug = lead.slug || lead.id;

    if (!slug) return;

    setUpdatingLead(`${slug}:${status}`);

    try {
      const res = await fetch(`/api/leads/${slug}`, {
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

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          (currentLead.slug || currentLead.id) === slug
            ? data.lead
            : currentLead
        )
      );
    } catch (error) {
      console.error("Failed to update lead lifecycle:", error);
      alert("Failed to update lead.");
    } finally {
      setUpdatingLead("");
    }
  }

  useEffect(() => {
    // Initial dashboard data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
  }, []);

  useEffect(() => {
    notificationSoundRef.current = new Audio("/sounds/notification.mp3");

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default" &&
      !permissionRequestedRef.current
    ) {
      permissionRequestedRef.current = true;
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    // Initial notification load plus light polling for new replies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReplyNotifications();

    const interval = window.setInterval(() => {
      void loadReplyNotifications();
    }, 25000);

    return () => window.clearInterval(interval);
  }, []);

  const unreadLeadSlugs = useMemo(
    () =>
      new Set(
        replyNotifications
          .map((notification) => notification.lead_slug)
          .filter(Boolean)
      ),
    [replyNotifications]
  );

  const visibleLeads = useMemo(() => {
    const filteredLeads = leads.filter((lead) => {
      const status = lead.status || "new";

      if (activeFilter === "all") {
        return true;
      }

      if (activeFilter === "archived") {
        return status === "archived";
      }

      return status === "new" || status === "contacted";
    });

    return [...filteredLeads].sort((a, b) => {
      return (getOpportunityScore(b) || 0) - (getOpportunityScore(a) || 0);
    });
  }, [activeFilter, leads]);

  const summaryCounts = useMemo(() => {
    const activeLeads = leads.filter((lead) => {
      const status = lead.status || "new";

      return status === "new" || status === "contacted";
    });

    return activeLeads.reduce(
      (counts, lead) => {
        const score =
          typeof lead.websiteEvaluation?.score === "number"
            ? lead.websiteEvaluation.score
            : null;

        if (score === null) counts.unscored += 1;
        else if (score >= 70) counts.high += 1;
        else if (score >= 40) counts.medium += 1;
        else counts.low += 1;

        return counts;
      },
      { high: 0, medium: 0, low: 0, unscored: 0 }
    );
  }, [leads]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Lead Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Find leads, generate landing pages, and send outreach from one
              place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15"
              >
                Replies
                {replyNotifications.length > 0 ? (
                  <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {replyNotifications.length}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-white/10 bg-slate-900 p-3 shadow-2xl">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">
                      Unread replies
                    </p>
                    <span className="text-xs text-slate-500">
                      {replyNotifications.length}
                    </span>
                  </div>

                  {replyNotifications.length ? (
                    <div className="max-h-96 space-y-2 overflow-y-auto">
                      {replyNotifications.map((notification) => (
                        <Link
                          key={notification.id}
                          href={`/leads/${notification.lead_slug}`}
                          className="block rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-bold text-white">
                              {notification.business_name}
                            </p>
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-300">
                              {notification.channel}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                            {getReplyPreview(notification)}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {formatNotificationTime(notification.created_at)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-400">
                      No unread replies.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <button
              onClick={handleGenerateLeads}
              disabled={actionRunning}
              className="rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating..." : "+ Generate Leads"}
            </button>

            <button
              onClick={handleEnrichAll}
              disabled={actionRunning}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enriching ? "Enriching..." : "Enrich Active"}
            </button>

            <button
              onClick={handleLogout}
              disabled={actionRunning}
              className="rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-red-400/15 bg-red-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-300">
              High
            </p>
            <p className="mt-1 text-2xl font-black">{summaryCounts.high}</p>
          </div>

          <div className="rounded-xl border border-yellow-400/15 bg-yellow-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-yellow-300">
              Medium
            </p>
            <p className="mt-1 text-2xl font-black">{summaryCounts.medium}</p>
          </div>

          <div className="rounded-xl border border-slate-400/15 bg-slate-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
              Low
            </p>
            <p className="mt-1 text-2xl font-black">{summaryCounts.low}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Unscored
            </p>
            <p className="mt-1 text-2xl font-black">{summaryCounts.unscored}</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {leadFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                activeFilter === filter.value
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-slate-300 hover:bg-white/15"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-bold">{filterTitles[activeFilter]}</h2>
          </div>

          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-sm text-slate-400">
                  <th className="px-5 py-4">Lead</th>
                  <th className="px-5 py-4">Opportunity</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Rating</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-5 py-6 text-slate-400" colSpan={6}>
                      Loading leads...
                    </td>
                  </tr>
                ) : visibleLeads.length ? (
                  visibleLeads.map((lead) => {
                    const leadKey = `${lead.slug || lead.id || lead.businessName}-${
                      lead.city || "unknown"
                    }`;
                    const leadRoute = lead.slug || lead.id;
                    const opportunityScore = getOpportunityScore(lead);
                    const opportunityLabel = getOpportunityLabel(opportunityScore);
                    const qualityLabel = getQualityLabel(lead.websiteEvaluation);
                    const mainIssue = getMainIssue(lead);
                    const validEmail =
                      lead.email && !isPlaceholderEmail(lead.email)
                        ? lead.email
                        : "";

                    return (
                      <tr key={leadKey} className="border-b border-white/10">
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-white">
                              {lead.businessName || "Unnamed business"}
                            </p>
                            {leadRoute && unreadLeadSlugs.has(leadRoute) ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                                New reply
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {lead.trade || "Unknown trade"} - {lead.city || "Unknown city"}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getOpportunityBadgeClass(
                                opportunityScore
                              )}`}
                            >
                              {opportunityLabel}
                            </span>
                            <span className="text-xs font-bold text-slate-200">
                              {opportunityScore !== null
                                ? `${opportunityScore}/100`
                                : "Unscored"}
                            </span>
                            <span
                              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getQualityBadgeClass(
                                lead.websiteEvaluation
                              )}`}
                            >
                              {qualityLabel}
                            </span>
                            <span className="max-w-[180px] text-xs text-slate-400">
                              {mainIssue}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1 text-sm">
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target="_blank"
                                className="text-blue-400 hover:text-blue-300"
                              >
                                Visit website
                              </a>
                            ) : (
                              <p className="text-slate-500">No website</p>
                            )}
                            <p className="text-slate-300">
                              {validEmail || (
                                <span className="text-slate-500">No email</span>
                              )}
                            </p>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {lead.rating || "-"} ({lead.reviewCount || "0"})
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                              lead.status
                            )}`}
                          >
                            {statusLabels[lead.status || "new"] || "New"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex max-w-[280px] flex-wrap gap-2">
                            {leadRoute ? (
                              <Link
                                href={`/leads/${leadRoute}`}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"
                              >
                                Open
                              </Link>
                            ) : (
                              <span className="text-sm text-slate-500">
                                Missing slug
                              </span>
                            )}

                            {lifecycleActions
                              .filter((action) => action.status !== lead.status)
                              .map((action) => {
                                const updating =
                                  updatingLead ===
                                  `${lead.slug || lead.id}:${action.status}`;

                                return (
                                  <button
                                    key={action.status}
                                    onClick={() =>
                                      updateLeadLifecycle(lead, action.status)
                                    }
                                    disabled={Boolean(updatingLead)}
                                    className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {updating ? "Saving..." : action.label}
                                  </button>
                                );
                              })}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-slate-400" colSpan={6}>
                      No leads found for this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
