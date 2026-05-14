import Link from "next/link";
import {
  formatAnalyticsPercent,
  getCallBoostAnalytics,
} from "../../lib/analytics";

function formatDate(value: string) {
  if (!value) return "No engagement yet";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const analytics = await getCallBoostAnalytics();
  const hotLeadCount = analytics.hotLeads.filter((lead) => lead.clicks > 0).length;
  const warmLeadCount = analytics.hotLeads.filter(
    (lead) => lead.clicks === 0 && lead.opens >= 3
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">Analytics</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Outreach engagement across email opens, preview clicks and repeat
              lead activity.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15"
          >
            Dashboard
          </Link>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <SummaryCard
            label="Messages Sent"
            value={analytics.totalOutboundMessages}
          />
          <SummaryCard
            label="Open Rate"
            value={formatAnalyticsPercent(analytics.openRate)}
          />
          <SummaryCard
            label="Preview Click Rate"
            value={formatAnalyticsPercent(analytics.clickRate)}
          />
          <SummaryCard label="Total Opens" value={analytics.totalOpens} />
          <SummaryCard
            label="Total Preview Clicks"
            value={analytics.totalClicks}
          />
          <Link href="/?stage=engaged">
            <SummaryCard label="Hot Leads" value={hotLeadCount} />
          </Link>
          <Link href="/?stage=engaged">
            <SummaryCard label="Warm Leads" value={warmLeadCount} />
          </Link>
        </div>

        <p className="mb-6 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
          Email opens are estimates because some email clients block or pre-load
          tracking pixels. Preview clicks are a stronger intent signal. Use the
          Engaged stage to action hot and warm leads.
        </p>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-bold">Hot Leads</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3">Trade / City</th>
                    <th className="px-5 py-3">Opens</th>
                    <th className="px-5 py-3">Preview Clicks</th>
                    <th className="px-5 py-3">Last Engagement</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.hotLeads.length ? (
                    analytics.hotLeads.map((lead) => (
                      <tr key={lead.leadKey} className="border-b border-white/5">
                        <td className="px-5 py-4 font-bold text-white">
                          {lead.businessName}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {[lead.trade, lead.city].filter(Boolean).join(" / ") ||
                            "Unknown"}
                        </td>
                        <td className="px-5 py-4 text-slate-300">{lead.opens}</td>
                        <td className="px-5 py-4 text-slate-300">
                          {lead.clicks}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {formatDate(lead.lastEngagement)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {lead.status || "Unknown"}
                        </td>
                        <td className="px-5 py-4">
                          {lead.slug ? (
                            <Link
                              href={`/leads/${lead.slug}`}
                              className="font-bold text-blue-300 hover:text-blue-200"
                            >
                              View lead
                            </Link>
                          ) : (
                            <span className="text-slate-500">No link</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-5 py-6 text-slate-400" colSpan={7}>
                        No hot leads yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-bold">Recent Engagement</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3">Event</th>
                    <th className="px-5 py-3">Channel</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentEngagement.length ? (
                    analytics.recentEngagement.map((event) => (
                      <tr key={event.id} className="border-b border-white/5">
                        <td className="px-5 py-4 text-slate-300">
                          {formatDate(event.time)}
                        </td>
                        <td className="px-5 py-4 font-bold text-white">
                          {event.businessName}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${
                              event.eventType === "click"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-blue-500/15 text-blue-300"
                            }`}
                          >
                            {event.eventType === "click" ? "Preview click" : "Open"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {event.channel}
                        </td>
                        <td className="px-5 py-4">
                          {event.slug ? (
                            <Link
                              href={`/leads/${event.slug}`}
                              className="font-bold text-blue-300 hover:text-blue-200"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-slate-500">No link</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-5 py-6 text-slate-400" colSpan={5}>
                        No tracked engagement yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-lg font-bold">Channel Breakdown</h2>
            <div className="space-y-3">
              {analytics.channelBreakdown.map((channel) => (
                <div
                  key={channel.channel}
                  className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold uppercase text-white">
                      {channel.channel}
                    </p>
                    <p className="text-sm text-slate-400">
                      {channel.sent} sent
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Opens {formatAnalyticsPercent(channel.openRate)} · Clicks{" "}
                    {formatAnalyticsPercent(channel.clickRate)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-lg font-bold">Subject Performance</h2>
            <div className="space-y-3">
              {analytics.subjectPerformance.length ? (
                analytics.subjectPerformance.map((subject) => (
                  <div
                    key={subject.subject}
                    className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3"
                  >
                    <p className="font-bold text-white">{subject.subject}</p>
                    <p className="mt-2 text-sm text-slate-300">
                      {subject.sent} sent · Opens{" "}
                      {formatAnalyticsPercent(subject.openRate)} · Clicks{" "}
                      {formatAnalyticsPercent(subject.clickRate)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-slate-400">No email subject data yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
