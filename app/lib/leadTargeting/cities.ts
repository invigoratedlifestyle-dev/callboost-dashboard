export type AUStateCode = "TAS" | "VIC" | "NSW" | "QLD" | "SA" | "WA" | "ACT" | "NT";

export type CityTarget = {
  key: string;
  city: string;
  stateCode: AUStateCode;
  state: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  searchTerms: string[];
};

export type StateTarget = {
  key: AUStateCode;
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
    lat: -32.1656,
    lng: 147.0167,
    radiusMeters: 700000,
  },
  {
    key: "QLD",
    name: "Queensland",
    country: "Australia",
    countryCode: "AU",
    lat: -22.5752,
    lng: 144.0848,
    radiusMeters: 900000,
  },
  {
    key: "SA",
    name: "South Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -30.0002,
    lng: 136.2092,
    radiusMeters: 780000,
  },
  {
    key: "WA",
    name: "Western Australia",
    country: "Australia",
    countryCode: "AU",
    lat: -25.0423,
    lng: 118.1963,
    radiusMeters: 1250000,
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
    radiusMeters: 950000,
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

const VICTORIA_TOWNS_SUBURBS = [
  "Melbourne",
  "Geelong",
  "Ballarat",
  "Bendigo",
  "Shepparton",
  "Mildura",
  "Warrnambool",
  "Traralgon",
  "Werribee",
  "Melton",
  "Craigieburn",
  "Dandenong",
  "Frankston",
  "Cranbourne",
  "Ringwood",
  "Preston",
  "Sunshine",
  "Epping",
  "Berwick",
  "Pakenham",
] as const;

const NEW_SOUTH_WALES_TOWNS_SUBURBS = [
  "Sydney",
  "Newcastle",
  "Wollongong",
  "Central Coast",
  "Parramatta",
  "Penrith",
  "Blacktown",
  "Liverpool",
  "Campbelltown",
  "Bankstown",
  "Hornsby",
  "Chatswood",
  "Manly",
  "Bondi",
  "Cronulla",
  "Castle Hill",
  "Wagga Wagga",
  "Albury",
  "Dubbo",
  "Orange",
  "Tamworth",
  "Coffs Harbour",
  "Port Macquarie",
] as const;

const QUEENSLAND_TOWNS_SUBURBS = [
  "Brisbane",
  "Gold Coast",
  "Sunshine Coast",
  "Ipswich",
  "Logan",
  "Toowoomba",
  "Townsville",
  "Cairns",
  "Mackay",
  "Rockhampton",
  "Bundaberg",
  "Hervey Bay",
  "Gladstone",
  "Redcliffe",
  "Caboolture",
  "Cleveland",
  "Beenleigh",
  "Southport",
  "Robina",
  "Maroochydore",
] as const;

const SOUTH_AUSTRALIA_TOWNS_SUBURBS = [
  "Adelaide",
  "Mount Gambier",
  "Whyalla",
  "Murray Bridge",
  "Port Lincoln",
  "Port Augusta",
  "Gawler",
  "Elizabeth",
  "Salisbury",
  "Norwood",
  "Glenelg",
  "Marion",
  "Morphett Vale",
  "Noarlunga",
  "Victor Harbor",
] as const;

const WESTERN_AUSTRALIA_TOWNS_SUBURBS = [
  "Perth",
  "Fremantle",
  "Joondalup",
  "Midland",
  "Armadale",
  "Rockingham",
  "Mandurah",
  "Bunbury",
  "Busselton",
  "Albany",
  "Geraldton",
  "Kalgoorlie",
  "Broome",
  "Karratha",
  "Port Hedland",
  "Ellenbrook",
  "Cannington",
  "Victoria Park",
] as const;

const AUSTRALIAN_CAPITAL_TERRITORY_TOWNS_SUBURBS = [
  "Canberra",
  "Belconnen",
  "Gungahlin",
  "Tuggeranong",
  "Woden",
  "Civic",
  "Weston Creek",
  "Molonglo Valley",
  "Fyshwick",
  "Queanbeyan",
] as const;

const NORTHERN_TERRITORY_TOWNS_SUBURBS = [
  "Darwin",
  "Palmerston",
  "Alice Springs",
  "Katherine",
  "Tennant Creek",
  "Nhulunbuy",
  "Humpty Doo",
  "Howard Springs",
  "Nightcliff",
  "Casuarina",
] as const;

const AU_STATE_TOWNS_SUBURBS = {
  TAS: TASMANIA_TOWNS_SUBURBS,
  VIC: VICTORIA_TOWNS_SUBURBS,
  NSW: NEW_SOUTH_WALES_TOWNS_SUBURBS,
  QLD: QUEENSLAND_TOWNS_SUBURBS,
  SA: SOUTH_AUSTRALIA_TOWNS_SUBURBS,
  WA: WESTERN_AUSTRALIA_TOWNS_SUBURBS,
  ACT: AUSTRALIAN_CAPITAL_TERRITORY_TOWNS_SUBURBS,
  NT: NORTHERN_TERRITORY_TOWNS_SUBURBS,
} as const satisfies Record<(typeof AU_STATE_TARGETS)[number]["key"], readonly string[]>;

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchesCityTarget(target: CityTarget, normalized: string) {
  return (
    target.key === normalized ||
    normalize(target.city) === normalized ||
    target.searchTerms.some((term) => normalize(term) === normalized)
  );
}

function buildTownTarget(stateTarget: StateTarget, townOrSuburb: string): CityTarget {
  return {
    key: normalize(townOrSuburb),
    city: townOrSuburb,
    stateCode: stateTarget.key,
    state: stateTarget.name,
    country: stateTarget.country,
    countryCode: stateTarget.countryCode,
    lat: stateTarget.lat,
    lng: stateTarget.lng,
    radiusMeters: stateTarget.radiusMeters,
    searchTerms: [townOrSuburb],
  };
}

export const CITY_TARGETS: CityTarget[] = AU_STATE_TARGETS.flatMap((stateTarget) =>
  AU_STATE_TOWNS_SUBURBS[stateTarget.key].map((townOrSuburb) =>
    buildTownTarget(stateTarget, townOrSuburb)
  )
);

export function getCityTarget(cityKeyOrName: string) {
  const normalized = normalize(cityKeyOrName);

  if (
    normalized === "state-wide" ||
    normalized === "statewide" ||
    AU_STATE_TARGETS.some(
      (stateTarget) =>
        normalize(stateTarget.key) === normalized ||
        normalize(stateTarget.name) === normalized
    )
  ) {
    return undefined;
  }

  return CITY_TARGETS.find((target) => matchesCityTarget(target, normalized));
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
  const normalized = normalize(cityKeyOrName);

  if (!stateKeyOrName) return getCityTarget(cityKeyOrName);

  const stateTarget = getStateTarget(stateKeyOrName);

  if (!stateTarget) return getCityTarget(cityKeyOrName);

  return CITY_TARGETS.find(
    (target) =>
      target.stateCode === stateTarget.key && matchesCityTarget(target, normalized)
  );
}

export function buildLocalSearchQuery(trade: string, cityTarget: CityTarget) {
  return `${trade} in ${cityTarget.city} ${cityTarget.state} ${cityTarget.country}`;
}
