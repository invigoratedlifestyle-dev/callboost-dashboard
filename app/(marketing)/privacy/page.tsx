import Link from "next/link";

const sections = [
  {
    title: "Information we collect",
    copy: "CallBoost may collect business names, contact names, phone numbers, email addresses, service details, website content, domain preferences, and enquiry or callback information submitted through a website form.",
  },
  {
    title: "How we use information",
    copy: "We use this information to build and manage customer websites, respond to enquiries, provide support, process service requests, and improve the CallBoost service.",
  },
  {
    title: "Enquiry information",
    copy: "When a visitor submits an enquiry or callback request, we collect the details they provide so the business can follow up. This may include their name, phone number, email address, message, and job details.",
  },
  {
    title: "Sharing information",
    copy: "We do not sell personal information. We may share information with service providers that help us host websites, manage communications, process payments, or operate the service.",
  },
  {
    title: "Data security",
    copy: "We take reasonable steps to protect business and contact information, but no online service can guarantee absolute security.",
  },
  {
    title: "Contact",
    copy: "Customers can contact CallBoost to ask about their information, request corrections, or discuss deletion where practical and legally permitted.",
  },
];

export const metadata = {
  title: "Privacy | CallBoost",
  description:
    "Basic privacy policy for CallBoost business, contact, and enquiry information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/marketing" className="text-lg font-black tracking-tight">
            CallBoost
          </Link>
          <Link href="/terms" className="text-sm font-bold text-slate-300">
            Terms
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
          Privacy
        </p>
        <h1 className="text-4xl font-black tracking-tight">
          CallBoost privacy policy
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          This policy covers business, contact, and enquiry information collected
          through CallBoost websites and services.
        </p>

        <div className="mt-10 space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <h2 className="text-xl font-black text-white">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-300">{section.copy}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
