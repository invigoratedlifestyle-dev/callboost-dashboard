export type TradeTarget = {
  key: string;
  label: string;
  googleQueryTerms: string[];
};

export const TRADE_TARGETS: TradeTarget[] = [
  {
    key: "plumber",
    label: "Plumber",
    googleQueryTerms: ["plumber", "emergency plumber", "blocked drain plumber"],
  },
  {
    key: "electrician",
    label: "Electrician",
    googleQueryTerms: ["electrician", "emergency electrician", "commercial electrician"],
  },
  {
    key: "roofer",
    label: "Roofer",
    googleQueryTerms: ["roofer", "roof repairs", "roof plumber"],
  },
  {
    key: "builder",
    label: "Builder",
    googleQueryTerms: ["builder", "home builder", "renovation builder"],
  },
  {
    key: "landscaper",
    label: "Landscaper",
    googleQueryTerms: ["landscaper", "landscaping", "garden maintenance"],
  },
  {
    key: "painter",
    label: "Painter",
    googleQueryTerms: ["painter", "house painter", "commercial painter"],
  },
  {
    key: "concreter",
    label: "Concreter",
    googleQueryTerms: ["concreter", "concrete contractor", "concrete driveway"],
  },
  {
    key: "cleaner",
    label: "Cleaner",
    googleQueryTerms: ["cleaner", "commercial cleaner", "house cleaner"],
  },
  {
    key: "pest-control",
    label: "Pest Control",
    googleQueryTerms: ["pest control", "pest controller", "termite treatment"],
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getTradeTarget(tradeKeyOrName: string) {
  const normalized = normalize(tradeKeyOrName);

  return TRADE_TARGETS.find((target) => {
    return (
      target.key === normalized ||
      normalize(target.label) === normalized ||
      target.googleQueryTerms.some((term) => normalize(term) === normalized)
    );
  });
}
