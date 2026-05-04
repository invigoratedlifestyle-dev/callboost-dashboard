import Link from "next/link";

const trades = [
  "Plumbers",
  "Electricians",
  "Landscapers",
  "Cleaners",
  "Roofers",
  "Local trade businesses",
];

const steps = [
  {
    title: "We set up the site",
    copy: "CallBoost builds a simple, professional website around your services, service area, and contact details.",
  },
  {
    title: "We handle the domain",
    copy: "Domain setup is handled for you as part of the service, so you do not need to wrestle with DNS or hosting tools.",
  },
  {
    title: "You get enquiries",
    copy: "Your mobile-friendly site includes an enquiry and callback form so customers can reach you quickly.",
  },
];

export const metadata = {
  title: "CallBoost | Done-for-you websites for local trades",
  description:
    "CallBoost builds and hosts simple mobile-friendly websites for local service businesses.",
};

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/marketing" className="text-lg font-black tracking-tight">
            CallBoost
          </Link>
          <nav className="flex items-center gap-4 text-sm font-bold text-slate-300">
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
            >
              Get started
            </Link>
          </nav>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
            Done-for-you websites
          </p>
          <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl">
            A simple website for your trade business, built and hosted for you.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            CallBoost builds and hosts mobile-friendly websites for local
            service businesses. We keep the process simple, handle domain setup,
            and give customers a clear way to request a quote or callback.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/pricing"
              className="rounded-lg bg-green-600 px-6 py-4 text-center text-sm font-black text-white shadow-lg shadow-green-950/40 hover:bg-green-500"
            >
              Get started
            </Link>
            <Link
              href="/sites/aande-plumbing"
              className="rounded-lg border border-white/15 bg-white/10 px-6 py-4 text-center text-sm font-black text-white hover:bg-white/15"
            >
              View example site
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="rounded-xl border border-blue-400/20 bg-slate-900 p-5">
            <p className="text-sm font-bold text-blue-300">
              CallBoost Website
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-white">
                  Clean mobile layout
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Built for quick calls and quote requests.
                </p>
              </div>
              <div className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-white">
                  Enquiry form included
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Capture job details without extra software.
                </p>
              </div>
              <div className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-white">
                  Hosting and support
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Your site stays online and managed.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-lg bg-blue-600 p-4">
              <p className="text-3xl font-black">$99 setup</p>
              <p className="mt-1 text-sm font-bold text-blue-100">
                then $99/month
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
            Built for
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {trades.map((trade) => (
              <span
                key={trade}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-slate-200"
              >
                {trade}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
            How it works
          </p>
          <h2 className="text-3xl font-black tracking-tight text-white">
            A practical website without the back-and-forth.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <h3 className="text-lg font-black text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {step.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tight">
                Ready for a website customers can actually use?
              </h2>
              <p className="mt-3 max-w-2xl text-slate-300">
                Start with a one-time $99 setup, then $99/month for hosting,
                support, and basic updates.
              </p>
            </div>
            <Link
              href="/pricing"
              className="rounded-lg bg-green-600 px-6 py-4 text-center text-sm font-black text-white hover:bg-green-500"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
