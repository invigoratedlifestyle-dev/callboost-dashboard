import Link from "next/link";

const included = [
  "Website setup",
  "Mobile-friendly website",
  "Hosted website",
  "Enquiry/callback form",
  "Basic updates",
  "Ongoing hosting/support",
  "Domain setup handled for you",
];

export const metadata = {
  title: "Pricing | CallBoost",
  description:
    "CallBoost Website pricing: $99 setup and $99/month for a hosted trade business website.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/marketing" className="text-lg font-black tracking-tight">
            CallBoost
          </Link>
          <Link href="/marketing" className="text-sm font-bold text-slate-300">
            Home
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 lg:py-24">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
            Simple pricing
          </p>
          <h1 className="text-5xl font-black tracking-tight">
            One plan for a done-for-you trade business website.
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            CallBoost builds, hosts, and supports a practical website for your
            local service business. Domain setup is handled for you.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                Single plan
              </p>
              <h2 className="mt-3 text-3xl font-black">CallBoost Website</h2>
              <div className="mt-6 rounded-xl border border-blue-400/20 bg-slate-900 p-5">
                <p className="text-4xl font-black">$99 setup</p>
                <p className="mt-2 text-2xl font-black text-blue-300">
                  $99/month
                </p>
              </div>
              <Link
                href="/success"
                className="mt-6 block rounded-lg bg-green-600 px-6 py-4 text-center text-sm font-black text-white hover:bg-green-500"
              >
                Get started
              </Link>
              <p className="mt-3 text-sm text-slate-500">
                Stripe checkout will be connected later.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-black">Includes</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {included.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-white/10 bg-white/10 p-4 text-sm font-bold text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
