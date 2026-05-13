"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lead, LeadStage, WebsiteEvaluation } from "./lib/leads";
import type {
  StoredWebsiteOpportunityResult,
  WebsiteOpportunityLevel,
} from "./lib/websiteOpportunity";
import {
  getLastActivityLabel,
  getLeadStatusBadgeClass,
  getLeadStatusLabel,
} from "./lib/leadWorkflow";
import { CALLBOOST_MONTHLY_RECURRING_REVENUE } from "./lib/pricing";

type LeadPriority = "high" | "medium" | "low";
type WebsiteStatus = "no_website" | "weak_website" | "has_website";
type LeadFilter = "all" | LeadStage;
const DEFAULT_LEAD_FILTER: LeadFilter = "lead";
type NavigationMenuKey = "leads" | "tools" | "account";
type NavigationMenuItem =
  | {
      type: "link";
      label: string;
      href: string;
    }
  | {
      type: "button";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      destructive?: boolean;
    };
type DashboardLead = Lead & {
  priority?: LeadPriority;
  leadScore?: number;
  websiteStatus?: WebsiteStatus;
  websiteStatusReasons?: string[];
  websiteEvaluation?: WebsiteEvaluation;
  website_opportunity_v2?: StoredWebsiteOpportunityResult;
  payment_status?: string | null;
  client_started_at?: string | null;
};

type DashboardNotification =
  | {
      type: "reply";
      id: string;
      leadSlug: string;
      businessName: string;
      leadStage: LeadStage;
      leadStatus?: LeadStage;
      channel: "sms" | "email";
      body: string;
      subject: string;
      createdAt: string;
      label: string;
    }
  | {
      type: "payment";
      id: string;
      leadSlug: string;
      businessName: string;
      body: string;
      createdAt: string | null;
      label: string;
    }
  | {
      type: "follow_up";
      id: string;
      leadSlug: string;
      businessName: string;
      city: string;
      trade: string;
      nextFollowUpStage: 1 | 2 | 3;
      nextFollowUpLabel: string;
      dueAt: string | null;
      createdAt: string | null;
      label: string;
    };

type FollowUpQueueItem = {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  trade: string;
  lastOutboundAt: string | null;
  latestOutboundAt: string | null;
  nextFollowUpStage: 1 | 2 | 3;
  nextFollowUpLabel: string;
  dueAt: string | null;
  dueSince: string | null;
};

const leadFilters: Array<{ value: LeadFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "contacted", label: "Contacted" },
  { value: "client", label: "Clients" },
  { value: "archived", label: "Archived" },
];

const stageLabels: Record<LeadStage, string> = {
  lead: "Lead",
  contacted: "Contacted",
  client: "Client",
  archived: "Archived",
};

const filterTitles: Record<LeadFilter, string> = {
  all: "All Leads",
  lead: "Leads",
  contacted: "Contacted Leads",
  client: "Clients",
  archived: "Archived Leads",
};

function getOpportunityScore(lead: DashboardLead) {
  return typeof lead.websiteEvaluation?.score === "number"
    ? lead.websiteEvaluation.score
    : typeof lead.leadScore === "number"
      ? lead.leadScore
      : null;
}

function getOpportunityLevel(lead: DashboardLead): WebsiteOpportunityLevel | null {
  return lead.website_opportunity_v2?.level || null;
}

