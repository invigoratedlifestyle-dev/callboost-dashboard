import Link from "next/link";

const terms = [
  {
    title: "Service",
    copy: "CallBoost builds, hosts, and manages websites for local service businesses. The service is designed to provide a simple public website with basic contact and enquiry features.",
  },
  {
    title: "Domains",
    copy: "Domains are registered and managed by CallBoost as part of the service. If the service is cancelled, domain transfer is not guaranteed unless separately agreed in writing.",
  },
  {
    title: "Fees",
    copy: "Customers pay a setup fee and an ongoing monthly fee. The standard offer is $99 setup and $99 per month unless a different written agreement applies.",
  },
  {
    title: "Payment",
    copy: "The monthly fee covers ongoing hosting, support, and basic updates. Service can be suspended for failed payment until the account is brought up to date.",
  },
  {
    title: "Customer information",
    copy: "Customers are responsible for providing accurate business information, contact details, service details, and any requested content needed to create or update the website.",
  },
  {
    title: "Changes and cancellation",
    copy: "Basic updates are included as part of the monthly service. Larger changes may require a separate agreement. Customers can cancel the service by contacting CallBoost.",
  },
];

export const metadata = {
  title: "Terms | CallBoost",
  description: "Plain-language terms for the CallBoost website service.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/marketing" className="text-lg font-black tracking-tight">
            CallBoost
          </Link>
          <Link href="/pricing" className="text-sm font-bold text-slate-300">
            Pricing
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
          Terms
        </p>
        <h1 className="text-4xl font-black tracking-tight">
          CallBoost service terms
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          These terms explain the basics of the CallBoost website service in
          plain language.
        </p>

        <div className="mt-10 space-y-4">
          {terms.map((term) => (
            <section
              key={term.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <h2 className="text-xl font-black text-white">{term.title}</h2>
              <p className="mt-3 leading-7 text-slate-300">{term.copy}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
