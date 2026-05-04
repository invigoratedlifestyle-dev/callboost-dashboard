import Link from "next/link";

export const metadata = {
  title: "Payment received | CallBoost",
  description: "Payment received for CallBoost website setup.",
};

export default function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
          Success
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Payment received - we&apos;ll finish setting up your website.
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">
          Thanks for choosing CallBoost. We will use your business details to
          complete the website setup and get your site ready.
        </p>
        <Link
          href="/marketing"
          className="mt-8 inline-flex rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
        >
          Back to CallBoost
        </Link>
      </section>
    </main>
  );
}
