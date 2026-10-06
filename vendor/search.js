// Search, shared by the front door, a place's index, its top-bar box and the tests
// (scripts/test_search.mjs), so what the tests pass is what the reader gets.
//
// Words match by their surface form, or by a light stem that keeps "insulated" with
// "insulation" and "shades" with "shade". A number with a unit is a quantity and never a
// concept, so "foot" does not find "16-foot logs" and "16 ft" does. A hyphenated word is
// kept whole, so "R-value" is not "r" and "value".

const STOP = new Set(('the a an of to in on is are was were for with what which how why where when did do does they their it its from and or as by at be been '
  + 'that this has have can i you we he she my our your me us them there here so if but about into than then just also very any all some would could should '
  + 'will may might these those who whom').split(' '));
// Nouns in -ing that are not the verb's stem: a footing is not a foot, a ceiling not a ceil.
const KEEP = new Set('footing ceiling siding landing evening bearing'.split(' '));

// Units, each as its canonical name and the ways a caption or a catalogue writes it.
// Longer forms come first so "sq ft" is not read as "ft".
const UNITS = [
  ['sqft', String.raw`sq\.?[\s-]*f(?:ee|oo)?t\.?|square[\s-]+f(?:ee|oo)t|ft²|ft2|sf`],
  ['m2', String.raw`m²|m2|sq\.?[\s-]*m(?:et(?:re|er)s?)?|square[\s-]+met(?:re|er)s?|sqm`],
  ['ft', String.raw`f(?:ee|oo)t|ft|'|’(?![a-z])`],
  ['in', String.raw`inch(?:es)?|(?<=\d)in|"|″|”`],
  ['mm', String.raw`mm|millimet(?:re|er)s?`],
  ['cm', String.raw`cm|centimet(?:re|er)s?`],
  ['km', String.raw`km|kilomet(?:re|er)s?`],
  ['m', String.raw`m|met(?:re|er)s?`],
  ['mi', String.raw`miles?`],
  ['acre', String.raw`acres?|ac`],
  ['ha', String.raw`hectares?|ha`],
  ['c', String.raw`[°º]\s*c|degrees?\s+c(?:elsius)?|celsius`],
  ['f', String.raw`[°º]\s*f|degrees?\s+f(?:ahrenheit)?|fahrenheit`],
  ['deg', String.raw`[°º]|degrees?`],
  ['kwh', String.raw`kwh`],
  ['kw', String.raw`kw|kilowatts?`],
  ['w', String.raw`watts?`],
  ['v', String.raw`volts?`],
  ['l', String.raw`l|lit(?:re|er)s?`],
  ['gal', String.raw`gal|gallons?`],
  ['kg', String.raw`kg|kilos?|kilograms?`],
  ['usd', String.raw`usd|dollars?`],
  ['eur', String.raw`eur|euros?`],
  ['pct', String.raw`%|percent|per\s+cent`],
];
// Matched alone, the unit has no number before it, so the lookbehind is dropped.
const UNIT_RE = UNITS.map(([name, p]) => [name, new RegExp(`^(?:${p.replace(String.raw`(?<=\d)`, '')})$`)]);
const CURRENCY = { $: 'usd', '€': 'eur', '£': 'gbp' };
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// A number spelled out before a hyphenated unit is a quantity too: "nine-foot", "two-metre".
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const SCAN = new RegExp([
  String.raw`([$€£])\s?(${NUM})\s*(k|m|million|thousand)?(?![a-z0-9])`,
  String.raw`(-?${NUM})\s*-?\s*(${UNITS.map(([, p]) => p).join('|')})(?![a-z0-9])`,
  String.raw`(-?${NUM})(?![a-z0-9])`,
  String.raw`\b(${Object.keys(WORDS).join('|')})-(${UNITS.map(([, p]) => p).join('|')})(?![a-z0-9])`,
  // An area unit with no number before it ("$225 per square foot") is a unit, not a foot.
  String.raw`\b(square[\s-]+f(?:ee|oo)t|square[\s-]+met(?:re|er)s?|sq\.?\s*f(?:ee|oo)?t|sq\.?\s*m)(?![a-z0-9])`,
  String.raw`[a-z0-9]+(?:['’-][a-z0-9]+)*`,
].join('|'), 'g');
const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };

