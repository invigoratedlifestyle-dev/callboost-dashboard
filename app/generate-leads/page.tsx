import Link from "next/link";
import LeadGenerationPanel from "../components/LeadGenerationPanel";

export default function GenerateLeadsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Generate Leads
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Queue Google Places lead generation across one or more towns.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15"
          >
            View Dashboard
          </Link>
        </div>

        <LeadGenerationPanel />
      </div>
    </main>
  );
}
