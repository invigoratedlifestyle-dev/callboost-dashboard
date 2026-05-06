export type CityTarget = {
  key: string;
  city: string;
  stateCode: string;
  state: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  searchTerms: string[];
  isStateWide?: boolean;
};

export type StateTarget = {
  key: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  radiusMeters: number;
};

export const STATE_WIDE_CITY_KEY = "state-wide";

export const AU_STATE_TARGETS: StateTarget[] = [
  {
    key: "TAS",
    name: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -42.0409,
    lng: 146.8087,
    radiusMeters: 360000,
  },
  {
    key: "VIC",
    name: "Victoria",
    country: "Australia",
    countryCode: "AU",
    lat: -37.4713,
    lng: 144.7852,
    radiusMeters: 520000,
  },
  {
    key: "NSW",
    name: "New South Wales",
    country: "Australia",
    countryCode: "AU",
    lat: -31.2532,
    lng: 146.9211,
    radiusMeters: 950000,
  },
  {
    key: "QLD",
    name: "Queensland",
    country: "Australia",
    countryCode: "AU",
    lat: -20.9176,
    lng: 142.7028,
    radiusMeters: 1550000,
  },
  {
    key: "SA",
    name: "South Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -30.0002,
    lng: 136.2092,
    radiusMeters: 1150000,
  },
  {
    key: "WA",
    name: "Western Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -25.0423,
    lng: 121.0937,
    radiusMeters: 1800000,
  },
  {
    key: "ACT",
    name: "Australian Capital Territory",
    country: "Australia",
    countryCode: "AU",
    lat: -35.4735,
    lng: 149.0124,
    radiusMeters: 90000,
  },
  {
    key: "NT",
    name: "Northern Territory",
    country: "Australia",
    countryCode: "AU",
    lat: -19.4914,
    lng: 132.551,
    radiusMeters: 1450000,
  },
];

export const CITY_TARGETS: CityTarget[] = [
  {
    key: "hobart",
    city: "Hobart",
    stateCode: "TAS",
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
    stateCode: "TAS",
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
    stateCode: "TAS",
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
    stateCode: "TAS",
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
    stateCode: "VIC",
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
    stateCode: "NSW",
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
    stateCode: "QLD",
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
    stateCode: "SA",
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
    stateCode: "WA",
    state: "Western Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -31.9523,
    lng: 115.8613,
    radiusMeters: 60000,
    searchTerms: ["Perth", "Greater Perth"],
  },
  {
    key: "canberra",
    city: "Canberra",
    stateCode: "ACT",
    state: "Australian Capital Territory",
    country: "Australia",
    countryCode: "AU",
    lat: -35.2802,
    lng: 149.131,
    radiusMeters: 50000,
    searchTerms: ["Canberra", "Australian Capital Territory"],
  },
  {
    key: "darwin",
    city: "Darwin",
    stateCode: "NT",
    state: "Northern Territory",
    country: "Australia",
    countryCode: "AU",
    lat: -12.4634,
    lng: 130.8456,
    radiusMeters: 60000,
    searchTerms: ["Darwin", "Northern Territory"],
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

export function getStateTarget(stateKeyOrName: string) {
  const normalized = normalize(stateKeyOrName);

  return AU_STATE_TARGETS.find((target) => {
    return target.key.toLowerCase() === normalized || normalize(target.name) === normalized;
  });
}

export function getCityTargetForState(cityKeyOrName: string, stateKeyOrName?: string) {
  const cityTarget = getCityTarget(cityKeyOrName);

  if (!cityTarget || !stateKeyOrName) return cityTarget;

  const stateTarget = getStateTarget(stateKeyOrName);

  if (!stateTarget) return cityTarget;

  return cityTarget.stateCode === stateTarget.key ? cityTarget : undefined;
}

export function buildStateWideCityTarget(stateTarget: StateTarget): CityTarget {
  return {
    key: STATE_WIDE_CITY_KEY,
    city: "State-wide",
    stateCode: stateTarget.key,
    state: stateTarget.name,
    country: stateTarget.country,
    countryCode: stateTarget.countryCode,
    lat: stateTarget.lat,
    lng: stateTarget.lng,
    radiusMeters: stateTarget.radiusMeters,
    searchTerms: [stateTarget.name, stateTarget.key],
    isStateWide: true,
  };
}

export function buildLocalSearchQuery(trade: string, cityTarget: CityTarget) {
  if (cityTarget.isStateWide) {
    return `${trade} in ${cityTarget.state}`;
  }

  return `${trade} in ${cityTarget.city} ${cityTarget.stateCode}`;
}
