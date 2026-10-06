// Landing view for a property: the place in one look (gist and portrait), the story the
// way a friend shows you round, with phrases that play the film; the practical bit at a
// glance (the film's figures, what the place is made of and runs on); the drawings; and
// an index of everything catalogued.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { rankFeatures } from '../../vendor/search.js';
import { placeOf, placeTitle } from '../lib/data.js';
import { formatTime, youtubeLink, youtubeId } from '../lib/format.js';
import { figures, COLUMNS, statedOf, saidText, readAt } from '../lib/quantities.js';
import { loadEntityIndex, pageFor } from '../lib/entities.js';
import Drawing from './Drawing.js';
import Schematic from './Schematic.js';
import SunCard from './SunCard.js';
import Viewer from './Viewer.js';
import AskAbout from './AskAbout.js';
import YouTubePlayer from './YouTubePlayer.js';
import Timeline from './Timeline.js';

export default {
  name: 'Overview',
  components: { Drawing, Schematic, SunCard, Viewer, AskAbout, YouTubePlayer, Timeline },
  props: {
    catalogue: { type: Object, required: true },
    illustrations: { type: Array, required: true },
    terms: { type: Object, default: () => ({ groups: {}, terms: {} }) },
  },
  emits: ['select', 'play'],
  setup(props) {
    const context = computed(() => props.catalogue.source.context ?? null);
    const climate = computed(() => context.value?.location?.climate ?? null);

    // The upload date is not the filming date, and the page says which it is. Where the
    // words came from decides how far a quotation can be trusted, so the one sentence of
    // provenance says it once for the whole film: every page under it inherits the caveat.
    const uploaded = computed(() => {
      const d = context.value?.upload_date ? new Date(context.value.upload_date) : null;
      return d && !Number.isNaN(d) ? d : null;
    });
    const year = computed(() => uploaded.value?.getFullYear() ?? null);
    // The dateline under the title: where, then what the harness read at that place
    // (climate, hardiness zone, rainfall, elevation), then the film's year. Nothing the
    // title or the picture already says; the community's name only when the place sits
    // inside one. Every figure is a number, set as one.
    const loc = computed(() => context.value?.location ?? {});
    const dateline = computed(() => {
      const parts = [];
      if (props.catalogue.subject?.derived_kind === 'household within a community') {
        const community = props.catalogue.places.find((p) => p.kind === 'community');
        if (community) parts.push({ text: community.title });
      }
      parts.push({ text: placeOf(context.value) });
      if (climate.value) parts.push({ text: climate.value.name });
      if (loc.value.hardiness) parts.push({ text: `zone ${loc.value.hardiness.zone}`, num: true });
      // The film's own rain figure when it gives one, labelled; otherwise the derived one.
      const saidRain = statedOf(props.catalogue, 'rainfall');
      if (saidRain) parts.push({ text: `${saidText(saidRain)} rain a year (said)`, num: true });
      else if (loc.value.rainfall) parts.push({ text: `${loc.value.rainfall.mm_per_year.toLocaleString('en')} mm/yr`, num: true });
      if (loc.value.elevation) parts.push({ text: `${loc.value.elevation.m.toLocaleString('en')} m`, num: true });
      if (year.value) parts.push({ text: String(year.value), num: true });
      return parts;
    });
    // The record's provenance, behind one control: the film, the words, the location's
    // precision, and how the climate was read. The year alone stays on the line.
    // The film's own figure for something the harness also reads, and whether the two
    // agree: "The film says ~9 in a year (229 mm) at 6:57; that disagrees with the reading."
    const saidLine = (of) => {
      const s = statedOf(props.catalogue, of);
      if (!s) return null;
      const at = s.at?.length ? ` at ${formatTime(s.at[0])}` : '';
      const conv = s.said.unit === s.unit.split('/')[0] || (s.unit === '°C' && s.said.unit === 'C') ? '' : ` (${s.value.toLocaleString('en')} ${s.unit})`;
      const verdict = s.agrees === false ? '; the reading above disagrees with it' : s.agrees ? '; the reading above agrees' : '';
      return `The film says ${saidText(s)}${s.said.per ? ' a ' + s.said.per : ''}${conv}${at}${verdict}`;
    };
    const provenance = computed(() => {
      const c = context.value ?? {};
      const kind = `${props.catalogue.source.transcript_kind ?? ''} ${props.catalogue.source.transcript ?? ''}`;
      const captions = !/automatic|generated|machine/i.test(kind) ? (props.catalogue.source.transcript_kind ?? null) : /translat/i.test(kind) ? 'machine-translated automatic captions' : 'automatic captions';
      const month = uploaded.value ? uploaded.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null;
      const rows = [
        ['Film', c.channel ? `${c.channel}${month ? ', uploaded ' + month : ''}` : null],
        ['Words', captions],
        ['Location', c.location?.precision ?? null],
        ['Climate', climate.value ? `${climate.value.name} (Köppen ${climate.value.koppen}${climate.value.resolution ? ', ' + climate.value.resolution + ' map' : ''}), read at ${readAt(climate.value.derived_from)}, not said in the film` : null],
        ['Hardiness', [loc.value.hardiness ? `zone ${loc.value.hardiness.zone}: the coldest night of the year averages ${loc.value.hardiness.mean_annual_extreme_min_c} °C over ${loc.value.hardiness.years} (ERA5)` : null, saidLine('low temperature')].filter(Boolean).join('. ') || null],
        ['Rainfall', [loc.value.rainfall ? `${loc.value.rainfall.mm_per_year.toLocaleString('en')} mm a year (WorldClim, ${loc.value.rainfall.resolution}), read at ${readAt(loc.value.rainfall.derived_from)}` : null, saidLine('rainfall')].filter(Boolean).join('. ') || null],
        ['Elevation', [loc.value.elevation ? `${loc.value.elevation.m.toLocaleString('en')} m (Copernicus DEM)` : null, saidLine('elevation')].filter(Boolean).join('. ') || null],
      ];
      return rows.filter(([, v]) => v);
    });

    // The story (docs/ontology.md), cut into runs of plain text and the phrases that play
    // the film. A phrase is matched once, at its first occurrence, in the order given.
    const story = computed(() => {
      const s = props.catalogue.subject?.story;
      if (!s?.text) return [];
      const marks = [];
      for (const m of s.moments ?? []) {
        const i = s.text.indexOf(m.phrase);
        if (i >= 0 && !marks.some((k) => i < k.end && i + m.phrase.length > k.start)) marks.push({ start: i, end: i + m.phrase.length, at: m.at });
      }
      marks.sort((a, b) => a.start - b.start);
      const parts = []; let cursor = 0;
      for (const k of marks) {
        if (k.start > cursor) parts.push({ text: s.text.slice(cursor, k.start) });
        parts.push({ text: s.text.slice(k.start, k.end), at: k.at });
        cursor = k.end;
      }
      if (cursor < s.text.length) parts.push({ text: s.text.slice(cursor) });
      return parts;
    });
    // The practical bit: the film's figures in the index's slots, and what the place is
    // made of and runs on, read from the features' terms (material, energy and water
    // groups only; a form or a method is not what a reader means by "made of").
    const figs = computed(() => { const f = figures(props.catalogue); return COLUMNS.filter((c) => f[c.key]).map((c) => ({ ...c, cell: f[c.key] })); });
    // People and sources: the addresses the video description gives for the people behind
    // the place (docs/ontology.md, Link), one row per person, place, organisation or work.
    // A link reads as its site's name, or the platform's on a shared one; its kind follows
    // in the meta face. A sponsored link is marked in amber, never offered as advice.
    const PLATFORMS = { 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'linkedin.com': 'LinkedIn', 'vimeo.com': 'Vimeo', 'pinterest.com': 'Pinterest', 'patreon.com': 'Patreon' };
    const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'ow.ly', 'buff.ly', 'goo.gl', 'geni.us', 'amzn.to', 'linktr.ee']);
    const KIND_WORDS = { 'own site': 'site', video: 'film' };
    function linkLabel(l) {
      let u; try { u = new URL(l.url); } catch { return { text: l.url, kind: l.kind }; }
      const host = u.hostname.replace(/^www\./, '');
      const platform = PLATFORMS[host];
      if (platform && l.kind === 'social') return { text: platform, kind: null };
      if (platform) return { text: platform, kind: KIND_WORDS[l.kind] ?? l.kind };
      const text = SHORTENERS.has(host) ? host + u.pathname : host;
      return { text, kind: KIND_WORDS[l.kind] ?? l.kind };
    }
    const links = computed(() => {
      const people = new Map((props.catalogue.people ?? []).map((p) => [p.id, p.name]));
      const rows = new Map();
      for (const l of props.catalogue.links ?? []) {
        const e = l.entity;
        const key = e.type === 'person' || e.type === 'place' ? `${e.type}:${e.id}` : `${e.type}:${e.name}`;
        if (!rows.has(key)) {
          const name = e.type === 'person' ? people.get(e.id) ?? e.id : e.type === 'place' ? placeTitle(props.catalogue, e.id) : e.name;
          const behind = (e.people ?? []).map((id) => people.get(id)).filter(Boolean).join(' and ');
          // A name links to its entity's page when an owner-confirmed entity has one.
          const entity = e.entity ?? (e.type === 'person' ? (props.catalogue.people ?? []).find((p) => p.id === e.id)?.entity : null) ?? null;
          rows.set(key, { key, name, work: e.type === 'work', behind, entity, links: [] });
        }
        rows.get(key).links.push({ ...l, label: linkLabel(l) });
      }
      // A row of sponsored links only goes last: it is not about the people behind the place.
      return [...rows.values()].sort((a, b) => a.links.every((l) => l.sponsored) - b.links.every((l) => l.sponsored));
    });
    const madeOf = computed(() => {
      const tally = new Map();
      for (const f of props.catalogue.features) for (const t of f.terms ?? []) {
        if (['material', 'energy', 'water'].includes(props.terms.terms[t])) tally.set(t, (tally.get(t) ?? 0) + 1);
      }
      return [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || a.localeCompare(b)).slice(0, 10);
    });

    const order = { map: 0, cutaway: 1, plan: 2, section: 3, diagram: 4 };
    const hero = computed(() => props.illustrations.find((d) => d.hero) ?? null);
    // The viewer shows one of the page's drawings; arrows move along this list.
    const viewing = ref(-1);
    const openDrawing = (item) => { viewing.value = viewable.value.findIndex((d) => d.id === item.id); };
    const navigate = (step) => { viewing.value = Math.min(Math.max(viewing.value + step, 0), viewable.value.length - 1); };
    const drawings = computed(() => props.illustrations.filter((d) => !d.hero).sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)));
    const viewable = computed(() => [...(hero.value ? [hero.value] : []), ...drawings.value]);
    // The film plays where the portrait was: a click on the portrait, or any play mark on
    // the page (a phrase of the story, a figure, a frame a drawing was made from), swaps
    // the painting for the player at that moment, with the film's timeline under it.
    const video = ref(null);
    const playing = ref(false), startAt = ref(0);
    const film = ref({ seconds: 0, playing: false });
    const videoId = computed(() => youtubeId(props.catalogue.source.url) ?? props.catalogue.source.id);
    const youtube = computed(() => youtubeLink(props.catalogue.source.url, film.value.seconds));
    function play(seconds) {
      if (playing.value && video.value) { video.value.seek(seconds); return; }
      startAt.value = seconds; playing.value = true;
      document.querySelector('.opening')?.scrollIntoView({ block: 'nearest' });
    }
    const onTime = (seconds) => { film.value = { seconds, playing: true }; };
    // The drawings as a gallery in the page: the sheets small in a row, the chosen one
    // large and fitted whole inside the screen, and beside it what a reader needs to
    // judge it: the features it explains and the frames it was drawn from, each playing
    // the film. What a sheet leaves indicative is lettered on the sheet itself, so no
    // caveat is printed under it. The modal stays for zooming into a dense sheet.
    const current = ref(drawings.value[0]?.id ?? null);
    // The large sheet's proportion, read when it loads: its column is sized from it, so
    // the notes stand against the picture whatever its shape.
    const ratio = ref(null);
    const currentDrawing = computed(() => drawings.value.find((d) => d.id === current.value) ?? drawings.value[0] ?? null);
    // What the sheet explains, in the catalogue's shape: one row per whole. A whole the
    // sheet covers stands alone (its own page lists its parts); a whole it only covers
    // parts of (read from `part_of`) is named, marked partial, with those parts under it.
    const explains = computed(() => {
      const byId = new Map(props.catalogue.features.map((f) => [f.id, f]));
      const ids = (currentDrawing.value?.feature_ids ?? []).filter((id) => byId.has(id));
      const groups = new Map();
      for (const id of ids) {
        const f = byId.get(id);
        const wholeId = f.part_of && byId.has(f.part_of) ? f.part_of : id;
        if (!groups.has(wholeId)) groups.set(wholeId, { whole: byId.get(wholeId), listed: false, parts: [] });
        if (wholeId === id) groups.get(wholeId).listed = true; else groups.get(wholeId).parts.push(f);
      }
      return [...groups.values()];
    });
    // The frames a sheet was drawn from, grouped by what the painter read in them, so a
    // group's note is said once over its frames rather than once per frame.
    const sources = computed(() => {
      const groups = [];
      for (const r of currentDrawing.value?.references ?? []) {
        const g = groups.find((x) => x.shows === (r.shows || ''));
        if (g) g.frames.push(r); else groups.push({ shows: r.shows || '', frames: [r] });
      }
      return groups;
    });
    const sourceCount = computed(() => sources.value.reduce((n, g) => n + g.frames.length, 0));
    // Moving through the sheets: the arrows on the picture, the arrow keys anywhere in
    // the gallery, and a sideways swipe on the picture. A swipe must not also open the
    // zoom, so the click that follows it is swallowed.
    function step(n) {
      const i = drawings.value.findIndex((d) => d.id === currentDrawing.value?.id);
      current.value = drawings.value[(i + n + drawings.value.length) % drawings.value.length].id;
    }
    let swipe = null, swiped = false;
    function swipeStart(e) { swipe = { x: e.clientX, y: e.clientY }; swiped = false; }
    function swipeEnd(e) {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > 2 * Math.abs(dy)) { swiped = true; step(dx < 0 ? 1 : -1); }
    }
    function zoom(d) { if (swiped) { swiped = false; return; } openDrawing(d); }
    // A trackpad swipe is a wheel with a sideways delta, not a pointer: one clear push
    // steps once, then the gesture must settle before it can step again.
    let push = 0, pushed = false, settle = null;
    function wheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(settle); settle = setTimeout(() => { push = 0; pushed = false; }, 250);
      if (pushed) return;
      push += e.deltaX;
      if (Math.abs(push) > 60) { pushed = true; step(push > 0 ? 1 : -1); }
    }
    function keys(e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    }
    // Choosing a sheet from the strip brings the whole gallery into view, so the large
    // sheet is not left below the fold. However a sheet is chosen, its thumbnail is kept
    // in view in the strip (sideways only, so the page does not jump).
    const plates = ref(null);
    const strip = ref(null);
    const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
    function pick(id) {
      current.value = id;
      const el = plates.value;
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.top < 0 || box.bottom > innerHeight) el.scrollIntoView({ block: 'start', behavior: motion() });
    }
    watch(current, async () => {
      await nextTick();
      const row = strip.value, tab = row?.querySelector('[aria-selected="true"]');
      if (!tab) return;
      const left = row.scrollLeft + tab.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - tab.offsetWidth) / 2;
      row.scrollTo({ left: Math.max(0, left), behavior: motion() });
    });

    // The index: every feature as a tile, filtered by theme, place and search.
    // A search carried over from the front door's "N more in this place" opens the index on it.
    const query = ref(new URLSearchParams(location.search).get('q') ?? '');
    const theme = ref(null);
    const place = ref(null);
    // A term from "made of" narrows the index to the features that carry it.
    const term = ref(null);
    function pickTerm(t) { term.value = term.value === t ? null : t; if (term.value) document.querySelector('.gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const themes = computed(() => [...new Set(props.catalogue.features.map((f) => f.theme))]);
    const places = computed(() => props.catalogue.places.filter((p) => !p.outside || props.catalogue.features.some((f) => f.place === p.id)));
    const placeOfFeature = (f) => placeTitle(props.catalogue, f.place);
    // Parts fold under the thing they belong to; a search shows everything that matches.
    const partsOf = computed(() => {
      const map = new Map();
      for (const f of props.catalogue.features) if (f.part_of) { if (!map.has(f.part_of)) map.set(f.part_of, []); map.get(f.part_of).push(f); }
      return map;
    });
    const shown = computed(() => rankFeatures(props.catalogue.features, query.value)
      .filter((f) => query.value.trim() || !f.part_of)
      .filter((f) => !theme.value || f.theme === theme.value)
      .filter((f) => !term.value || (f.terms ?? []).includes(term.value))
      .filter((f) => !place.value || f.place === place.value));
    const partCount = (f) => (partsOf.value.get(f.id) ?? []).length;
    // The index is one grid, and each theme takes as many of its columns as it has
    // features, so a theme of one or two sits beside the next instead of holding a whole
    // row. The column count is measured, because a theme wider than the row must stop
    // at the row's width and wrap inside itself.
    const index = ref(null);
    const cols = ref(6);
    const TILE = 168, GAP = 16;  // .feature-index: minimum tile width and column gap
    let sizer = null;
    onMounted(() => {
      sizer = new ResizeObserver(([e]) => { cols.value = Math.max(1, Math.floor((e.contentRect.width + GAP) / (TILE + GAP))); });
      if (index.value) sizer.observe(index.value);
    });
    onBeforeUnmount(() => sizer?.disconnect());
    const grouped = computed(() => {
      const map = new Map();
      for (const f of shown.value) {
        const key = theme.value ? placeOfFeature(f) : f.theme;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(f);
      }
      return [...map.entries()];
    });

    const entityIndex = ref(null);
    loadEntityIndex().then((i) => { entityIndex.value = i; });
    const entityPage = (id) => pageFor(entityIndex.value, id);
    return { entityPage, index, cols, plates, strip, pick, context, climate, dateline, provenance, story, figs, madeOf, links, term, pickTerm, video, playing, startAt, film, videoId, youtube, play, onTime, current, ratio, currentDrawing, explains, sources, sourceCount, step, swipeStart, swipeEnd, zoom, wheel, keys, hero, drawings, viewable, viewing, openDrawing, navigate, query, theme, place, themes, places, shown, grouped, placeOfFeature, partCount, placeOf, formatTime };
  },
  template: `
    <div>
      <!-- The title and, under it, the dateline: where, the climate, the year, and the
           record's provenance behind one control. -->
      <header class="property-head">
        <h1>{{ catalogue.title }}</h1>
        <p class="context"><template v-for="(part, i) in dateline" :key="i"><span v-if="i" class="sep"> · </span><span :class="{ num: part.num }">{{ part.text }}</span></template>
          <details v-if="provenance.length" class="record"><summary aria-label="Where this record comes from" title="Where this record comes from">?</summary>
            <dl><template v-for="[k, v] in provenance" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
          </details></p>
        <SunCard :catalogue="catalogue" compact @select="$emit('select', $event)" />
      </header>

      <!-- The place in one look: the portrait leads, and beside it the story, with the
           phrases that play the film where they are said; then what it took, what it is
           made of, and the rules hand-off. -->
      <div class="opening" :class="{ 'with-portrait': hero }">
        <div v-if="hero" class="hero-drawing">
          <div v-if="playing" class="stage">
            <YouTubePlayer ref="video" :key="videoId" :video-id="videoId" :start="startAt" :watch-url="youtube" @time="onTime" />
          </div>
          <Drawing v-else :item="hero" compact large disclose play @open="play(0)" />
          <Timeline v-if="playing" :catalogue="catalogue" :film="film" @select="$emit('select', $event)" @play="play" />
        </div>
        <div class="glance">
          <p v-if="story.length" class="story"><template v-for="(part, i) in story" :key="i"><a v-if="part.at != null" href="#" class="fact" :title="'Plays the film at ' + formatTime(part.at)" :aria-label="part.text + ', play the film at ' + formatTime(part.at)" @click.prevent="play(part.at)">{{ part.text }}<span class="play">▸</span></a><template v-else>{{ part.text }}</template></template></p>
          <p v-else-if="catalogue.subject?.gist" class="gist">{{ catalogue.subject.gist }}</p>
          <dl v-if="figs.length" class="figures">
            <div v-for="c in figs" :key="c.key">
              <dt>{{ c.label }}</dt>
              <dd :title="c.cell.claim.text"><a v-if="c.cell.claim.at.length" href="#" class="fact" :aria-label="c.cell.claim.text + ', play the film at ' + formatTime(c.cell.claim.at[0])" @click.prevent="play(c.cell.claim.at[0])"><b>{{ c.cell.text }}</b><span class="play">▸</span></a><b v-else>{{ c.cell.text }}</b><small v-if="c.key === 'cost' && c.cell.of !== 'build cost'">paid</small></dd>
            </div>
          </dl>
          <p v-if="madeOf.length" class="madeof"><span>Made of, runs on</span><button v-for="t in madeOf" :key="t" :aria-pressed="term === t" @click="pickTerm(t)">{{ t }}</button></p>
          <div v-if="links.length" class="links">
            <p class="links-head"><span>People and sources</span><small>from the video description</small></p>
            <ul>
              <li v-for="row in links" :key="row.key">
                <span class="who"><a v-if="entityPage(row.entity)" class="entity" :href="entityPage(row.entity)"><cite v-if="row.work">{{ row.name }}</cite><template v-else>{{ row.name }}</template></a><template v-else><cite v-if="row.work">{{ row.name }}</cite><template v-else>{{ row.name }}</template></template><small v-if="row.behind">{{ row.work ? ', by ' : ', ' }}{{ row.behind }}</small></span>
                <template v-for="(l, i) in row.links" :key="l.id"><span v-if="i" class="sep"> · </span><a :href="l.url" target="_blank" rel="noopener noreferrer nofollow" :title="l.line">{{ l.label.text }}</a><small v-if="l.label.kind" class="kind">{{ ' ' + l.label.kind }}</small><small v-if="l.note" class="kind">{{ ', ' + l.note }}</small><small v-if="l.sponsored" class="sponsored"> sponsored</small><button v-if="l.at != null" class="moment" :title="'Plays the film at ' + formatTime(l.at)" :aria-label="'Play the film at ' + formatTime(l.at)" @click="play(l.at)">▸</button></template>
              </li>
            </ul>
          </div>
          <AskAbout topic="law" :catalogue="catalogue" />
        </div>
      </div>

      <section v-if="drawings.length" class="section drawings-gallery">
        <h2>Drawn from the film's frames</h2>
        <div v-if="currentDrawing" ref="plates" class="plates" @keydown="keys">
          <div ref="strip" class="plates-sheets" role="tablist" aria-label="Drawings">
            <button v-for="d in drawings" :key="d.id" role="tab" :aria-selected="d.id === currentDrawing.id" @click="pick(d.id)">
              <img :src="$img(d.path, 'thumb')" loading="lazy" :alt="d.title"><span>{{ d.title }}</span>
            </button>
          </div>
          <div class="plates-body">
          <figure class="plates-lead" :style="ratio ? { '--ratio': ratio } : null" @pointerdown="swipeStart" @pointerup="swipeEnd" @pointercancel="swipe = null" @wheel="wheel">
            <button class="open" :aria-label="'Zoom into ' + currentDrawing.title" title="Zoom" @click="zoom(currentDrawing)">
              <img :src="$img(currentDrawing.path, 'full')" :alt="currentDrawing.title" draggable="false" @load="ratio = $event.target.naturalWidth / $event.target.naturalHeight">
            </button>
            <template v-if="drawings.length > 1">
              <button class="arrow prev" aria-label="Previous drawing" @click="step(-1)">‹</button>
              <button class="arrow next" aria-label="Next drawing" @click="step(1)">›</button>
            </template>
          </figure>
          <div class="plates-notes">
            <h3>{{ currentDrawing.title }}</h3>
            <details v-if="explains.length" class="fold explains">
              <summary>What it explains<span class="num">{{ ' · ' + explains.length }}</span></summary>
              <ul>
                <li v-for="g in explains" :key="g.whole.id">
                  <a href="#" :class="{ partial: !g.listed }" @click.prevent="$emit('select', g.whole.id)"><img :src="$img(g.whole.thumbnail, 'thumb')" loading="lazy" alt=""><span>{{ g.whole.title }}<small v-if="g.parts.length" class="num">{{ ' · ' + g.parts.length + (g.listed ? ' parts' : ' of its parts') }}</small></span></a>
                  <ul v-if="!g.listed" class="parts">
                    <li v-for="f in g.parts" :key="f.id"><a href="#" @click.prevent="$emit('select', f.id)"><img :src="$img(f.thumbnail, 'thumb')" loading="lazy" alt=""><span>{{ f.title }}</span></a></li>
                  </ul>
                </li>
              </ul>
            </details>
            <details v-if="sources.length" class="fold sources">
              <summary>Drawn from<span class="num">{{ ' · ' + sourceCount + ' frames' }}</span></summary>
              <ul>
                <li v-for="g in sources" :key="g.shows">
                  <p v-if="g.shows">{{ g.shows }}</p>
                  <div class="frames">
                    <template v-for="r in g.frames" :key="r.path + r.time">
                      <a v-if="r.time != null" href="#" :title="'Plays the film at ' + formatTime(r.time)" :aria-label="'Play the film at ' + formatTime(r.time)" @click.prevent="play(r.time)"><img :src="$img(r.path, 'thumb')" loading="lazy" alt=""><span class="play">▸</span></a>
                      <img v-else :src="$img(r.path, 'thumb')" loading="lazy" alt="">
                    </template>
                  </div>
                </li>
              </ul>
            </details>
          </div>
          </div>
        </div>
      </section>
      <Viewer v-if="viewing >= 0" :items="viewable" :index="viewing" :catalogue="catalogue" @close="viewing = -1" @navigate="navigate" @play="play($event)" @select="$emit('select', $event)" />

      <!-- Sheets drawn by rule from the film's words and figures (data/<id>/schematics.json). -->
      <Schematic :catalogue="catalogue" @select="$emit('select', $event)" />

      <section class="section gallery">
        <div class="gallery-head">
          <input v-model="query" type="search" placeholder="Search this place" aria-label="Search this place">
        </div>
        <div class="filters">
          <button :aria-pressed="!theme && !term" @click="theme = null; term = null">All themes</button>
          <button v-for="t in themes" :key="t" :aria-pressed="theme === t" @click="theme = theme === t ? null : t">{{ t }}</button>
          <button v-if="term" aria-pressed="true" :title="'Only features made of or running on ' + term" @click="term = null">{{ term }} ×</button>
          <select :value="place ?? ''" @change="place = $event.target.value || null" aria-label="Place">
            <option value="">Every place</option>
            <option v-for="pl in places" :key="pl.id" :value="pl.id">{{ pl.title }}</option>
          </select>
        </div>
        <div ref="index" class="feature-index" :style="{ '--cols': cols }">
          <div v-for="[group, features] in grouped" :key="group" class="gallery-group" :style="{ '--span': Math.min(features.length, cols) }">
            <h3>{{ group }}</h3>
            <a v-for="f in features" :key="f.id" class="feature-card" :href="'#' + f.id" @click.prevent="$emit('select', f.id)">
              <img :src="$img(f.thumbnail, 'thumb')" loading="lazy" width="320" height="180" alt="">
              <b>{{ f.title }}<span v-if="partCount(f)" class="parts">, {{ partCount(f) }} {{ partCount(f) === 1 ? 'part' : 'parts' }}</span></b>
              <span class="meta">{{ placeOfFeature(f) }}<template v-if="f.phase !== 'current'">, {{ f.phase }}</template><template v-if="f.evidence_status === 'spoken_only'">, mentioned but not shown</template></span>
            </a>
          </div>
        </div>
        <p v-if="!shown.length" class="muted">Nothing matches. Try a broader word.</p>
      </section>
    </div>
  `,
};