function getOpportunityLabel(
  level: WebsiteOpportunityLevel | null,
  score: number | null
) {
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  if (level === "low") return "Low";
  if (level === "unranked") return "Unranked";
  if (level === "none") return "None";
  if (score === null) return "No score";
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function getOpportunityBadgeClass(
  level: WebsiteOpportunityLevel | null,
  score: number | null
) {
  if (level === "high") return "bg-red-500/15 text-red-300";
  if (level === "medium") return "bg-yellow-500/15 text-yellow-300";
  if (level === "low") return "bg-blue-500/15 text-blue-300";
  if (level === "unranked") return "bg-purple-500/15 text-purple-300";
  if (level === "none") return "bg-green-500/15 text-green-300";
  if (score === null) return "bg-white/10 text-slate-400";
  if (score >= 70) return "bg-red-500/15 text-red-300";
  if (score >= 40) return "bg-yellow-500/15 text-yellow-300";
  return "bg-slate-500/15 text-slate-300";
}

function getOpportunitySortWeight(lead: DashboardLead) {
  const level = getOpportunityLevel(lead);

  if (level === "high") return 500;
  if (level === "medium") return 400;
  if (level === "low") return 300;
  if (level === "none") return 200;
  if (level === "unranked") return 100;

  return getOpportunityScore(lead) || 0;
}

function formatTradeLabel(value: unknown) {
  const trade = String(value || "").trim();

  if (!trade) return "Unknown trade";
  if (trade === "plumbing-gas-fitting") return "Plumbing and Gas Fitting";

  return trade
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getLeadStage(lead: Pick<DashboardLead, "stage">) {
  return lead.stage || "lead";
}

function getStageBadgeClass(stage?: string) {
  if (stage === "lead") return "bg-blue-500/15 text-blue-300";
  if (stage === "contacted") return "bg-slate-500/15 text-slate-300";
  if (stage === "client") return "bg-green-500/15 text-green-300";
  if (stage === "archived") return "bg-slate-700 text-slate-300";
  return "bg-white/10 text-slate-400";
}

function getPaymentStatus(lead: DashboardLead) {
  return lead.paymentStatus || lead.payment_status || "";
}

function getClientStartedAt(lead: DashboardLead) {
  return lead.clientStartedAt || lead.client_started_at || "";
}

function getClientStartedTime(lead: DashboardLead) {
  const value = getClientStartedAt(lead);
  const time = new Date(value || "").getTime();

  return Number.isFinite(time) ? time : 0;
}

function formatNotificationTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getNotificationPreview(notification: DashboardNotification) {
  if (notification.type === "follow_up") {
    const details = [notification.trade, notification.city].filter(Boolean).join(" - ");

    return details || notification.nextFollowUpLabel;
  }

  if (notification.type === "payment") {
    return notification.body;
  }

  const text = notification.body || notification.subject || "New reply";

  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function isActiveNavHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavDropdown({
  id,
  label,
  items,
  openMenu,
  setOpenMenu,
  pathname,
}: {
  id: NavigationMenuKey;
  label: string;
  items: NavigationMenuItem[];
  openMenu: NavigationMenuKey | null;
  setOpenMenu: (menu: NavigationMenuKey | null) => void;
  pathname: string;
}) {
  const isOpen = openMenu === id;
  const isActive = items.some(
    (item) => item.type === "link" && isActiveNavHref(pathname, item.href)
  );

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-400/70 ${
          isActive || isOpen
            ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
            : "bg-white/10 text-slate-200 hover:bg-white/15"
        }`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`mt-[-2px] h-2 w-2 border-b-2 border-r-2 border-current transition-transform duration-200 ${
            isOpen ? "rotate-[225deg]" : "rotate-45"
          }`}
        />
      </button>

      <div
        role="menu"
        aria-label={label}
        className={`absolute right-0 z-30 mt-2 w-52 origin-top-right rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur transition duration-150 ease-out ${
          isOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        {items.map((item) => {
          if (item.type === "link") {
            const active = isActiveNavHref(pathname, item.href);

            return (
              <Link
                key={item.href}
                role="menuitem"
                href={item.href}
                onClick={() => setOpenMenu(null)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-400/70 ${
                  active
                    ? "bg-blue-600/25 text-blue-100"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMenu(null);
                item.onClick();
              }}
              disabled={item.disabled}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-60 ${
                item.destructive
                  ? "text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function playMp3Fallback() {
  if (typeof window === "undefined") return;

  const audio = new Audio("/sounds/notification.mp3");

  audio.volume = 1.0;
  audio.play().catch((err) => {
    console.warn("Notification sound fallback failed", err);
  });
}

function playNotificationBeep() {
  try {
    if (typeof window === "undefined") return;

    const AudioContextClass =
      window.AudioContext || (window as AudioContextWindow).webkitAudioContext;

    if (!AudioContextClass) {
      playMp3Fallback();
      return;
    }

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.onended = () => {
      void ctx.close().catch(() => {});
    };

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (err) {
    console.warn("Beep failed", err);
    playMp3Fallback();
  }
}

function playDoubleBeep() {
  console.log("Playing notification sound");
  playNotificationBeep();
  window.setTimeout(() => playNotificationBeep(), 180);
}

function playTripleBeep() {
  console.log("Playing notification sound");
  playNotificationBeep();
  window.setTimeout(() => playNotificationBeep(), 150);
  window.setTimeout(() => playNotificationBeep(), 300);
}

function isHotLeadReply(notification: DashboardNotification) {
  return (
    notification.type === "reply" &&
    /\b(how much|price|quote|cost)\b/i.test(notification.body || "")
  );
}

function playLeadReplySound(notification: DashboardNotification) {
  if (isHotLeadReply(notification)) {
    playTripleBeep();
    return;
  }

  playDoubleBeep();
}

function getStoredSoundEnabled() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem("callboost_sound_enabled") === "true"
  );
}

function getLeadSelectionKey(lead: DashboardLead) {
  if (lead.slug) return lead.slug;
  if (lead.id !== undefined && lead.id !== null) return String(lead.id);

  return `${lead.name || lead.businessName || "lead"}-${lead.city || ""}-${
    lead.trade || ""
  }`;
}

export default function DashboardPage() {
  const pathname = usePathname();
  const [leads, setLeads] = useState<DashboardLead[]>([]);
  const [clientRevenueLeads, setClientRevenueLeads] = useState<DashboardLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState<string | null>(
    null
  );
  const [bulkActionNotice, setBulkActionNotice] = useState("");
  const [bulkActionError, setBulkActionError] = useState("");
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [activeFilter, setActiveFilter] =
    useState<LeadFilter>(DEFAULT_LEAD_FILTER);
  const [notifications, setNotifications] = useState<
    DashboardNotification[]
  >([]);
  const [followUpQueue, setFollowUpQueue] = useState<FollowUpQueueItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [openNavMenu, setOpenNavMenu] = useState<NavigationMenuKey | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(getStoredSoundEnabled);
  const prevNotificationIdsRef = useRef<Set<string>>(new Set());
  const isFirstNotificationLoadRef = useRef(true);
  const soundEnabledRef = useRef(soundEnabled);
  const permissionRequestedRef = useRef(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const topNavigationRef = useRef<HTMLDivElement | null>(null);
  const actionRunning = enriching || Boolean(bulkActionRunning);

  const loadLeads = useCallback(
    async (filter: LeadFilter) => {
      const params = new URLSearchParams();

      if (filter !== "all") params.set("stage", filter);

      const query = params.toString();
      const url = query ? `/api/leads?${query}` : "/api/leads";

      console.log("Lead stage filter:", filter);

      const res = await fetch(url, {
        cache: "no-store",
      });

      const data = await res.json();
      const fetchedLeads = data.leads || [];

      console.log("Fetched leads count:", fetchedLeads.length);

      setLeads(fetchedLeads);
      setLoading(false);
    },
    []
  );

  const loadClientRevenueLeads = useCallback(async () => {
    const res = await fetch("/api/leads?stage=client", {
      cache: "no-store",
    });

    if (!res.ok) return;

    const data = await res.json();

    setClientRevenueLeads(data.leads || []);
  }, []);

  const loadFollowUpQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/follow-ups/needs", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load follow-up queue");
      }

      setFollowUpQueue(data.needsFollowUp || []);
    } catch (error) {
      console.error("Failed to load follow-up queue:", error);
      setFollowUpQueue([]);
    }
  }, []);

  async function loadNotifications() {
    try {
      const res = await fetch("/api/notifications", {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data = await res.json();
      const nextNotifications = (data.notifications || []) as
        DashboardNotification[];
      const nextIds = new Set(
        nextNotifications.map((notification) => notification.id).filter(Boolean)
      );
      const newestNotification = nextNotifications.find(
        (notification) => !prevNotificationIdsRef.current.has(notification.id)
      );

      if (!isFirstNotificationLoadRef.current && newestNotification) {
        if (soundEnabledRef.current) {
          playLeadReplySound(newestNotification);
        }

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(
            newestNotification.type === "reply"
              ? "New Lead Reply"
              : "Follow-up Due",
            {
              body: `${newestNotification.businessName}: ${getNotificationPreview(
                newestNotification
              ).slice(0, 80)}`,
            }
          );
        }
      }

      prevNotificationIdsRef.current = nextIds;
      isFirstNotificationLoadRef.current = false;
      setNotifications(nextNotifications);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  }

  function handleEnableSoundAlerts() {
    playDoubleBeep();
    soundEnabledRef.current = true;
    setSoundEnabled(true);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("callboost_sound_enabled", "true");
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

      await loadLeads(activeFilter);
      await loadClientRevenueLeads();
      await loadFollowUpQueue();
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

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        topNavigationRef.current?.contains(target)
      ) {
        return;
      }

      setOpenNavMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenNavMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    // Initial dashboard data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads(activeFilter);
  }, [activeFilter, loadLeads]);

  useEffect(() => {
    // Initial revenue snapshot for the dashboard summary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClientRevenueLeads();
  }, [loadClientRevenueLeads]);

  useEffect(() => {
    // Initial manual follow-up queue load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFollowUpQueue();

    const interval = window.setInterval(() => {
      void loadFollowUpQueue();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [loadFollowUpQueue]);

  useEffect(() => {
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
    // Initial notification load plus light polling for new attention items.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 25000);

    return () => window.clearInterval(interval);
  }, []);

  const unreadLeadSlugs = useMemo(
    () =>
      new Set(
        notifications
          .filter((notification) => notification.type === "reply")
          .map((notification) => notification.leadSlug)
          .filter(Boolean)
      ),
    [notifications]
  );

  const visibleLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      if (activeFilter === "client") {
        return getClientStartedTime(b) - getClientStartedTime(a);
      }

      return getOpportunitySortWeight(b) - getOpportunitySortWeight(a);
    });
  }, [activeFilter, leads]);

  const selectedLeads = useMemo(() => {
    return visibleLeads.filter((lead) =>
      selectedLeadKeys.has(getLeadSelectionKey(lead))
    );
  }, [selectedLeadKeys, visibleLeads]);

  const allVisibleSelected =
    visibleLeads.length > 0 &&
    visibleLeads.every((lead) => selectedLeadKeys.has(getLeadSelectionKey(lead)));
  const someVisibleSelected = selectedLeads.length > 0;
  const selectedClientCount = selectedLeads.filter(
    (lead) => getLeadStage(lead) === "client"
  ).length;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  function isLeadSelected(lead: DashboardLead) {
    return selectedLeadKeys.has(getLeadSelectionKey(lead));
  }

  function toggleLeadSelection(lead: DashboardLead) {
    const key = getLeadSelectionKey(lead);

    setSelectedLeadKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function toggleVisibleLeadSelection() {
    setSelectedLeadKeys((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const lead of visibleLeads) {
          next.delete(getLeadSelectionKey(lead));
        }
      } else {
        for (const lead of visibleLeads) {
          next.add(getLeadSelectionKey(lead));
        }
      }

      return next;
    });
  }

  function clearSelectedLeads() {
    setSelectedLeadKeys(new Set());
  }

  async function runSelectedBulkAction(
    action: "enrich" | "website_evaluation" | "contacted" | "archived"
  ) {
    const slugs = selectedLeads
      .map((lead) => lead.slug || "")
      .filter((slug) => slug);

    if (!slugs.length) {
      alert("Selected leads need slugs before bulk actions can run.");
      return;
    }

    setBulkActionRunning(action);
    setBulkActionNotice("");
    setBulkActionError("");

    try {
      const isStageAction = action === "contacted" || action === "archived";
      const endpoint =
        action === "website_evaluation"
          ? "/api/leads/website-evaluation"
          : isStageAction
            ? "/api/leads/bulk-stage"
            : "/api/leads/enrich-selected";
      const res = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isStageAction
              ? {
                  slugs,
                  stage: action,
                }
              : { slugs }
          ),
        }
      );
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Bulk action failed:", result);
        setBulkActionError(result.message || result.error || "Bulk action failed");
        return;
      }

      console.log("Bulk action result:", { action, result });
      await loadLeads(activeFilter);
      await loadClientRevenueLeads();
      await loadFollowUpQueue();
      clearSelectedLeads();
    } catch (error) {
      console.error("Bulk action failed:", error);
      setBulkActionError("Bulk action failed");
    } finally {
      setBulkActionRunning(null);
    }
  }

  async function handleDeleteSelectedLeads() {
    const slugs = selectedLeads
      .map((lead) => lead.slug || "")
      .filter((slug) => slug);

    if (!slugs.length) {
      setBulkActionError("Selected leads need slugs before deletion can run.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedLeads.length} selected leads? This cannot be undone.`
    );

    if (!confirmed) return;

    setBulkActionRunning("delete");
    setBulkActionNotice("");
    setBulkActionError("");

    try {
      const res = await fetch("/api/leads/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: slugs }),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Bulk delete failed:", result);
        setBulkActionError(result.message || result.error || "Bulk delete failed");
        return;
      }

      const deleted = Number(result.deleted) || 0;
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];

      setBulkActionNotice(
        warnings.length
          ? `Deleted ${deleted} leads. Some generated asset cleanup failed and can be retried later.`
          : `Deleted ${deleted} leads.`
      );
      clearSelectedLeads();
      await loadLeads(activeFilter);
      await loadClientRevenueLeads();
      await loadFollowUpQueue();
    } catch (error) {
      console.error("Bulk delete failed:", error);
      setBulkActionError("Bulk delete failed");
    } finally {
      setBulkActionRunning(null);
    }
  }

  const revenueSummary = useMemo(() => {
    const payingClients = clientRevenueLeads.filter(
      (lead) => getLeadStage(lead) === "client" && getPaymentStatus(lead) === "paid"
    );

    return {
      activeClients: payingClients.length,
      mrr: payingClients.length * CALLBOOST_MONTHLY_RECURRING_REVENUE,
    };
  }, [clientRevenueLeads]);

  const summaryCounts = useMemo(() => {
    return leads.reduce(
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

  const setNavigationMenu = (menu: NavigationMenuKey | null) => {
    setNotificationsOpen(false);
    setOpenNavMenu(menu);
  };
  const leadsMenuItems: NavigationMenuItem[] = [
    { type: "link", label: "Dashboard", href: "/" },
    { type: "link", label: "Generate Leads", href: "/generate-leads" },
  ];
  const toolsMenuItems: NavigationMenuItem[] = [
    { type: "link", label: "Branding", href: "/branding" },
    { type: "link", label: "Assets", href: "/assets" },
    { type: "link", label: "Reports", href: "/reports" },
  ];
  const accountMenuItems: NavigationMenuItem[] = [
    {
      type: "button",
      label: "Logout",
      onClick: handleLogout,
      disabled: actionRunning,
      destructive: true,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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

          <div
            ref={topNavigationRef}
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end"
          >
            {!soundEnabled ? (
              <button
                onClick={handleEnableSoundAlerts}
                className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                Enable sound alerts
              </button>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setOpenNavMenu(null);
                  setNotificationsOpen((open) => !open);
                }}
                className={`relative rounded-lg px-5 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-400/70 ${
                  notificationsOpen
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                    : "bg-white/10 text-slate-200 hover:bg-white/15"
                }`}
              >
                Notifications
                {notifications.length > 0 ? (
                  <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {notifications.length}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-white/10 bg-slate-900 p-3 shadow-2xl shadow-black/40 ring-1 ring-white/5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">
                      Notifications
                    </p>
                    <span className="text-xs text-slate-500">
                      {notifications.length}
                    </span>
                  </div>

                  {notifications.length ? (
                    <div className="max-h-96 space-y-2 overflow-y-auto">
                      {notifications.map((notification) => (
                        <Link
                          key={notification.id}
                          href={`/leads/${notification.leadSlug}`}
                          className="block rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-bold text-white">
                              {notification.businessName}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                notification.type === "reply"
                                  ? "bg-cyan-500/15 text-cyan-300"
                                  : notification.type === "payment"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-blue-500/15 text-blue-300"
                              }`}
                            >
                              {notification.type === "reply"
                                ? "New reply"
                                : notification.type === "payment"
                                  ? "Payment"
                                  : "Follow-up due"}
                            </span>
                            {notification.type === "reply" ? (
                              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-300">
                                {notification.channel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                            {getNotificationPreview(notification)}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {formatNotificationTime(
                              notification.createdAt || ""
                            )}
                          </p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-400">
                      No notifications.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <NavDropdown
              id="leads"
              label="Leads"
              items={leadsMenuItems}
              openMenu={openNavMenu}
              setOpenMenu={setNavigationMenu}
              pathname={pathname}
            />

            <NavDropdown
              id="tools"
              label="Tools"
              items={toolsMenuItems}
              openMenu={openNavMenu}
              setOpenMenu={setNavigationMenu}
              pathname={pathname}
            />

            <NavDropdown
              id="account"
              label="Account"
              items={accountMenuItems}
              openMenu={openNavMenu}
              setOpenMenu={setNavigationMenu}
              pathname={pathname}
            />
          </div>
        </div>

        <div className="mb-6 flex justify-start">
          <button
            onClick={handleEnrichAll}
            disabled={actionRunning}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enriching ? "Enriching..." : "Enrich Leads"}
          </button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-300">
              MRR
            </p>
            <p className="mt-1 text-2xl font-black">
              $
              {revenueSummary.mrr.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="mt-1 text-xs font-bold text-green-200/80">
              Active Clients: {revenueSummary.activeClients}
            </p>
          </div>

          <Link
            href="/follow-ups"
            className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 hover:bg-blue-500/15"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
              Follow-ups
            </p>
            <p className="mt-1 text-2xl font-black">{followUpQueue.length}</p>
            <p className="mt-1 text-xs font-bold text-blue-200/80">
              Need review
            </p>
          </Link>

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

        <div className="mb-4 flex items-center gap-3">
          <label className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Stage
            </span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as LeadFilter)}
              className="min-w-44 rounded-lg border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-100 shadow-lg shadow-black/20 outline-none transition hover:bg-slate-800 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/30"
            >
              {leadFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedLeads.length > 0 ? (
          <div className="sticky top-3 z-10 mb-4 flex flex-col gap-3 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-blue-100">
              {selectedLeads.length} selected
              {selectedClientCount > 0 ? (
                <span className="ml-2 text-xs text-blue-200/70">
                  {selectedClientCount} client
                  {selectedClientCount === 1 ? "" : "s"} protected
                </span>
              ) : null}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={clearSelectedLeads}
                disabled={Boolean(bulkActionRunning)}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear selection
              </button>

              <button
                onClick={() => runSelectedBulkAction("enrich")}
                disabled={Boolean(bulkActionRunning)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkActionRunning === "enrich"
                  ? "Enriching..."
                  : "Enrich Selected"}
              </button>

              <button
                onClick={() => runSelectedBulkAction("website_evaluation")}
                disabled={Boolean(bulkActionRunning)}
                className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkActionRunning === "website_evaluation"
                  ? "Evaluating..."
                  : "Website Evaluation"}
              </button>

              <button
                onClick={() => runSelectedBulkAction("contacted")}
                disabled={Boolean(bulkActionRunning) || selectedClientCount > 0}
                className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkActionRunning === "contacted"
                  ? "Updating..."
                  : "Mark Contacted"}
              </button>

              <button
                onClick={() => runSelectedBulkAction("archived")}
                disabled={Boolean(bulkActionRunning) || selectedClientCount > 0}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkActionRunning === "archived"
                  ? "Archiving..."
                  : "Archive Selected"}
              </button>

              <button
                onClick={handleDeleteSelectedLeads}
                disabled={Boolean(bulkActionRunning)}
                className="rounded-lg bg-red-950 px-3 py-2 text-xs font-bold text-red-100 ring-1 ring-red-400/40 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkActionRunning === "delete"
                  ? "Deleting..."
                  : "Delete Selected"}
              </button>
            </div>
          </div>
        ) : null}

        {bulkActionNotice ? (
          <p className="mb-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm font-bold text-green-300">
            {bulkActionNotice}
          </p>
        ) : null}

        {bulkActionError ? (
          <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
            {bulkActionError}
          </p>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-bold">{filterTitles[activeFilter]}</h2>
          </div>

          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-sm text-slate-400">
                  <th className="w-12 px-5 py-4">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleLeadSelection}
                      disabled={!visibleLeads.length || actionRunning}
                      className="h-4 w-4"
                      aria-label="Select all visible leads"
                    />
                  </th>
                  <th className="px-5 py-4">Lead</th>
                  <th className="px-5 py-4">Trade</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Opportunity</th>
                  <th className="px-5 py-4">Stage</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Last Activity</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-5 py-6 text-slate-400" colSpan={9}>
                      Loading leads...
                    </td>
                  </tr>
                ) : visibleLeads.length ? (
                  visibleLeads.map((lead) => {
                    const leadName = lead.name || lead.businessName || "";
                    const leadKey = `${lead.slug || lead.id || leadName}-${
                      lead.city || "unknown"
                    }`;
                    const leadRoute = lead.slug || lead.id;
                    const opportunityScore = getOpportunityScore(lead);
                    const opportunityLevel = getOpportunityLevel(lead);
                    const opportunityLabel = getOpportunityLabel(
                      opportunityLevel,
                      opportunityScore
                    );
                    const selected = isLeadSelected(lead);
                    const paymentFailed =
                      getPaymentStatus(lead) === "payment_failed";
                    const leadStage = getLeadStage(lead);
                    const lastActivity =
                      lead.lastActivityAt || lead.last_activity_at || "";

                    return (
                      <tr
                        key={leadKey}
                        className={`border-b ${
                          paymentFailed
                            ? "border-red-400/30 bg-red-500/10"
                            : selected
                              ? "border-blue-400/20 bg-blue-500/10"
                              : "border-white/10"
                        } ${paymentFailed && selected ? "ring-1 ring-blue-400/20" : ""}`}
                      >
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleLeadSelection(lead)}
                            disabled={actionRunning}
                            className="h-4 w-4"
                            aria-label={`Select ${leadName || "lead"}`}
                          />
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-white">
                              {leadName || "Unnamed business"}
                            </p>
                            {leadRoute && unreadLeadSlugs.has(leadRoute) ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                                New reply
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm font-bold text-slate-200">
                          {formatTradeLabel(lead.trade)}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {lead.city || lead.address || "Unknown location"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getOpportunityBadgeClass(
                              opportunityLevel,
                              opportunityScore
                            )}`}
                          >
                            {opportunityLabel}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getStageBadgeClass(
                              leadStage
                            )}`}
                          >
                            {stageLabels[leadStage] || "Lead"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getLeadStatusBadgeClass(
                              lead.status
                            )}`}
                          >
                            {getLeadStatusLabel(lead.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {getLastActivityLabel(lastActivity)}
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

                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-slate-400" colSpan={9}>
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

