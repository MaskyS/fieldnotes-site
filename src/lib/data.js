// Loading the collection, one property's records, or every property for the index.
import { readRows } from './transcript.js';

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function getOptionalJSON(path, fallback) {
  try {
    return await getJSON(path);
  } catch {
    return fallback;
  }
}

export async function loadCollection() {
  return getJSON('data/collection.json');
}

// The controlled theme vocabulary; every feature category maps onto one theme.
let themesCache = null;
export async function loadThemes() {
  if (!themesCache) {
    const file = await getJSON('data/themes.json');
    const byCategory = new Map();
    for (const theme of file.themes) for (const c of theme.categories) byCategory.set(c, theme);
    themesCache = { list: file.themes, byCategory };
  }
  return themesCache;
}

// The controlled term vocabulary (docs/ontology.md): each term's group.
let termsCache = null;
export async function loadTerms() {
  if (!termsCache) termsCache = await getOptionalJSON('data/terms.json', { groups: {}, terms: {} });
  return termsCache;
}

// Country names as the catalogues write them, each to its ISO 3166-1 alpha-2 code
// (data/countries.json); the index draws a flag from the code.
let countriesCache = null;
export async function loadCountries() {
  if (!countriesCache) countriesCache = (await getOptionalJSON('data/countries.json', { codes: {} })).codes ?? {};
  return countriesCache;
}

function withThemes(catalogue, themes) {
  const other = { id: 'other', name: 'Other', blurb: '' };
  for (const f of catalogue.features) {
    const theme = themes.byCategory.get(f.category) ?? other;
    f.theme = theme.name;
    f.themeId = theme.id;
  }
  return catalogue;
}

// Everything the property page needs, in one object.
export async function loadProperty(entry) {
  const [catalogue, transcript, illustrations, themes, terms] = await Promise.all([
    getJSON(entry.catalogue),
    getJSON(entry.transcript),
    getOptionalJSON(`data/illustrations/${entry.id}.json`, { items: [] }),
    loadThemes(),
    loadTerms(),
  ]);
  return {
    entry,
    catalogue: withThemes(catalogue, themes),
    themes: themes.list,
    terms,
    transcript: readRows(transcript),
    illustrations: illustrations.items ?? [],
  };
}

// Every property's catalogue and drawings, for the cross-property index.
export async function loadAll(collection) {
  const [themes, countries, terms] = await Promise.all([loadThemes(), loadCountries(), loadTerms()]);
  const properties = await Promise.all(collection.properties.map(async (entry) => {
    const [catalogue, illustrations] = await Promise.all([
      getJSON(entry.catalogue),
      getOptionalJSON(`data/illustrations/${entry.id}.json`, { items: [] }),
    ]);
    return { entry, catalogue: withThemes(catalogue, themes), illustrations: illustrations.items ?? [] };
  }));
  return { properties, themes: themes.list, countries, terms };
}

// The place tree: title of a feature's place, and the places worth filtering by.
export function placeTitle(catalogue, id) {
  return catalogue.places.find((p) => p.id === id)?.title ?? id;
}

// People whose place this is, by their relation to it (owners first).
export function subjectPeople(catalogue) {
  const order = { owner: 0, resident: 1, builder: 2, designer: 3 };
  const ids = new Set(catalogue.subject?.people ?? []);
  return (catalogue.people ?? []).filter((p) => ids.has(p.id)).sort((a, b) => (order[a.relation] ?? 9) - (order[b.relation] ?? 9));
}

// Where a feature sits in the film: its first frame, or the start of its first span.
export function anchorOf(feature) {
  const frame = feature.evidence.find((e) => e.type === 'frame');
  return frame?.time ?? feature.evidence[0]?.start ?? 0;
}

// The stretch of film a reader is looking at when they are at one moment: a little
// before it, and long enough after it for the sentence being said to finish. The words
// shown beside a frame and the features listed as "also at this moment" use one window,
// so what the reader reads and what they are offered agree.
export function windowAround(seconds) {
  return [Math.max(0, seconds - 10), seconds + 14];
}

// The other features whose evidence falls in a window: a frame inside it, or a transcript
// span that overlaps it. Parts and parents count like any other feature; the feature the
// reader is on does not. Sorted by where in the window each one first appears, so the
// list reads in film order.
export function featuresAt(catalogue, [start, end], exceptId = null) {
  const firstIn = (f) => {
    let first = Infinity;
    for (const e of f.evidence) {
      if (e.type === 'frame' && e.time >= start && e.time <= end) first = Math.min(first, e.time);
      if (e.type === 'transcript' && e.start <= end && e.end >= start) first = Math.min(first, Math.max(e.start, start));
    }
    return first;
  };
  return catalogue.features
    .filter((f) => f.id !== exceptId)
    .map((f) => ({ feature: f, time: firstIn(f) }))
    .filter((x) => x.time !== Infinity)
    .sort((a, b) => a.time - b.time);
}

