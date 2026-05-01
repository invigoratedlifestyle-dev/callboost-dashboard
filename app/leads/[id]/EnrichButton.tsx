"use client";

import { useState } from "react";
import type { Lead } from "../../lib/leads";

type Props = {
  lead: Lead;
  onEnriched?: (lead: Lead) => void;
};

export function EnrichButton({ lead, onEnriched }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleEnrich() {
    try {
      setLoading(true);

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: lead.slug || lead.id,
          website: lead.website || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to enrich lead");
      }

      if (data.lead && onEnriched) {
        onEnriched(data.lead);
      }

      alert("Lead enriched successfully.");
    } catch (error) {
      console.error("Enrich error:", error);
      alert("Failed to enrich lead.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleEnrich}
      disabled={loading}
      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Enriching..." : lead.website ? "Enrich Lead" : "Find Website"}
    </button>
  );
}