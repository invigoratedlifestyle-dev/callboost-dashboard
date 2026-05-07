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
];

export const TASMANIA_TOWNS_SUBURBS = [
  "Austins Ferry",
  "Battery Point",
  "Beaconsfield",
  "Beauty Point",
  "Bellerive",
  "Berriedale",
  "Bicheno",
  "Blackmans Bay",
  "Bothwell",
  "Bridgewater",
  "Bridport",
  "Brighton",
  "Burnie",
  "Cambridge",
  "Campbell Town",
  "Carrick",
  "Claremont",
  "Clarendon Vale",
  "Cygnet",
  "Deloraine",
  "Derwent Bridge",
  "Devonport",
  "Dodges Ferry",
  "Dover",
  "Dynnyrne",
  "East Devonport",
  "Evandale",
  "Gagebrook",
  "Geeveston",
  "George Town",
  "Glenorchy",
  "Hadspen",
  "Hamilton",
  "Hobart",
  "Howrah",
  "Huonville",
  "Invermay",
  "Kempton",
  "Kettering",
  "Kings Meadows",
  "Kingston",
  "Kingston Beach",
  "Latrobe",
  "Launceston",
  "Lauderdale",
  "Lenah Valley",
  "Lewisham",
  "Lindisfarne",
  "Longford",
  "Low Head",
  "Margate",
  "Midway Point",
  "Montrose",
  "Moonah",
  "Mount Nelson",
  "Mowbray",
  "New Norfolk",
  "New Town",
  "Newnham",
  "North Hobart",
  "Norwood",
  "Oatlands",
  "Old Beach",
  "Orford",
  "Penguin",
  "Perth",
  "Port Sorell",
  "Prospect",
  "Queenstown",
  "Richmond",
  "Risdon Vale",
  "Rokeby",
  "Rosebery",
  "Rosetta",
  "Ross",
  "Rosny",
  "Sandy Bay",
  "Scamander",
  "Scottsdale",
  "Shearwater",
  "Smithton",
  "Snug",
  "Somerset",
  "Sorell",
  "South Hobart",
  "Spreyton",
  "St Helens",
  "Stanley",
  "Strahan",
  "Swansea",
  "Taroona",
  "Triabunna",
  "Trevallyn",
  "Tullah",
  "Ulverstone",
  "Warrane",
  "West Hobart",
  "West Moonah",
  "Westbury",
  "Wynyard",
  "Youngtown",
  "Zeehan",
] as const;

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTasmaniaTownTarget(townOrSuburb: string): CityTarget {
  return {
    key: normalize(townOrSuburb),
    city: townOrSuburb,
    stateCode: "TAS",
    state: "Tasmania",
    country: "Australia",
    countryCode: "AU",
    lat: -42.0409,
    lng: 146.8087,
    radiusMeters: 360000,
    searchTerms: [townOrSuburb],
  };
}

export const CITY_TARGETS: CityTarget[] = TASMANIA_TOWNS_SUBURBS.map(
  buildTasmaniaTownTarget
);

export function getCityTarget(cityKeyOrName: string) {
  const normalized = normalize(cityKeyOrName);

  if (
    normalized === "state-wide" ||
    normalized === "statewide" ||
    normalized === "tasmania"
  ) {
    return undefined;
  }

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

export function getCityTargetForState(
  cityKeyOrName: string,
  stateKeyOrName?: string
) {
  const cityTarget = getCityTarget(cityKeyOrName);

  if (!cityTarget || !stateKeyOrName) return cityTarget;

  const stateTarget = getStateTarget(stateKeyOrName);

  if (!stateTarget) return cityTarget;

  return cityTarget.stateCode === stateTarget.key ? cityTarget : undefined;
}

export function buildLocalSearchQuery(trade: string, cityTarget: CityTarget) {
  return `${trade} in ${cityTarget.city} ${cityTarget.state} ${cityTarget.country}`;
}
