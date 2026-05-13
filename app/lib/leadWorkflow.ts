export const leadStatuses = [
  "new",
  "in_progress",
  "ready_for_client",
  "waiting_client",
  "follow_up_1",
  "follow_up_2",
  "final_follow_up",
  "replied",
  "paid",
  "closed",
] as const;

export type LeadStatus = (typeof leadStatuses)[number];
export type LeadWorkflowStage = "lead" | "contacted" | "client" | "archived";

const terminalStatuses = new Set<LeadStatus>(["replied", "paid", "closed"]);
const stageStatusMap: Record<LeadWorkflowStage, LeadStatus[]> = {
  lead: ["new", "in_progress", "ready_for_client"],
  contacted: [
    "waiting_client",
    "follow_up_1",
    "follow_up_2",
    "final_follow_up",
    "replied",
  ],
  client: ["paid"],
  archived: ["closed"],
};
const defaultStatusByStage: Record<LeadWorkflowStage, LeadStatus> = {
  lead: "new",
  contacted: "waiting_client",
  client: "paid",
  archived: "closed",
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  ready_for_client: "Ready for Client",
  waiting_client: "Waiting Client",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  final_follow_up: "Final Follow-up",
  replied: "Replied",
  paid: "Paid",
  closed: "Closed",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" && leadStatuses.includes(value as LeadStatus)
  );
}

export function normalizeLeadStatus(value: unknown): LeadStatus {
  return isLeadStatus(value) ? value : "new";
}

export function getAllowedStatusesForStage(stage: unknown) {
  const normalizedStage = normalizeLeadStageForWorkflow(stage);

  return stageStatusMap[normalizedStage];
}

export function normalizeLeadStageStatus(
  stage: unknown,
  status: unknown
): LeadStatus {
  const normalizedStage = normalizeLeadStageForWorkflow(stage);
  const normalizedStatus = normalizeLeadStatus(status);
  const allowedStatuses = stageStatusMap[normalizedStage];

  return allowedStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : defaultStatusByStage[normalizedStage];
}

export function enforceLeadStageStatus<T extends Record<string, unknown>>(
  lead: T
): T & { status: LeadStatus; workflowStatus: LeadStatus } {
  const status = normalizeLeadStageStatus(lead.stage, lead.status);

  return {
    ...lead,
    status,
    workflowStatus: status,
  };
}

function normalizeLeadStageForWorkflow(stage: unknown): LeadWorkflowStage {
  if (
    stage === "lead" ||
    stage === "contacted" ||
    stage === "client" ||
    stage === "archived"
  ) {
    return stage;
  }

  return "lead";
}

export function getLeadStatusLabel(value: unknown) {
  return leadStatusLabels[normalizeLeadStatus(value)];
}

export function shouldPreserveLeadStatus(value: unknown) {
  return terminalStatuses.has(normalizeLeadStatus(value));
}

export function getLeadStatusBadgeClass(value: unknown) {
  const status = normalizeLeadStatus(value);

  if (status === "new") return "bg-blue-500/15 text-blue-300";
  if (status === "in_progress") return "bg-amber-500/15 text-amber-300";
  if (status === "ready_for_client") return "bg-emerald-500/15 text-emerald-300";
  if (status === "waiting_client") return "bg-indigo-500/15 text-indigo-300";
  if (status === "follow_up_1") return "bg-yellow-500/15 text-yellow-300";
  if (status === "follow_up_2") return "bg-orange-500/15 text-orange-300";
  if (status === "final_follow_up") return "bg-red-500/15 text-red-300";
  if (status === "replied") return "bg-cyan-500/15 text-cyan-300";
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300";

  return "bg-slate-700 text-slate-300";
}

export function getLastActivityLabel(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  const time = date.getTime();

  if (!Number.isFinite(time)) return "--";

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));

  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}
