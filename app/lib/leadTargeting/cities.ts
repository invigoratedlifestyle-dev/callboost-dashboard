export type CityTarget = {
  key: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  searchTerms: string[];
};

export const CITY_TARGETS: CityTarget[] = [
  {
    key: "hobart",
    city: "Hobart",
    state: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -42.8821,
    lng: 147.3272,
    radiusMeters: 50000,
    searchTerms: ["Hobart", "Greater Hobart", "Southern Tasmania"],
  },
  {
    key: "launceston",
    city: "Launceston",
    state: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -41.4332,
    lng: 147.1441,
    radiusMeters: 40000,
    searchTerms: ["Launceston", "Northern Tasmania"],
  },
  {
    key: "devonport",
    city: "Devonport",
    state: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -41.177,
    lng: 146.351,
    radiusMeters: 35000,
    searchTerms: ["Devonport", "North West Tasmania"],
  },
  {
    key: "burnie",
    city: "Burnie",
    state: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -41.0527,
    lng: 145.9063,
    radiusMeters: 35000,
    searchTerms: ["Burnie", "North West Tasmania"],
  },
  {
    key: "melbourne",
    city: "Melbourne",
    state: "Victoria",
    country: "Australia",
    countryCode: "AU",
    lat: -37.8136,
    lng: 144.9631,
    radiusMeters: 60000,
    searchTerms: ["Melbourne", "Greater Melbourne"],
  },
  {
    key: "sydney",
    city: "Sydney",
    state: "New South Wales",
    country: "Australia",
    countryCode: "AU",
    lat: -33.8688,
    lng: 151.2093,
    radiusMeters: 60000,
    searchTerms: ["Sydney", "Greater Sydney"],
  },
  {
    key: "brisbane",
    city: "Brisbane",
    state: "Queensland",
    country: "Australia",
    countryCode: "AU",
    lat: -27.4698,
    lng: 153.0251,
    radiusMeters: 60000,
    searchTerms: ["Brisbane", "Greater Brisbane"],
  },
  {
    key: "adelaide",
    city: "Adelaide",
    state: "South Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -34.9285,
    lng: 138.6007,
    radiusMeters: 50000,
    searchTerms: ["Adelaide", "Greater Adelaide"],
  },
  {
    key: "perth",
    city: "Perth",
    state: "Western Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -31.9523,
    lng: 115.8613,
    radiusMeters: 60000,
    searchTerms: ["Perth", "Greater Perth"],
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getCityTarget(cityKeyOrName: string) {
  const normalized = normalize(cityKeyOrName);

  return CITY_TARGETS.find((target) => {
    return (
      target.key === normalized ||
      normalize(target.city) === normalized ||
      target.searchTerms.some((term) => normalize(term) === normalized)
    );
  });
}

export function buildLocalSearchQuery(trade: string, cityTarget: CityTarget) {
  return `${trade} ${cityTarget.city} ${cityTarget.state} ${cityTarget.country}`;
}
