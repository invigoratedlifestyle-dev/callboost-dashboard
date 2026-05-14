import Link from "next/link";
import {
  formatPercent,
  getCallBoostReport,
  normalizeReportRange,
  type ReportRange,
} from "../lib/reports";

type ReportsPageProps = {
  searchParams: Promise<{ range?: string | string[] }>;
};

const rangeOptions: Array<{ value: ReportRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function KpiCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "green" | "blue" | "red" | "yellow" | "slate";
}) {
  const toneClass = {
    green: "border-green-400/20 bg-green-500/10 text-green-300",
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-300",
    red: "border-red-400/20 bg-red-500/10 text-red-300",
    yellow: "border-yellow-400/20 bg-yellow-500/10 text-yellow-300",
    slate: "border-white/10 bg-white/5 text-slate-300",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-90">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const range = normalizeReportRange(params.range);
  const report = await getCallBoostReport(range);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">Reports</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Outreach, reply and conversion performance for {report.rangeLabel}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15"
            >
              Dashboard
            </Link>
            <a
              href={`/api/reports/export?range=${range}`}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
            >
              Export PDF
            </a>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Link
              key={option.value}
              href={`/reports?range=${option.value}`}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${
                range === option.value
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-slate-300 hover:bg-white/15"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Leads contacted today"
            value={report.kpis.leadsContactedToday}
            tone="blue"
          />
          <KpiCard
            label="Total contacted"
            value={report.kpis.totalLeadsContacted}
            tone="blue"
          />
          <KpiCard
            label="Outbound SMS"
            value={report.kpis.totalOutboundSms}
            tone="slate"
          />
          <KpiCard
            label="Outbound emails"
            value={report.kpis.totalOutboundEmails}
            tone="slate"
          />
          <KpiCard
            label="Inbound replies"
            value={report.kpis.totalInboundReplies}
            tone="green"
          />
          <KpiCard
            label="STOP replies"
            value={report.kpis.stopReplies}
            tone="red"
          />
          <KpiCard
            label="Interested replies"
            value={report.kpis.interestedReplies}
            tone="green"
          />
          <KpiCard
            label="Not interested"
            value={report.kpis.notInterestedReplies}
            tone="yellow"
          />
          <KpiCard
            label="Contact to reply"
            value={formatPercent(report.kpis.contactToReplyRate)}
            tone="green"
          />
          <KpiCard
            label="Contact to interest"
            value={formatPercent(report.kpis.contactToInterestRate)}
            tone="green"
          />
          <KpiCard
            label="STOP rate"
            value={formatPercent(report.kpis.stopRate)}
            tone="red"
          />
          <KpiCard label="Clients won" value={report.kpis.clientsWon} tone="blue" />
          <KpiCard
            label="Open rate"
            value={formatPercent(report.kpis.openRate)}
            tone="blue"
          />
          <KpiCard
            label="Preview click rate"
            value={formatPercent(report.kpis.previewClickRate)}
            tone="green"
          />
          <KpiCard
            label="Total opens"
            value={report.kpis.totalOpens}
            tone="slate"
          />
          <KpiCard
            label="Preview clicks"
            value={report.kpis.totalPreviewClicks}
            tone="slate"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-bold">Daily activity</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Contacted</th>
                    <th className="px-5 py-3">Replies</th>
                    <th className="px-5 py-3">Interested</th>
                    <th className="px-5 py-3">STOP</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyActivity.length ? (
                    report.dailyActivity.map((row) => (
                      <tr key={row.date} className="border-b border-white/10">
                        <td className="px-5 py-3 font-bold text-white">{row.date}</td>
                        <td className="px-5 py-3 text-slate-300">{row.contacted}</td>
                        <td className="px-5 py-3 text-slate-300">{row.replies}</td>
                        <td className="px-5 py-3 text-green-300">{row.interested}</td>
                        <td className="px-5 py-3 text-red-300">{row.stops}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-5 py-5 text-slate-400" colSpan={5}>
                        No activity for this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-bold">Channel performance</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3">Channel</th>
                    <th className="px-5 py-3">Outbound</th>
                    <th className="px-5 py-3">Replies</th>
                    <th className="px-5 py-3">Interested</th>
                    <th className="px-5 py-3">Reply rate</th>
                    <th className="px-5 py-3">Interest rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.channelPerformance.map((row) => (
                    <tr key={row.channel} className="border-b border-white/10">
                      <td className="px-5 py-3 font-bold uppercase text-white">
                        {row.channel}
                      </td>
                      <td className="px-5 py-3 text-slate-300">{row.outbound}</td>
                      <td className="px-5 py-3 text-slate-300">{row.replies}</td>
                      <td className="px-5 py-3 text-green-300">{row.interested}</td>
                      <td className="px-5 py-3 text-slate-300">
                        {formatPercent(row.replyRate)}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {formatPercent(row.interestRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-bold">Recent interested replies</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">Trade</th>
                  <th className="px-5 py-3">Reply</th>
                  <th className="px-5 py-3">Received</th>
                </tr>
              </thead>
              <tbody>
                {report.recentInterestedReplies.length ? (
                  report.recentInterestedReplies.map((reply) => (
                    <tr key={reply.id} className="border-b border-white/10">
                      <td className="px-5 py-3 font-bold text-white">
                        {reply.slug ? (
                          <Link
                            href={`/leads/${reply.slug}`}
                            className="text-blue-300 hover:text-blue-200"
                          >
                            {reply.businessName}
                          </Link>
                        ) : (
                          reply.businessName
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-300">{reply.city || "-"}</td>
                      <td className="px-5 py-3 text-slate-300">{reply.trade || "-"}</td>
                      <td className="max-w-xl px-5 py-3 text-slate-300">
                        {reply.snippet}
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {formatDate(reply.receivedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-5 text-slate-400" colSpan={5}>
                      No interested replies for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
