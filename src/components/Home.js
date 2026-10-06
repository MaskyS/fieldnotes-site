// The front door. Search is the one control; under it one quiet line refines by where a
// place is, what kind of home it is, and its theme. Then the places, each stated in the
// same form so the eye compares across them. Facets are read from the catalogues, so a
// new film brings its own options. No heading or sentence explains the page: the count
// over the places is the heading, and the first green time teaches what a time does.
import { computed, nextTick, ref, watch } from 'vue';
import { searchAll, searchClaims, parseQuery, nothingSays, why, ideasFor, useVocabulary, PER_PLACE } from '../../vendor/search.js';
import { placeOf, placeWithin, countryOf, flagOf, whereOf, homeKind, kindWords, claimSpeaker } from '../lib/data.js';
import { formatTime } from '../lib/format.js';
import { figures, placeFigures, filmYear, climateOf, climateFamily, COLUMNS, PLACE_COLUMNS } from '../lib/quantities.js';
import { loadEntityIndex, foldPlaces, filmedLine } from '../lib/entities.js';
import Glyph from './Glyph.js';
import Compare from './Compare.js';
import Strips from './Strips.js';

export default {
  name: 'Home',
  components: { Glyph, Compare, Strips },
  props: {
    properties: { type: Array, required: true },
    themes: { type: Array, required: true },
    countries: { type: Object, default: () => ({}) },
    terms: { type: Object, default: () => ({ groups: {}, terms: {} }) },
  },
  setup(props) {
    // A term's aliases find the features that carry it; read before the first search.
    useVocabulary(props.terms);
    const allFeatures = computed(() => props.properties.flatMap((p) =>
      p.catalogue.features.map((f) => ({ ...f, property: p }))));

    // Every claim, with its speaker and the feature it is about. A claim's theme is its
    // feature's; claims about the place as a whole have none.
    const allClaims = computed(() => props.properties.flatMap((p) =>
      (p.catalogue.claims ?? []).map((c) => {
        const feature = p.catalogue.features.find((f) => f.id === c.about) ?? null;
        return { ...c, property: p, speaker: claimSpeaker(p.catalogue, c), feature, themeId: feature?.themeId ?? null };
      })));
    const allStatements = computed(() => allClaims.value.filter((c) => c.topic));
    const spoken = (theme) => Boolean(theme?.claim_topics?.length);
    const statementsOf = (theme) => allStatements.value.filter((c) => theme.claim_topics.includes(c.topic));

    // Where each place is and what kind of home it is, read once from its catalogue.
    // Options are ordered by how many places answer that way, so the shape of the
    // collection shows before anything is picked.
    // The climate is what the harness derived from the disclosed location; a place whose
    // film discloses nothing past the country has none and answers no climate option.
    // The Climate answer is the family (Mediterranean, humid continental); the card keeps
    // the class (warm-summer Mediterranean) as its glyph, named on hover.
    const facet = new Map(props.properties.map((p) => {
      const c = climateOf(p.catalogue);
      return [p.entry.id, { where: whereOf(p.catalogue.source.context), kind: homeKind(p.catalogue), climate: climateFamily(c), climateClass: c?.name ?? null, koppen: c?.koppen ?? null }];
    }));
    const valuesOf = (key) => {
      const tally = new Map();
      for (const f of facet.values()) if (f[key]) tally.set(f[key], (tally.get(f[key]) ?? 0) + 1);
      return [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || a.localeCompare(b));
    };
    const whereValues = valuesOf('where');
    const kindValues = valuesOf('kind');
    const climateValues = valuesOf('climate');
    // A country's flag, from its code in data/countries.json; a Where answer that is a
    // region, or a country the file does not know, keeps its name.
    const flag = (name) => flagOf(props.countries[name]);
    // Each climate family's Köppen letters without the summer heat (Cs, Df), read from
    // the catalogues: the Glyph draws a family from those two letters under a plain sun.
    const familyCodes = new Map([...facet.values()].filter((f) => f.climate && f.koppen).map((f) => [f.climate, f.koppen.slice(0, 2)]));
    // The figures of each place, read once: what its claims state as land, floor, cost,
    // time, and what the harness read at the place (zone, rain). The card shows only the
    // stated ones; the strips, the order and the sheet use both.
    const figuresOf = new Map(props.properties.map((p) => [p.entry.id, { ...figures(p.catalogue), ...placeFigures(p.catalogue) }]));
    const AXES = [...COLUMNS, ...PLACE_COLUMNS];

    // What is active comes from the URL first, so a filtered view is a link. A value
    // the catalogues do not know is dropped rather than shown as an empty filter.
    const params = new URLSearchParams(location.search);
    const known = (list, value) => (list.includes(value) ? value : null);
    const query = ref(params.get('q') ?? '');
    const themeId = ref(known(props.themes.map((t) => t.id), params.get('theme')));
    const where = ref(known(whereValues, params.get('where')));
    const kind = ref(known(kindValues, params.get('kind')));
    const climate = ref(known(climateValues, params.get('climate')));
    const term = ref(params.get('term') || null);
    const sort = ref(known(AXES.map((c) => c.key), params.get('sort')));
    // A range on a figure, from the URL as "min-max" in the strip's own scale (m² for
    // areas, an ordering value for money, days for time); the strips draw and set them.
    const rangeKeys = AXES.map((c) => c.key);
    const parseRange = (s) => { const m = /^([\d.]+)-([\d.]+)$/.exec(s ?? ''); return m ? [Number(m[1]), Number(m[2])] : null; };
    const ranges = ref(Object.fromEntries(rangeKeys.map((k) => [k, parseRange(params.get('r_' + k))])));
    function setRange(key, r) { ranges.value = { ...ranges.value, [key]: r }; }
    // The strips: every place with the figure, as a dot at its value, lowest first.
    const strips = AXES.map((c) => ({ key: c.key, label: c.label, linear: Boolean(c.linear), points: props.properties
      .map((p) => ({ p, cell: figuresOf.get(p.entry.id)[c.key] })).filter((x) => x.cell)
      .map((x) => ({ id: x.p.entry.id, title: x.p.catalogue.title, value: x.cell.sort, text: x.cell.text }))
      .sort((a, b) => a.value - b.value) })).filter((s) => s.points.length >= 2);
    // A range in the URL for a figure that has no strip (fewer than two places state it)
    // would narrow the page invisibly; it is dropped.
    for (const k of rangeKeys) if (ranges.value[k] && !strips.some((s) => s.key === k)) ranges.value[k] = null;
    // Places picked to see side by side, in the order picked; the sheet opens itself
    // once there are two. Both live in the URL, so a comparison is a page to send.
    const ids = new Set(props.properties.map((p) => p.entry.id));
    const picked = ref((params.get('compare') ?? '').split(',').filter((id) => ids.has(id)));
    const sheet = ref(params.get('sheet') === '1' && picked.value.length >= 2);

    // replaceState, not pushState: the back button leaves the page, it does not undo a
    // keystroke. The hash is kept so the property route's links are untouched.
    watch([query, themeId, where, kind, climate, term, sort, picked, sheet, ranges], () => {
      const p = new URLSearchParams();
      if (query.value.trim()) p.set('q', query.value.trim());
      for (const k of rangeKeys) if (ranges.value[k]) p.set('r_' + k, ranges.value[k].map((v) => (k === 'zone' ? Math.round(v * 2) / 2 : Math.round(v))).join('-'));
      if (themeId.value) p.set('theme', themeId.value);
      if (term.value) p.set('term', term.value);
      if (where.value) p.set('where', where.value);
      if (kind.value) p.set('kind', kind.value);
      if (climate.value) p.set('climate', climate.value);
      if (sort.value) p.set('sort', sort.value);
      if (picked.value.length) p.set('compare', picked.value.join(','));
      if (sheet.value) p.set('sheet', '1');
      const search = p.toString();
      history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
    });
    // A term belongs to the theme it was chosen under; changing the theme drops it.
    watch(themeId, () => { term.value = null; });

    const state = computed(() => ({ query: query.value, theme: themeId.value, term: term.value, where: where.value, kind: kind.value, climate: climate.value, ranges: ranges.value }));
    const activeTheme = computed(() => props.themes.find((t) => t.id === themeId.value) ?? null);
    // A query or a theme lists features; Where and Kind on their own only narrow the places.
    const listing = computed(() => Boolean(query.value.trim()) || Boolean(themeId.value));
    const active = computed(() => listing.value || Boolean(where.value) || Boolean(kind.value) || Boolean(climate.value) || rangeKeys.some((k) => ranges.value[k]));

    // Everything that matches one state: the places left after Where, Kind and Climate,
    // then the features, spoken claims and statements in them that fit the theme, the
    // term and the words. Called once for the page and once per option for that
    // option's count.
    function find(s) {
      const theme = props.themes.find((t) => t.id === s.theme) ?? null;
      // A range keeps the places whose film states the figure inside it; the others are out.
      const inRanges = (p) => rangeKeys.every((k) => { const r = s.ranges?.[k]; if (!r) return true; const v = figuresOf.get(p.entry.id)[k]?.sort; return v != null && v >= r[0] && v <= r[1]; });
      const inPlace = (p) => (!s.where || facet.get(p.entry.id).where === s.where) && (!s.kind || facet.get(p.entry.id).kind === s.kind)
        && (!s.climate || facet.get(p.entry.id).climate === s.climate) && inRanges(p);
      const places = props.properties.filter(inPlace);
      // A query that is only stopwords or lone letters asks for nothing; it lists as if empty.
      const asked = s.query.trim() ? parseQuery(s.query) : null;
      const searching = Boolean(asked?.tokens.length);
      // The places listed under a theme or a search are the places with a hit; when
      // nothing is found the page keeps every place left by Where, Kind and Climate.
      const done = (r) => {
        const ids = new Set([...r.features, ...r.claims, ...r.statements, ...r.notes].map((i) => i.property.entry.id));
        return { ...r, places, shown: ids.size && (searching || theme) ? places.filter((p) => ids.has(p.entry.id)) : places, searching };
      };
      const empty = { features: [], claims: [], statements: [], notes: [], unestablished: [] };
      if (spoken(theme)) {
        const pool = statementsOf(theme).filter((c) => inPlace(c.property));
        return done({ ...empty, statements: searching ? searchClaims(pool, asked) : pool });
      }
      const hasTerm = (f) => !s.term || (f.terms ?? []).includes(s.term);
      const pool = allFeatures.value.filter((f) => inPlace(f.property) && (!theme || f.themeId === theme.id) && hasTerm(f));
      if (!searching) return done({ ...empty, features: pool });
      // Claims are searched too, so a number or a rule someone stated is findable without
      // knowing which feature it was filed under. What a place says of itself (where it
      // is, its gist and story) belongs to no theme, so it is searched only without one.
      const claimPool = allClaims.value.filter((c) => inPlace(c.property) && (!theme || c.themeId === theme.id) && (!s.term || (c.feature && hasTerm(c.feature))));
      const r = searchAll({ features: pool, claims: claimPool, places: theme || s.term ? [] : places }, asked);
      return done({ ...empty, features: r.features, claims: r.claims, notes: r.places, unestablished: r.unestablished });
    }
    const hits = computed(() => find(state.value));
    // Places with something in them under a state; decides whether an option is offered.
    // A feature known only as not established is not something in a place.
    const placesIn = (r) => new Set([...r.features, ...r.claims, ...r.statements, ...r.notes].map((i) => i.property.entry.id)).size;

    // Each option knows what it would leave given everything else that is active. The
    // number is not shown (the results sentence says how many); an option that would
    // leave nothing is greyed so the shape of the collection stays visible.
    const themeHas = new Set(props.themes.filter((t) => (spoken(t) ? statementsOf(t) : allFeatures.value.filter((f) => f.themeId === t.id)).length).map((t) => t.id));
    // Under a chosen theme, the terms its features carry (docs/ontology.md): the kinds of
    // material, source or form a reader goes on to choose. Ordered by how many features.
    const termOptions = computed(() => {
      if (!activeTheme.value || spoken(activeTheme.value)) return [];
      const tally = new Map();
      for (const f of allFeatures.value) if (f.themeId === activeTheme.value.id) for (const t of f.terms ?? []) tally.set(t, (tally.get(t) ?? 0) + 1);
      return [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || a.localeCompare(b))
        .map((t) => ({ value: t, label: t, count: placesIn(find({ ...state.value, term: t })) }));
    });
    const rows = computed(() => [
      { key: 'where', name: 'Where', value: where.value, options: whereValues.map((v) => ({ value: v, label: v, flag: flag(v), count: placesIn(find({ ...state.value, where: v })) })) },
      { key: 'kind', name: 'Kind', value: kind.value, options: kindValues.map((v) => ({ value: v, label: kindWords(v).label, glyph: v, count: placesIn(find({ ...state.value, kind: v })) })) },
      ...(climateValues.length ? [{ key: 'climate', name: 'Climate', value: climate.value, options: climateValues.map((v) => ({ value: v, label: v, glyph: familyCodes.get(v), count: placesIn(find({ ...state.value, climate: v })) })) }] : []),
      { key: 'theme', name: 'Theme', value: themeId.value, options: props.themes.filter((t) => themeHas.has(t.id)).map((t) => {
        const r = find({ ...state.value, theme: t.id });
        return { value: t.id, label: t.name, count: spoken(t) ? r.statements.length : r.features.length + r.claims.length };
      }) },
      ...(termOptions.value.length ? [{ key: 'term', name: 'Which', value: term.value, options: termOptions.value }] : []),
    ]);
    const held = { where, kind, climate, theme: themeId, term };
    function set(key, value) { held[key].value = held[key].value === value ? null : value; }
    function clear() { query.value = ''; themeId.value = null; term.value = null; where.value = null; kind.value = null; climate.value = null; ranges.value = Object.fromEntries(rangeKeys.map((k) => [k, null])); }
    const shownIds = computed(() => new Set(hits.value.shown.map((p) => p.entry.id)));
    // A column header sorts the register by that figure; the same header again restores film order.
    function sortBy(key) { sort.value = sort.value === key ? null : key; }
    const isPicked = (p) => picked.value.includes(p.entry.id);
    function pick(p) {
      picked.value = isPicked(p) ? picked.value.filter((id) => id !== p.entry.id) : [...picked.value, p.entry.id];
      if (picked.value.length >= 2) sheet.value = true;
      if (picked.value.length < 2) sheet.value = false;
    }
    function unpick(id) { picked.value = picked.value.filter((x) => x !== id); if (picked.value.length < 2) sheet.value = false; }
    const comparing = computed(() => picked.value.map((id) => props.properties.find((p) => p.entry.id === id)).filter(Boolean));

    const byProperty = (items, key) => {
      const groups = new Map();
      for (const item of items) {
        const id = item.property.entry.id;
        if (!groups.has(id)) groups.set(id, { property: item.property, [key]: [] });
        groups.get(id)[key].push(item);
      }
      return [...groups.values()];
    };
    // Claims grouped by place, in film order.
    const saidGroups = (claims) => {
      const groups = byProperty(claims, 'claims');
      for (const g of groups) g.claims.sort((a, b) => (a.at[0] ?? Infinity) - (b.at[0] ?? Infinity));
      return groups;
    };
    // Under a search each place shows its first few features, so one film with many hits
    // does not push the others off the page; the rest are a link to that place.
    const results = computed(() => byProperty(hits.value.features, 'features').map((g) => (hits.value.searching
      ? { ...g, more: Math.max(0, g.features.length - PER_PLACE), features: g.features.slice(0, PER_PLACE) } : { ...g, more: 0 })));
    const said = computed(() => saidGroups(hits.value.claims));
    // Features whose only match is what the film does not establish: kept apart, so a
    // feature that says "tropical conditions are not established" is not read as tropical.
    const unestablished = computed(() => byProperty(hits.value.unestablished, 'features'));
    // What a place says of itself that carries the search: where it is, its gist, its story.
    const notes = computed(() => hits.value.notes);
    // The ideas a search names: terms from data/terms.json whose name or alias the query
    // is, each with how many features carry it, under the theme most of them sit in, so
    // the count is what the link shows ("natural ventilation, 8 features in 4 places").
    const ideas = computed(() => {
      if (!hits.value.searching || spoken(activeTheme.value)) return [];
      const left = new Set(hits.value.places.map((p) => p.entry.id));
      return ideasFor(props.terms, query.value).map(({ term: t, alias }) => {
        const carry = allFeatures.value.filter((f) => left.has(f.property.entry.id) && (f.terms ?? []).includes(t));
        if (!carry.length) return null;
        const tally = new Map();
        for (const f of carry) tally.set(f.themeId, (tally.get(f.themeId) ?? 0) + 1);
        const theme = [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a))[0];
        const inTheme = carry.filter((f) => f.themeId === theme);
        return { term: t, alias, theme, features: inTheme.length, places: new Set(inTheme.map((f) => f.property.entry.id)).size, gloss: props.terms.gloss?.[t] ?? null };
      }).filter(Boolean).slice(0, 4);
    });
    const ideaLink = (i) => {
      const p = new URLSearchParams();
      p.set('theme', i.theme); p.set('term', i.term);
      for (const [k, v] of [['where', where.value], ['kind', kind.value], ['climate', climate.value]]) if (v) p.set(k, v);
      return `?${p}`;
    };
    // In place, without a reload: the theme first, then the term once the theme's own
    // watcher has dropped the old one.
    function openIdea(i) { query.value = ''; themeId.value = i.theme; nextTick(() => { term.value = i.term; }); }
    const whyOf = (f, doubt = false) => why(f, query.value, doubt);
    const noteSource = (n) => (n.kind === 'where' ? (n.quoted ? n.label[0].toUpperCase() + n.label.slice(1) : 'Where it is, as the film gives it')
      : n.kind === 'gist' ? 'Summary written from the film' : 'Story written from the film');
    const noteLink = (p, n) => `?property=${encodeURIComponent(p.entry.id)}` + (n.at != null ? `&t=${Math.floor(n.at)}` : '');
    const statements = computed(() => saidGroups(hits.value.statements));
    // The register's rows: the places left, in the collection's order, or by one figure
    // when a column is chosen; a place whose film does not state that figure goes last.
    // A place more than one film is about (an owner-confirmed place entity) is one card,
    // the first of its films in the order shown standing for it, with the films' years.
    const entityIndex = ref(null);
    loadEntityIndex().then((i) => { entityIndex.value = i; });
    const filmed = (p) => filmedLine(entityIndex.value, p.entry.id);
    const places = computed(() => {
      const list = [...hits.value.shown];
      if (!sort.value) return foldPlaces(list, entityIndex.value);
      const key = (p) => figuresOf.get(p.entry.id)[sort.value]?.sort ?? Infinity;
      return foldPlaces(list.sort((a, b) => key(a) - key(b)), entityIndex.value);
    });
    const none = computed(() => (listing.value ? placesIn(hits.value) : places.value.length) === 0);
    const fig = (p) => figuresOf.get(p.entry.id);
    const year = (p) => filmYear(p.catalogue);
    // On a card: the class, drawn from its full code and named on hover.
    const climateName = (p) => facet.get(p.entry.id).climateClass;
    const climateGlyph = (p) => facet.get(p.entry.id).koppen;
    // The card's where line: the country as its flag and the rest of the place as words;
    // a country with no flag stays in the words.
    const whereLine = (p) => {
      const context = p.catalogue.source.context;
      const country = countryOf(context);
      const f = flag(country);
      return f ? { flag: f, country, text: placeWithin(context) } : { flag: null, country: null, text: placeOf(context) };
    };
    // A figure's moment: the feature it is about (or the place) with the film at the second it is said.
    const momentOf = (p, c) => `?property=${encodeURIComponent(p.entry.id)}` + (c.at.length ? `&t=${Math.floor(c.at[0])}` : '') + (c.about ? `#${encodeURIComponent(c.about)}` : '');

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    // English wants an article before some country names.
    const named = (c) => (/^(United |Netherlands|Philippines|Bahamas|Maldives|Gambia|Czech|Dominican)/.test(c) ? `the ${c}` : c);
    // What is active, in the words a person would use after the count.
    const tail = (withKind, withQuery = true) => {
      let s = '';
      if (activeTheme.value) s += ` about ${activeTheme.value.name.toLowerCase()}`;
      if (withKind && kind.value) s += ` in ${kindWords(kind.value).many}`;
      if (where.value) s += ` in ${named(where.value)}`;
      if (withQuery && query.value.trim()) s += `, matching "${query.value.trim()}"`;
      return s;
    };
    const countOf = (n) => { const w = kind.value ? kindWords(kind.value) : null; return w ? `${n} ${n === 1 ? w.one : w.many}` : plural(n, 'place'); };
    // "9 features, 1 statement and 2 notes on places": what was found, each kind named.
    const listed = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]);
    // One sentence for the results head: "9 features and 4 statements about water in
    // France, matching "tank"", or "3 houses on their own land in France".
    const sentence = computed(() => {
      const r = hits.value;
      if (spoken(activeTheme.value)) return plural(r.statements.length, 'statement') + tail(true);
      if (listing.value) {
        const notesN = r.notes.reduce((n, g) => n + g.notes.length, 0);
        const parts = [r.features.length || !(r.claims.length || notesN) ? plural(r.features.length, 'feature') : null,
          r.claims.length ? plural(r.claims.length, 'statement') : null,
          notesN ? (notesN === 1 ? '1 note on a place' : `${notesN} notes on places`) : null].filter(Boolean);
        return listed(parts) + tail(true);
      }
      return placesSentence.value;
    });
    // The heading over the places is always the count in words: "11 places", "3 houses on
    // their own land in France". Under a search it says how many places the results are in.
    // When a search or theme finds nothing, the places below are every place left by the
    // facets, and the heading says so without the search: "All 14 places".
    const placesSentence = computed(() => {
      const n = foldPlaces(hits.value.shown, entityIndex.value).length;
      if (listing.value && none.value) {
        const narrowed = where.value || kind.value || climate.value || rangeKeys.some((k) => ranges.value[k]);
        return (narrowed ? countOf(n) : `All ${countOf(n)}`) + (where.value ? ` in ${named(where.value)}` : '');
      }
      return countOf(n) + tail(false);
    });
    // A range keeps only the places whose figure is known; the others are not in the
    // count, and the page says so, by figure: what the film did not state, or what the
    // harness could not read from the location.
    const withoutFigure = computed(() => {
      const s = state.value;
      const base = props.properties.filter((p) => (!s.where || facet.get(p.entry.id).where === s.where) && (!s.kind || facet.get(p.entry.id).kind === s.kind) && (!s.climate || facet.get(p.entry.id).climate === s.climate));
      return rangeKeys.filter((k) => s.ranges?.[k]).map((k) => {
        const n = base.filter((p) => !figuresOf.get(p.entry.id)[k]).length;
        const axis = AXES.find((c) => c.key === k);
        const derived = PLACE_COLUMNS.some((c) => c.key === k);
        return n ? `${n} with no ${derived ? 'known' : 'stated'} ${axis.label.toLowerCase()}` : null;
      }).filter(Boolean);
    });
    // When nothing matches, name what to loosen: each active facet or range that,
    // cleared on its own, would give results.
    const nothing = computed(() => {
      const would = (patch) => placesIn(find({ ...state.value, ...patch })) > 0;
      const clears = [['Where', where.value, { where: null }], ['Kind', kind.value, { kind: null }], ['Climate', climate.value, { climate: null }],
        ...rangeKeys.map((k) => [`the ${AXES.find((c) => c.key === k).label.toLowerCase()} range`, ranges.value[k], { ranges: { ...ranges.value, [k]: null } }])]
        .filter(([, on, patch]) => on && would(patch)).map(([name]) => (name.startsWith('the ') ? name : `"${name}"`));
      const tries = [['try another theme', themeId.value, { theme: null }], ['try another word', query.value.trim(), { query: '' }]]
        .filter(([, on, patch]) => on && would(patch)).map(([text]) => text);
      // A search that found nothing says so in one sentence, naming where it looked; the
      // advice follows only when clearing something would find it.
      if (hits.value.searching) {
        const scope = countOf(hits.value.places.length) + (where.value ? ` in ${named(where.value)}` : '');
        const helps = [...(clears.length ? [`clear ${clears.join(' or ')}`] : []), ...tries.filter((t) => t !== 'try another word')].join(' or ');
        return nothingSays(scope, query.value, activeTheme.value?.name.toLowerCase()) + (helps ? ` ${helps[0].toUpperCase()}${helps.slice(1)}.` : '');
      }
      const advice = [...(clears.length ? [`clear ${clears.join(' or ')}`] : []), ...tries].join(' or ') || 'clear everything and start again';
      return `Nothing${tail(true)}. ${advice[0].toUpperCase()}${advice.slice(1)}.`;
    });

    const cover = (p) => p.illustrations.find((d) => d.hero) ?? p.illustrations.find((d) => d.kind === 'map') ?? p.illustrations[0] ?? null;
    // The first three headline claims that say something the line above them does not: a
    // claim whose words are all in the place's name or its where line ("The household is
    // in Tokyo, Japan") is skipped for the next one. A rule at render time, not in the
    // compiler, so the model's judgement of what is a headline is left alone.
    const words = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const FILLER = new Set(['the', 'a', 'an', 'is', 'are', 'in', 'on', 'of', 'at', 'and', 's', 'home', 'house', 'household', 'apartment', 'flat', 'settlement', 'community', 'place', 'located', 'lies', 'sits', 'this']);
    const headlines = (p) => {
      const known = new Set(words(`${p.catalogue.title} ${placeOf(p.catalogue.source.context)}`));
      return (p.catalogue.claims ?? []).filter((c) => c.headline)
        .filter((c) => { const w = words(c.text).filter((t) => !FILLER.has(t)); return w.length && !w.every((t) => known.has(t)); })
        .slice(0, 3).map((c) => c.text.replace(/\.$/, ''));
    };
    const link = (p, id) => `?property=${encodeURIComponent(p.entry.id)}#${encodeURIComponent(id)}`;
    // A statement opens its feature, or the nearest one, with the film at the moment it is said.
    const moment = (c) => `?property=${encodeURIComponent(c.property.entry.id)}` + (c.at.length ? `&t=${Math.floor(c.at[0])}` : '') + (c.about ? `#${encodeURIComponent(c.about)}` : '');

    return { query, themeId, rows, set, clear, active, listing, activeTheme, spoken, results, said, statements, places, unestablished, notes, ideas, ideaLink, openIdea, whyOf, noteSource, noteLink, none, sentence, placesSentence, withoutFigure, nothing, cover, headlines, link, moment, plural, placeOf, formatTime,
      columns: COLUMNS, axes: AXES, sort, sortBy, fig, year, climateName, climateGlyph, whereLine, momentOf,
      picked, sheet, isPicked, pick, unpick, comparing, strips, ranges, setRange, shownIds, filmed };
  },
  template: `
    <div class="home">
      <header class="hero">
        <input v-model="query" type="search" class="big-search" placeholder="rainwater, wood stove, plaster, permit, cost…" aria-label="Search every place">
        <div class="refine">
          <div v-for="row in rows" :key="row.key" class="facet" role="group" :aria-label="row.name">
            <span>{{ row.name }}</span>
            <button v-for="o in row.options" :key="o.value" :aria-pressed="row.value === o.value" :disabled="!o.count && row.value !== o.value" :title="row.value === o.value ? 'Clear' : (o.count ? null : 'Nothing here with what is chosen')" @click="set(row.key, o.value)">
              <img v-if="o.flag" class="flag" :src="o.flag" :alt="o.label" :title="o.label">
              <template v-else><Glyph v-if="o.glyph" :kind="o.glyph"/>{{ o.label }}</template>
            </button>
          </div>
          <button v-if="active" class="ghost" @click="clear">Clear all</button>
        </div>
        <Strips v-if="strips.length" :strips="strips" :ranges="ranges" :shown="shownIds" @range="setRange" />
      </header>

      <section v-if="listing && spoken(activeTheme)" class="section results">
        <div class="results-head">
          <h2>{{ none ? nothing : sentence }}</h2>
        </div>
        <div v-for="g in statements" :key="g.property.entry.id" class="result-group">
          <h3><a :href="'?property=' + g.property.entry.id">{{ g.property.catalogue.title }}</a> <span class="muted small">{{ placeOf(g.property.catalogue.source.context) }}</span></h3>
          <ol class="statements">
            <li v-for="c in g.claims" :key="c.id">
              <a :href="moment(c)">
                <img v-if="c.feature" :src="$img(c.feature.thumbnail, 'thumb')" alt="">
                <span v-else class="no-picture"></span>
                <span>
                  <b>{{ c.text }}</b>
                  <em>{{ c.speaker }}<template v-if="c.at.length">, {{ formatTime(c.at[0]) }}</template><template v-if="c.feature">, about {{ c.feature.title }}</template></em>
                  <small v-if="c.doubt">{{ c.doubt }}</small>
                </span>
              </a>
            </li>
          </ol>
        </div>
      </section>

      <section v-else-if="listing" class="section results">
        <div class="results-head">
          <h2>{{ none ? nothing : sentence }}</h2>
        </div>
        <!-- The ideas the words name, before the hits: each opens every feature that
             carries the term, across places, under its theme. -->
        <ul v-if="ideas.length" class="ideas" aria-label="Ideas">
          <li v-for="i in ideas" :key="i.term">
            <a :href="ideaLink(i)" @click.prevent="openIdea(i)"><b>{{ i.term }}</b> {{ plural(i.features, 'feature') }} in {{ plural(i.places, 'place') }}</a>
            <small v-if="i.gloss">{{ i.gloss }}</small>
          </li>
        </ul>
        <div v-for="r in results" :key="r.property.entry.id" class="result-group">
          <h3><a :href="'?property=' + r.property.entry.id">{{ r.property.catalogue.title }}</a> <span class="muted small">{{ placeOf(r.property.catalogue.source.context) }}</span></h3>
          <!-- A feature found by its description shows the sentence that found it; one the
               film only talks about says so, so seen and only said stay apart. -->
          <ul>
            <li v-for="f in r.features" :key="f.id">
              <a :href="link(r.property, f.id)"><img :src="$img(f.thumbnail, 'thumb')" alt=""><span><b>{{ f.title }}</b><small v-if="whyOf(f)" class="why">{{ whyOf(f) }}</small><em>{{ f.theme }}<template v-if="f.phase !== 'current'">, {{ f.phase }}</template><template v-if="f.evidence_status === 'spoken_only'">, only said</template></em></span></a>
            </li>
          </ul>
          <a v-if="r.more" class="more" :href="'?property=' + r.property.entry.id + '&q=' + encodeURIComponent(query.trim())">{{ r.more }} more in {{ r.property.catalogue.title }}</a>
        </div>
        <template v-if="said.length">
          <h2 class="said-head">Said in the films</h2>
          <div v-for="g in said" :key="'said-' + g.property.entry.id" class="result-group">
            <h3><a :href="'?property=' + g.property.entry.id">{{ g.property.catalogue.title }}</a> <span class="muted small">{{ placeOf(g.property.catalogue.source.context) }}</span></h3>
            <ol class="statements">
              <li v-for="c in g.claims" :key="c.id">
                <a :href="moment(c)">
                  <img v-if="c.feature" :src="$img(c.feature.thumbnail, 'thumb')" alt="">
                  <span v-else class="no-picture"></span>
                  <span>
                    <b>{{ c.text }}</b>
                    <em>{{ c.speaker }}<template v-if="c.at.length">, {{ formatTime(c.at[0]) }}</template><template v-if="c.feature">, about {{ c.feature.title }}</template></em>
                    <small v-if="c.doubt">{{ c.doubt }}</small>
                  </span>
                </a>
              </li>
            </ol>
          </div>
        </template>
        <template v-if="notes.length">
          <h2 class="said-head">About the places</h2>
          <div v-for="g in notes" :key="'note-' + g.property.entry.id" class="result-group">
            <h3><a :href="'?property=' + g.property.entry.id">{{ g.property.catalogue.title }}</a> <span class="muted small">{{ placeOf(g.property.catalogue.source.context) }}</span></h3>
            <ol class="statements">
              <li v-for="(n, i) in g.notes" :key="i">
                <a :href="noteLink(g.property, n)">
                  <img v-if="cover(g.property)" :src="$img(cover(g.property).path, 'thumb')" alt="">
                  <span v-else class="no-picture"></span>
                  <span>
                    <b>{{ n.quoted ? '“' + n.text + '”' : n.text }}</b>
                    <em>{{ noteSource(n) }}<template v-if="n.at != null">, {{ formatTime(n.at) }}</template></em>
                  </span>
                </a>
              </li>
            </ol>
          </div>
        </template>
        <!-- Features found only in what the film does not establish: the reader sees the
             sentence that says so, in amber, under its own heading, never among the hits.
             Open when they are all there is; folded to one line under real hits. -->
        <details v-if="unestablished.length" class="unestablished" :open="none">
          <summary><h2 class="said-head">Named only as not established<small> · {{ plural(unestablished.reduce((n, g) => n + g.features.length, 0), 'feature') }}</small></h2></summary>
          <div v-for="g in unestablished" :key="'unknown-' + g.property.entry.id" class="result-group doubt">
            <h3><a :href="'?property=' + g.property.entry.id">{{ g.property.catalogue.title }}</a> <span class="muted small">{{ placeOf(g.property.catalogue.source.context) }}</span></h3>
            <ul>
              <li v-for="f in g.features" :key="f.id">
                <a :href="link(g.property, f.id)"><img :src="$img(f.thumbnail, 'thumb')" alt=""><span><b>{{ f.title }}</b><small class="why">Not established: {{ whyOf(f, true) }}</small></span></a>
              </li>
            </ul>
          </div>
        </details>
      </section>

      <section class="section">
        <div class="results-head">
          <h2>{{ none && !listing ? nothing : placesSentence }}<small v-if="withoutFigure.length && !(none && !listing)" class="omitted">{{ ' · not counted: ' + withoutFigure.join(', ') }}</small></h2>
          <div class="sort" role="group" aria-label="Order">
            <span>Order</span>
            <button v-for="c in axes" :key="c.key" :aria-pressed="sort === c.key" :title="sort === c.key ? 'Back to film order' : 'Lowest ' + c.label.toLowerCase() + ' first'" @click="sortBy(c.key)">{{ c.label }}</button>
            <button v-if="picked.length >= 2 && !sheet" class="compare-open" @click="sheet = true">Compare {{ picked.length }}</button>
          </div>
        </div>
        <Compare v-if="sheet && comparing.length >= 2" :properties="comparing" :terms="terms" @remove="unpick" @close="sheet = false" />
        <!-- The places as small multiples: the cover leads, then the name and where, then
             what the film states as figures in the same four slots on every card, so the
             eye compares across cards without reading. Each figure plays the moment it was
             said; a dash is the film not stating it. -->
        <div class="properties">
          <article v-for="p in places" :key="p.entry.id" class="property-card">
            <a :href="'?property=' + p.entry.id" class="cover">
              <img v-if="cover(p)" :src="$img(cover(p).path, 'thumb')" :alt="cover(p).title">
              <img v-else :src="$img(p.catalogue.features[0].thumbnail, 'thumb')" alt="">
            </a>
            <h3><a :href="'?property=' + p.entry.id">{{ p.catalogue.title }}</a><button class="pick" :aria-pressed="isPicked(p)" :title="isPicked(p) ? 'Drop from the comparison' : 'Compare with others'" @click="pick(p)">{{ isPicked(p) ? 'Comparing' : 'Compare' }}</button></h3>
            <p class="place"><img v-if="whereLine(p).flag" class="flag" :src="whereLine(p).flag" :alt="whereLine(p).country" :title="whereLine(p).country"> {{ whereLine(p).text }}<template v-if="climateName(p)"> · <Glyph v-if="climateGlyph(p)" :kind="climateGlyph(p)" :title="climateName(p)"/><template v-else>{{ climateName(p) }}</template></template><span v-if="fig(p).zone" class="num zone" :title="'Hardiness zone ' + fig(p).zone.text + ', read from the location'"> · {{ fig(p).zone.text }}</span></p>
            <p v-if="filmed(p)" class="filmed"><a :href="filmed(p).href" title="Every film of this place, side by side">{{ filmed(p).text }}</a></p>
            <dl v-if="columns.some((c) => fig(p)[c.key])" class="figures">
              <div v-for="c in columns.filter((c) => fig(p)[c.key])" :key="c.key">
                <dt>{{ c.label }}</dt>
                <dd :title="fig(p)[c.key].claim.text">
                  <b>{{ fig(p)[c.key].text }}</b>
                  <small v-if="c.key === 'cost' && fig(p)[c.key].of !== 'build cost'">paid</small>
                </dd>
              </div>
            </dl>
            <p v-if="p.catalogue.subject?.gist" class="said">{{ p.catalogue.subject.gist }}</p>
          </article>
        </div>
      </section>
    </div>
  `,
};
