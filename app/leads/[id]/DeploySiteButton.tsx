"use client";

export function DeploySiteButton() {
  async function handleDeploy() {
    const confirmed = window.confirm("Deploy CallBoost to production?");

    if (!confirmed) return;

    const res = await fetch("/api/deploy", {
      method: "POST",
    });

    const data = await res.json();

    alert(data.success ? "Deployed to production 🚀" : "Error deploying site");
  }

  return (
    <button
      onClick={handleDeploy}
      className="rounded-lg bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-500"
    >
      Deploy Site
    </button>
  );
}