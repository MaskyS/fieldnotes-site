// What a place's claims state as numbers, read for the register: the land, the floor area,
// what it cost, how long it took. Every figure is a claim's `quantity` (docs/ontology.md),
// asserted in the speaker's unit; this file only chooses which claim answers each column
// and converts for ordering. Nothing here parses prose.

// Ordering only: a rough, dated rate table so a register can sort mixed currencies. The
// page never shows a converted price; it shows what was said, in the currency said.
const ORDERING_RATES_USD = { USD: 1, CAD: 0.73, AUD: 0.66, NZD: 0.6, EUR: 1.08, GBP: 1.27, CHF: 1.12, SEK: 0.095, NOK: 0.094, DKK: 0.145, JPY: 0.0067, MXN: 0.055, BRL: 0.19, INR: 0.012, ZAR: 0.055 };
const M2 = { m2: 1, ft2: 0.0929, acre: 4046.86, ha: 10000 };
const DAYS = { day: 1, week: 7, month: 30.44, year: 365.25 };

const SYMBOL = { USD: '$', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', EUR: '€', GBP: '£', CHF: 'CHF ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', JPY: '¥', MXN: 'MX$', BRL: 'R$', INR: '₹', ZAR: 'R ' };
const AREA = { m2: 'm²', ft2: 'ft²', acre: 'ac', ha: 'ha' };

function money(q) {
  const v = q.value;
  const short = v >= 1e6 ? `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  return `${q.approx ? '~' : ''}${SYMBOL[q.unit] ?? q.unit + ' '}${short}`;
}

function area(q) {
  const v = q.value;
  const n = v >= 100 ? Math.round(v).toLocaleString('en') : String(Math.round(v * 10) / 10);
  return `${q.approx ? '~' : ''}${n} ${AREA[q.unit] ?? q.unit}`;
}

function duration(q) {
  const days = q.value * DAYS[q.unit];
  const text = days >= 365 ? `${Math.round(days / 365.25 * 2) / 2} yr` : days >= 60 ? `${Math.round(days / 30.44)} mo` : days >= 14 ? `${Math.round(days / 7)} wk` : `${Math.round(days)} d`;
  return `${q.approx ? '~' : ''}${text}`;
}

// The claim that answers a column: what someone says in the film before what the written
// description says, then one about the place as a whole, then a headline one. Among equals
// the first in film order wins, which is the one the annotator listed first. A description
// figure the catalogue doubts never becomes the card's figure: with no spoken one to stand
// in for it, the column stays empty. In a community film a figure about one building (the
// hut, one household's home) is not the community's, so only claims about the whole count.
function pick(claims, of, wholeOnly = false) {
  const written = (c) => c.by === 'description';
  const rank = (c) => (written(c) ? 4 : 0) + (c.about ? 2 : 0) + (c.headline ? 0 : 1);
  return claims.filter((c) => c.quantity && of.includes(c.quantity.of) && (!wholeOnly || !c.about) && !(written(c) && c.doubt))
    .sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function cell(claim, format, sortKey) {
  if (!claim) return null;
  const q = claim.quantity;
  return { text: format(q), sort: sortKey(q), claim, of: q.of, approx: Boolean(q.approx) };
}

// The register row's figures for one catalogue. Each cell carries the claim, so the page
// can play the moment the figure was said.
export function figures(catalogue) {
  const claims = catalogue.claims ?? [];
  const community = catalogue.subject?.derived_kind === 'community';
  const land = pick(claims, ['land area']);
  const floor = pick(claims, ['floor area'], community);
  const build = pick(claims, ['build cost'], community);
  const bought = pick(claims, ['purchase price', 'land price'], community);
  const time = pick(claims, ['build time'], community);
  return {
    land: cell(land, area, (q) => q.value * M2[q.unit]),
    floor: cell(floor, area, (q) => q.value * M2[q.unit]),
    // Cost is what it cost to build; when the film gives only a price paid, that is shown and marked.
    cost: cell(build, money, (q) => q.value * (ORDERING_RATES_USD[q.unit] ?? 1)) ?? cell(bought, money, (q) => q.value * (ORDERING_RATES_USD[q.unit] ?? 1)),
    time: cell(time, duration, (q) => q.value * DAYS[q.unit]),
  };
}

// The year the film was put up: a 2014 dollar figure sits beside a 2026 one on the register,
// and the reader must see that before comparing.
export function filmYear(catalogue) {
  const date = catalogue.source?.context?.upload_date;
  const y = date ? new Date(date).getFullYear() : NaN;
  return Number.isNaN(y) ? null : y;
}

// The climate the harness derived from the disclosed location (docs/ontology.md), or null.
export function climateOf(catalogue) {
  return catalogue.source?.context?.location?.climate ?? null;
}

// A climate's family, for the index's Climate facet: the class name without its summer
// heat qualifier, so hot-summer and warm-summer Mediterranean are both "Mediterranean"
// and hot and cold semi-arid are both "semi-arid". The class itself stays on the card.
export function climateFamily(climate) {
  return climate?.name?.replace(/^(very cold|hot|warm|cold|cool)(-summer)? /, '') ?? null;
}

export const COLUMNS = [
  { key: 'land', label: 'Land' },
  { key: 'floor', label: 'Floor' },
  { key: 'cost', label: 'Cost' },
  { key: 'time', label: 'Build' },
];

// What the harness read at the place (docs/ontology.md): the hardiness zone and the
// rain, in the same cell shape as the film's figures so the index can range and sort on
// them. They are not stated by the film, so they never sit among the card's figures;
// the zone is on a linear scale ("6a" is 6, "6b" is 6.5), the rain in mm on a log one.
export const PLACE_COLUMNS = [
  { key: 'zone', label: 'Zone', linear: true },
  { key: 'rain', label: 'Rain' },
];

export function zoneValue(zone) {
  const m = /^(\d{1,2})([ab])$/.exec(zone ?? '');
  return m ? Number(m[1]) + (m[2] === 'b' ? 0.5 : 0) : null;
}

// What the film itself says about something the harness also reads at the place (the
// rain, the coldest nights, the height): `location.stated[of]`, compiled from a claim's
// quantity with the derived figure beside it and whether the two agree. The film's own
// words come first wherever both exist; the derived figure is never shown as the film's.
export function statedOf(catalogue, of) {
  const s = catalogue.source?.context?.location?.stated?.[of];
  if (!s) return null;
  const claim = (catalogue.claims ?? []).find((c) => c.id === s.claim) ?? { id: s.claim, at: s.at };
  return { ...s, claim };
}

// The figure as the speaker gave it: "9 in", "~10.5 in", "-20 °C".
export function saidText(stated) {
  const q = stated.said;
  const unit = { in: ' in', mm: ' mm', cm: ' cm', ft: ' ft', m: ' m', C: ' °C', F: ' °F' }[q.unit] ?? ` ${q.unit}`;
  return `${q.approx ? '~' : ''}${q.value.toLocaleString('en')}${unit}`;
}

export function placeFigures(catalogue) {
  const loc = catalogue.source?.context?.location ?? {};
  const zone = loc.hardiness?.zone, rain = loc.rainfall?.mm_per_year;
  const said = statedOf(catalogue, 'rainfall');
  return {
    zone: zone ? { text: zone, sort: zoneValue(zone), derived: loc.hardiness } : null,
    // The film's own figure when it gives one, with its claim so the page can play the
    // moment; the derived reading rides along so the page can say when they disagree.
    rain: said ? { text: `${saidText(said)}/yr`, sort: said.value, claim: said.claim, said: true, derived: loc.rainfall ?? null, agrees: said.agrees ?? null }
      : rain != null ? { text: `${rain.toLocaleString('en')} mm/yr`, sort: rain, derived: loc.rainfall } : null,
  };
}

// Where the derived figures were read, for a reader: a town's name, or a region's centre
// said as one ("the centre of Virginia, about 750 km across").
export function readAt(derivedFrom) {
  if (!derivedFrom) return null;
  const name = derivedFrom.matched?.split(',')[0] ?? derivedFrom.query;
  return derivedFrom.extent_km ? `the centre of ${name} (a ${derivedFrom.stands_for} about ${Math.round(derivedFrom.extent_km / 10) * 10} km across)` : name;
}
