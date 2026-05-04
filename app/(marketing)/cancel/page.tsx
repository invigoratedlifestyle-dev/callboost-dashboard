import Link from "next/link";

export const metadata = {
  title: "Payment cancelled | CallBoost",
  description: "Payment was cancelled for CallBoost website setup.",
};

export default function CancelPage() {
  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
          Cancelled
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Payment was cancelled. You can return any time.
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">
          No payment was completed. When you are ready, you can come back to the
          CallBoost pricing page and start again.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="rounded-lg bg-green-600 px-5 py-3 text-center text-sm font-black text-white hover:bg-green-500"
          >
            Return to pricing
          </Link>
          <Link
            href="/marketing"
            className="rounded-lg border border-white/15 bg-white/10 px-5 py-3 text-center text-sm font-black text-white hover:bg-white/15"
          >
            Back to CallBoost
          </Link>
        </div>
      </section>
    </main>
  );
}
