"use client";

import { useState } from "react";
import type { Lead } from "../../lib/leads";

type Props = {
  lead: Lead;
  onGenerated?: (updatedLead: Lead) => void;
};

export function GenerateSiteButton({ lead, onGenerated }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    try {
      setLoading(true);

      const res = await fetch("/api/generate-single", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: lead.slug,
          id: lead.id,
          lead,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate site");
      }

      if (data.lead && onGenerated) {
        onGenerated(data.lead);
      }

      alert("Site generated successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to generate site.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Generating..." : "Generate Site (AI)"}
    </button>
  );
}