// Who said a claim, as a name. The video description was written by the channel that
// put the film up, so its claims are that filmmaker's, named like any other speaker.
export function claimSpeaker(catalogue, claim) {
  if (claim.by === 'description') return catalogue.source?.context?.channel ?? 'the filmmaker';
  if (claim.by === 'narrator') return 'unnamed speaker';
  return catalogue.people.find((p) => p.id === claim.by)?.name ?? claim.by;
}

// The prompt asks for "not disclosed" where the film is silent; that is not a place name.
const said = (text) => (text && !/^(not |un)(disclosed|known|stated)/i.test(text) ? text : null);

export function placeOf(context) {
  const location = context?.location ?? {};
  // Region, state, country, without repeating a part already said ("northeastern France, France").
  const parts = [];
  // When the region is missing, the nearest named place stands in for it.
  const region = said(location.region ?? location.state_or_region);
  const state = said(location.state);
  const nearest = region || state ? null : said(location.nearest_place)?.split(/[;,(]/)[0].trim();
  for (const part of [region, state, nearest, said(location.country)]) {
    if (part && !parts.some((p) => p.toLowerCase().includes(part.toLowerCase()))) parts.push(part);
  }
  return parts.join(', ') || 'Location not recorded';
}

// The country a film names, or null when it names none.
export function countryOf(context) {
  return said(context?.location?.country) ?? null;
}

// The place without its country, for a line that shows the country as a flag:
// "Ozarks, Missouri". When the country is all the film says, it is the place.
export function placeWithin(context) {
  const whole = placeOf(context);
  const country = countryOf(context);
  if (!country) return whole;
  const rest = whole.split(', ').filter((part) => part !== country);
  return rest.join(', ') || whole;
}

// A country's flag from its alpha-2 code: the flat SVG in vendor/flags (flag-icons, MIT),
// one file per code in data/countries.json. No code, no flag.
export function flagOf(code) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return `vendor/flags/${code.toLowerCase()}.svg`;
}

// Where a film is, as one answer for the index's Where facet: the country, or the
// region when the film names no country, or whatever placeOf can say.
export function whereOf(context) {
  const location = context?.location ?? {};
  return said(location.country) ?? said(location.region ?? location.state_or_region) ?? said(location.state) ?? placeOf(context);
}

// Ids for the compiler's derived kinds. Anything it adds later passes through as itself.
const DERIVED = { 'community': 'community', 'household within a community': 'household', 'several properties': 'several' };

// What kind of home a film is about, for the index's Kind facet. The compiler's derived
// kind wins when it says more than the root place does (a community, a household inside
// one, several properties); otherwise the root place's kind. A site is the land, so a
// site that holds a flat or a boat and no building is that flat or boat.
export function homeKind(catalogue) {
  const derived = catalogue.subject?.derived_kind;
  if (derived && derived !== 'single property') return DERIVED[derived] ?? derived;
  const places = catalogue.places ?? [];
  const root = places.find((p) => p.id === catalogue.subject?.place);
  if (!root) return 'unknown';
  if (root.kind === 'site') {
    const held = new Set(places.filter((p) => p.within === root.id && !p.outside).map((p) => p.kind));
    if (!held.has('building')) for (const kind of ['unit', 'vehicle']) if (held.has(kind)) return kind;
  }
  return root.kind;
}

// Plain words for a kind: the chip label, the noun for one, the noun for many. A kind
// not listed here still shows under its own name, so a new catalogue is never hidden.
const KIND_WORDS = {
  site: ['House on its own land', 'house on its own land', 'houses on their own land'],
  household: ['Home inside a community', 'home inside a community', 'homes inside a community'],
  community: ['Whole community', 'whole community', 'whole communities'],
  unit: ['Flat or unit', 'flat or unit', 'flats and units'],
  vehicle: ['Boat, van or bus', 'boat, van or bus', 'boats, vans and buses'],
  several: ['Several properties', 'film of several properties', 'films of several properties'],
};
export function kindWords(kind) {
  const [label, one, many] = KIND_WORDS[kind] ?? [kind[0].toUpperCase() + kind.slice(1), kind, `${kind} places`];
  return { label, one, many };
}