const number = (s, scale = 1) => String(Number(s.replace(/,/g, '')) * scale);
const unitOf = (s) => UNIT_RE.find(([, re]) => re.test(s.replace(/\s+/g, ' ').trim()))?.[0] ?? null;

// A light stem: plurals, -ing, -ed and -ation come off, a doubled last consonant is
// undone, and a final e goes, so "shade", "shades", "shaded", "shading" meet.
export function stem(word) {
  let w = word.replace(/['’]s$/, '');
  if (w.length <= 3 || KEEP.has(w)) return w;
  if (/ies$/.test(w)) w = `${w.slice(0, -3)}y`;
  else if (/(ss|us|is)$/.test(w)) { /* glass, bus, chassis */ }
  else if (/(x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (/s$/.test(w)) w = w.slice(0, -1);
  if (KEEP.has(w)) return w;
  const undouble = (s) => (/([bdfgmnprt])\1$/.test(s) ? s.slice(0, -1) : s);
  if (/ing$/.test(w) && w.length >= 6 && /[aeiouy]/.test(w.slice(0, -3))) w = undouble(w.slice(0, -3));
  else if (/ed$/.test(w) && w.length >= 6) w = undouble(w.slice(0, -2));
  else if (/ation$/.test(w) && w.length >= 8) w = w.slice(0, -3);
  if (/e$/.test(w) && w.length > 3) w = w.slice(0, -1);
  return w;
}

// Every token in a text, in order: a quantity ("16ft", "50000usd"), a bare number, or a
// word with its stem.
export function tokens(text) {
  const out = [];
  const s = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const m of s.matchAll(SCAN)) {
    if (m[1]) {
      const n = number(m[2], SCALE[m[3]] ?? 1);
      out.push({ kind: 'qty', surface: `${n}${CURRENCY[m[1]]}`, number: n, unit: CURRENCY[m[1]] });
    } else if (m[4]) {
      const n = number(m[4]);
      const unit = unitOf(m[5]);
      out.push(unit ? { kind: 'qty', surface: `${n}${unit}`, number: n, unit } : { kind: 'num', surface: n });
    } else if (m[6]) {
      out.push({ kind: 'num', surface: number(m[6]) });
    } else if (m[7] && unitOf(m[8])) {
      const n = String(WORDS[m[7]]);
      out.push({ kind: 'qty', surface: `${n}${unitOf(m[8])}`, number: n, unit: unitOf(m[8]) });
    } else if (m[9]) {
      out.push({ kind: 'unit', surface: unitOf(m[9]) });
    } else {
      const w = m[0].replace(/['’]s$/, '').replace(/’/g, "'");
      const parts = w.split('-');
      out.push({ kind: 'word', surface: w, stem: parts.length > 1 ? [...parts.slice(0, -1), stem(parts.at(-1))].join('-') : stem(w), parts });
    }
  }
  return out;
}

// What a query asks for: the tokens every hit must carry, and the query as a phrase when
// it has more than one. A lone letter before a word is part of it ("R value" is
// "R-value"); any other lone letter, and the stopwords, carry nothing.
export function parseQuery(query) {
  const all = tokens(query);
  const flat = ` ${all.map((t) => (t.kind === 'word' ? t.parts.join(' ') : t.surface)).join(' ')} `;
  const wanted = [];
  for (let i = 0; i < all.length; i += 1) {
    const t = all[i], next = all[i + 1];
    if (t.kind !== 'word') { wanted.push(t); continue; }
    if (t.surface.length === 1 && !STOP.has(t.surface) && next?.kind === 'word' && all.length > 1) {
      const w = `${t.surface}-${next.surface}`;
      wanted.push({ kind: 'word', surface: w, stem: `${t.surface}-${next.stem}`, parts: [t.surface, ...next.parts] });
      i += 1;
      continue;
    }
    if (STOP.has(t.surface) || (t.surface.length === 1 && all.length > 1)) continue;
    wanted.push(t);
  }
  return { tokens: wanted, phrase: wanted.length > 1 ? flat : null };
}

// One text, ready to be matched: its words by surface and by stem (a hyphenated word
// also by its parts), its quantities and numbers, and its words in a row for phrases.
export function prepare(text) {
  const doc = { surface: new Set(), stem: new Set(), qty: new Set(), num: new Set(), unit: new Set(), flat: ' ' };
  for (const t of tokens(text)) {
    if (t.kind === 'qty') { doc.qty.add(t.surface); doc.num.add(t.number); doc.unit.add(t.unit); doc.flat += `${t.surface} `; continue; }
    if (t.kind === 'unit') { doc.unit.add(t.surface); doc.flat += `${t.surface} `; continue; }
    if (t.kind === 'num') { doc.num.add(t.surface); doc.flat += `${t.surface} `; continue; }
    doc.flat += `${t.parts.join(' ')} `;
    doc.surface.add(t.surface); doc.stem.add(t.stem);
    if (t.parts.length > 1) for (const p of t.parts) if (p.length > 1) { doc.surface.add(p); doc.stem.add(stem(p)); }
  }
  return doc;
}

// How well one token is in one text: 1 as written, 0.85 by its stem, 0 not at all.
function hit(doc, t) {
  if (t.kind === 'qty') return doc.qty.has(t.surface) ? 1 : 0;
  if (t.kind === 'num') return doc.num.has(t.surface) ? 1 : 0;
  if (t.kind === 'unit') return doc.unit.has(t.surface) ? 1 : 0;
  if (doc.surface.has(t.surface)) return 1;
  if (t.parts.length > 1 && doc.flat.includes(` ${t.parts.join(' ')} `)) return 1;
  return doc.stem.has(t.stem) ? 0.85 : 0;
}
export function matches(doc, q) { return q.tokens.length > 0 && q.tokens.every((t) => hit(doc, t) > 0); }

// The fields of each kind of record, by weight: a word in a feature's title says more
// than one in its description. A field marked doubt is what the film does not
// establish; a hit that needs it is kept apart, never counted as the film saying so.
// A feature's terms are read with their aliases (data/terms.json), so "eaves" finds a
// feature carrying the term it is an alias of. Set once from the vocabulary, before the
// first search: what is read is kept per feature.
const ALIASES = new Map();
export function useVocabulary(vocab) {
  ALIASES.clear();
  for (const [alias, term] of Object.entries(vocab?.aliases ?? {})) {
    if (typeof term !== 'string') continue;
    if (!ALIASES.has(term)) ALIASES.set(term, []);
    ALIASES.get(term).push(alias);
  }
}
export const FEATURE_FIELDS = [
  ['title', 10, (f) => f.title],
  ['terms', 7, (f) => (f.terms ?? []).flatMap((t) => [t, ...(ALIASES.get(t) ?? [])]).join(' · ')],
  ['description', 4, (f) => f.description],
  ['category', 2, (f) => `${f.category ?? ''} ${f.theme ?? ''}`],
  ['unknown', 1, (f) => f.unknown, 'doubt'],
];
// A claim's quantity is matched as text, so "acre", "build cost" or "$50k" find it.
const quantityText = (q) => (q ? `${q.value} ${q.unit ?? ''} ${q.of ?? ''}` : '');
export const CLAIM_FIELDS = [
  ['text', 10, (c) => c.text],
  ['quantity', 5, (c) => quantityText(c.quantity)],
  // The feature a claim is filed under helps rank it but cannot make it a hit alone:
  // "the couple lived in the hut" is not about storage because the hut now holds some.
  ['feature', 3, (c) => c.feature?.title, 'context'],
  ['speaker', 2, (c) => c.speaker],
];

const cache = new WeakMap();
function prepared(item, fields) {
  let byFields = cache.get(item);
  if (!byFields) cache.set(item, (byFields = new Map()));
  let docs = byFields.get(fields);
  if (!docs) byFields.set(fields, (docs = fields.map(([, , read]) => prepare(read(item) ?? ''))));
  return docs;
}

// Score every item. A token counts at its best field; the query as a phrase earns twice
// the weight of the best field it appears in. Coverage is the share of tokens found;
// doubt is set when a token is found only in a doubt field. An item found only in
// context fields is no hit.
export function score(items, q, fields) {
  return items.map((item) => {
    const docs = prepared(item, fields);
    let total = 0, found = 0, doubt = false, own = false;
    for (const t of q.tokens) {
      let best = 0, firm = false;
      fields.forEach(([, weight, , kind], i) => {
        const h = hit(docs[i], t);
        if (h) { best = Math.max(best, h * weight); if (kind !== 'doubt') firm = true; if (kind !== 'context') own = true; }
      });
      if (best) { found += 1; total += best; if (!firm) doubt = true; }
    }
    if (q.phrase) {
      const i = fields.findIndex((_, j) => docs[j].flat.includes(q.phrase));
      if (i >= 0) total += 2 * fields[i][1];
    }
    return { item, score: total, coverage: q.tokens.length ? found / q.tokens.length : 0, doubt, own };
  }).filter((r) => r.coverage > 0 && r.own).sort((a, b) => b.coverage - a.coverage || b.score - a.score);
}

// Features of one catalogue for a place's index: every feature that carries all the
// words; when none does (a question in full sentences), those that carry any, the most
// words first. An empty query keeps them all, in their order.
export function rankFeatures(features, query) {
  const q = parseQuery(query);
  if (!q.tokens.length) return features;
  const scored = score(features, q, FEATURE_FIELDS);
  const all = scored.filter((r) => r.coverage === 1);
  return (all.length ? all : scored).map((r) => r.item);
}

// The words of a query as stems, for callers that only need to know if a query is empty.
export function terms(s) { return parseQuery(s).tokens.map((t) => t.stem ?? t.surface); }

// Whether a text carries every token of a query: a caption line, or any record read
// through `read`. A record's prepared text is kept, so typing does not re-read it.
const saidCache = new WeakMap();
export function says(item, query, read = (x) => x.text) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  if (!q.tokens.length) return false;
  if (typeof item === 'string') return matches(prepare(item), q);
  let doc = saidCache.get(item);
  if (!doc) saidCache.set(item, (doc = prepare(read(item) ?? '')));
  return matches(doc, q);
}

// Claims that carry every word of a query, best first.
export function searchClaims(claims, query) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  if (!q.tokens.length) return [];
  return score(claims, q, CLAIM_FIELDS).filter((r) => r.coverage === 1).map((r) => r.item);
}

// Spread hits over places: each place's first `cap` keep their rank, the rest follow, so
// one film with many matching features does not push every other place down the list.
export const PER_PLACE = 5;
export function spread(hits, keyOf, cap = PER_PLACE) {
  const seen = new Map(), first = [], rest = [];
  for (const h of hits) {
    const k = keyOf(h);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    (n <= cap ? first : rest).push(h);
  }
  return [...first, ...rest];
}

// What a place says about itself outside its features: where the film says it is (the
// uploader's words or the speakers'), and the gist and story written from the film.
// The story keeps its moments so a hit there can play the film.
export function placeNotes(catalogue) {
  let notes = cache.get(catalogue)?.get('notes');
  if (notes) return notes;
  notes = [];
  for (const e of catalogue.source?.context?.location?.evidence ?? []) {
    const text = typeof e === 'string' ? e : (e.quote ?? e.note ?? '');
    if (text) notes.push({ kind: 'where', label: typeof e === 'object' && e.quote ? (e.source ?? e.type) : 'where it is', quoted: Boolean(e?.quote), text });
  }
  const subject = catalogue.subject ?? {};
  if (subject.gist) notes.push({ kind: 'gist', label: 'in short', text: subject.gist });
  const story = subject.story;
  if (story?.text) for (const s of sentences(story.text)) {
    const moment = (story.moments ?? []).find((m) => s.includes(m.phrase));
    notes.push({ kind: 'story', label: 'the story', text: s, at: moment?.at ?? null });
  }
  for (const n of notes) n.doc = prepare(n.text);
  let m = cache.get(catalogue);
  if (!m) cache.set(catalogue, (m = new Map()));
  m.set('notes', notes);
  return notes;
}
const sentences = (text) => String(text ?? '').split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'])/).map((s) => s.trim()).filter(Boolean);

// The sentence that makes a feature a hit, to show under its title when the title alone
// does not say why: from its description, else its terms. For a hit kept apart as not
// established (`doubt`), the sentence of its unknown. Null when the title says it all.
export function why(feature, query, doubt = false) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  if (!q.tokens.length) return null;
  const pick = (text) => {
    let best = null, most = 0;
    for (const s of sentences(text)) {
      const doc = prepare(s);
      const n = q.tokens.filter((t) => hit(doc, t)).length;
      if (n > most) { best = s; most = n; }
    }
    return best;
  };
  if (doubt) return pick(feature.unknown);
  if (matches(prepare(feature.title), q)) return null;
  return pick(feature.description) ?? (feature.terms?.length ? feature.terms.join(', ') : null);
}

// Everything in the collection that carries every word of a query. Features found only
// in what the film does not establish come back apart, as `unestablished`. `features`
// and `claims` carry `property`, as on the front door; `places` are the properties.
export function searchAll({ features, claims, places }, query) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  if (!q.tokens.length) return null;
  const full = (r) => r.coverage === 1;
  const scored = score(features, q, FEATURE_FIELDS).filter(full);
  const key = (f) => f.property.entry.id;
  return {
    query: q,
    features: spread(scored.filter((r) => !r.doubt).map((r) => r.item), key),
    unestablished: scored.filter((r) => r.doubt).map((r) => r.item),
    claims: searchClaims(claims, q),
    places: places.map((property) => ({ property, notes: placeNotes(property.catalogue).filter((n) => matches(n.doc, q)).slice(0, 2) }))
      .filter((p) => p.notes.length),
  };
}

// The places a search is in: those with a feature, a statement or a note that carries
// it. A feature known only as not established does not put a place in the list.
export function placesHit(r) {
  if (!r) return new Set();
  return new Set([...r.features, ...r.claims].map((i) => i.property.entry.id).concat(r.places.map((p) => p.property.entry.id)));
}

// The one sentence for a search that found nothing: "Nothing in 14 places says
// "termite"." The scope is how the page counts the places it looked in; `about` is the
// theme the search was under, if any.
export function nothingSays(scope, query, about = null) {
  return `Nothing${about ? ` about ${about}` : ''} in ${scope} says "${query.trim()}".`;
}

// The terms a query names (data/terms.json): a term whose name carries every word of the
// query ("solar" names solar pv and passive solar), or whose alias is the query. A term
// named in full, or by an alias, comes first. Aliases are a sibling map {alias: term},
// grown by scripts/backfill.py aliases from the words the films use.
const named = new Map();
const namePrep = (s) => { if (!named.has(s)) named.set(s, { doc: prepare(s), n: parseQuery(s).tokens.length }); return named.get(s); };
export function ideasFor(vocab, query) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  if (!q.tokens.length) return [];
  const terms = vocab?.terms ?? {};
  const out = new Map();
  for (const term of Object.keys(terms)) {
    const { doc, n } = namePrep(term);
    if (matches(doc, q)) out.set(term, { term, exact: n === q.tokens.length });
  }
  for (const [alias, term] of Object.entries(vocab?.aliases ?? {})) {
    const { doc, n } = namePrep(alias);
    if (terms[term] && n === q.tokens.length && matches(doc, q)) out.set(term, { term, exact: true, alias });
  }
  return [...out.values()].sort((a, b) => b.exact - a.exact);
}
