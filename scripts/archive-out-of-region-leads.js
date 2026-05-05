const apply = process.argv.includes("--apply");
const targetCities = new Set(["hobart"]);
const targetStates = ["tasmania", "tas"];

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function looksOutOfRegion(lead) {
  const data = lead.data && typeof lead.data === "object" ? lead.data : {};
  const city = getString(lead.city || data.city).trim().toLowerCase();
  const targetCityKey = getString(data.targetCityKey).trim().toLowerCase();
  const targetState = getString(data.targetState).trim().toLowerCase();
  const phone = getString(lead.phone || data.phone).trim();
  const website = getString(lead.website || data.website).toLowerCase();
  const address = getString(data.formattedAddress || data.address).toLowerCase();
  const isHobartTarget =
    targetCities.has(city) ||
    targetCities.has(targetCityKey) ||
    targetStates.some((state) => targetState.includes(state));

  if (!isHobartTarget) {
    return "";
  }

  if (phone.startsWith("+1")) {
    return "us_phone";
  }

  if (/\bunited states\b|\busa\b|\bus\b/.test(address)) {
    return "us_address";
  }

  if (website.includes(".us") || website.includes("usa")) {
    return "us_website";
  }

  return "";
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
  const { data, error } = await supabase.from("leads").select("*");

  if (error) {
    throw error;
  }

  const matches = (data || [])
    .map((lead) => ({
      lead,
      reason: looksOutOfRegion(lead),
    }))
    .filter((item) => item.reason);

  console.log("OUT_OF_REGION_ARCHIVE_SCAN", {
    dryRun: !apply,
    count: matches.length,
  });

  for (const { lead, reason } of matches) {
    const summary = {
      id: lead.id,
      slug: lead.slug,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      reason,
    };

    if (!apply) {
      console.log("WOULD_ARCHIVE_OUT_OF_REGION_LEAD", summary);
      continue;
    }

    const update = await supabase
      .from("leads")
      .update({ status: "archived" })
      .eq("id", lead.id);

    if (update.error) {
      console.error("ARCHIVE_OUT_OF_REGION_LEAD_FAILED", {
        ...summary,
        error: update.error,
      });
      continue;
    }

    console.log("ARCHIVED_OUT_OF_REGION_LEAD", summary);
  }
}

main().catch((error) => {
  console.error("ARCHIVE_OUT_OF_REGION_LEADS_FATAL", error);
  process.exitCode = 1;
});
