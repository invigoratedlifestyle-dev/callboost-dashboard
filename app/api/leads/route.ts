import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { businessesDir, withLifecycleDefaults } from "../../lib/leadLifecycle";

export async function GET() {
  try {
    if (!fs.existsSync(businessesDir)) {
      return NextResponse.json({ leads: [] });
    }

    const files = fs
      .readdirSync(businessesDir)
      .filter((file) => file.endsWith(".json"));

    const leads = files.map((file) => {
      const filePath = path.join(businessesDir, file);
      const lead = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const leadWithDefaults = withLifecycleDefaults(lead);

      fs.writeFileSync(filePath, JSON.stringify(leadWithDefaults, null, 2));

      return leadWithDefaults;
    });

    leads.sort((a, b) =>
      String(a.businessName || "").localeCompare(String(b.businessName || ""))
    );

    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Failed to load leads:", error);

    return NextResponse.json(
      { error: "Failed to load leads", leads: [] },
      { status: 500 }
    );
  }
}
