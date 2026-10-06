// One entity across films: who or what it is, then each film that shows or names it, in
// upload order and in the same form, so the eye compares without reading. A place gets
// its figures as a table (figures as rows, films as columns, never one value) and the
// location each film discloses side by side. A person's page is backlinks only: each
// film's own name for them, the relation, what they said there and that film's
// addresses; no note, no summary. Film times live in the play button's tooltip.
import { computed, onMounted } from 'vue';
import { formatTime } from '../lib/format.js';
import { momentLink } from '../lib/entities.js';

function useStylesheet() {
  if (document.querySelector('link[data-entities]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'src/entities.css' });
  link.dataset.entities = '';
  document.head.append(link);
}

const TYPE_WORDS = { person: 'Person', organisation: 'Organisation', community: 'Community', work: 'Work', place: 'Place' };
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n) => COUNT_WORDS[n] ?? String(n);
const TIMES = ['never', 'once', 'twice', 'three times', 'four times'];
const PLATFORMS = { 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'linkedin.com': 'LinkedIn', 'vimeo.com': 'Vimeo' };
const KIND_WORDS = { 'own site': 'site', video: 'film' };

// The address as the place page words it: the site's name, or the platform's.
function linkLabel(l) {
  let u; try { u = new URL(l.url); } catch { return { text: l.url, kind: l.kind }; }
  const host = u.hostname.replace(/^www\./, '');
  const platform = PLATFORMS[host];
  if (platform) return { text: platform, kind: l.kind === 'social' ? null : KIND_WORDS[l.kind] ?? l.kind };
  return { text: host, kind: KIND_WORDS[l.kind] ?? l.kind };
}

const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export default {
  name: 'EntityView',
  props: { entity: { type: Object, required: true } },
  setup(props) {
    onMounted(useStylesheet);
    const c = computed(() => props.entity.computed);
    const films = computed(() => c.value.films);
    const isPlace = computed(() => props.entity.type === 'place');
    const isPerson = computed(() => props.entity.type === 'person');

    // The one meta line, in the label face: what the films make of it, counted.
    const meta = computed(() => {
      const n = films.value.length, years = c.value.counts.years;
      if (isPlace.value) return n > 1 ? `Filmed ${TIMES[n] ?? `${n} times`}, ${and(years)}` : `Filmed once, ${years[0] ?? 'year not known'}`;
      if (isPerson.value) {
        const roles = [...new Set(films.value.flatMap((b) => b.records.filter((r) => r.kind === 'person').map((r) => r.relation)))].filter((r) => r && r !== 'other');
        return sentence(`${roles.length ? and(roles) + ' in ' : 'in '}${count(n)} film${n === 1 ? '' : 's'}`);
      }
      const m = c.value.counts.mentions;
      return sentence(`addresses given in ${count(n)} film${n === 1 ? '' : 's'}${m ? `, named in ${count(m)} more` : ''}`);
    });

    // A place's figures: rows are what a figure measures, columns the films in upload order.
    const figureRows = computed(() => (c.value.figures ?? []).map((row) => ({ of: sentence(row.of), cells: films.value.map((b) => ({ film: b.film, claims: row.cells[b.film] ?? [] })) })));
    const relation = (b) => {
      const people = b.records.filter((r) => r.kind === 'person');
      if (people.length) return people.map((r) => (r.relation && r.relation !== 'other' ? `${r.name}, ${r.relation}` : r.name)).join('; ');
      if (b.people?.length) {
        const byRel = new Map();
        for (const p of b.people) byRel.set(p.relation, [...(byRel.get(p.relation) ?? []), p.name]);
        return [...byRel].map(([rel, names]) => `${and(names)}, ${rel}${names.length > 1 ? 's' : ''}`).join('; ');
      }
      if (b.behind?.length) return `by ${and(b.behind)}, as the description says`;
      return null;
    };
    const placeTitle = (b) => b.records.find((r) => r.kind === 'place')?.title ?? b.title;
    const play = (film, at) => momentLink(film, at);
    const tip = (at) => `Plays the film at ${formatTime(at)}`;
    const derivedLine = (b) => {
      const d = b.derived ?? {}, out = [];
      if (d.climate) out.push(`${d.climate.koppen}${d.climate.name ? ` ${d.climate.name.toLowerCase()}` : ''}`);
      if (d.rain_mm != null) out.push(`${d.rain_mm.toLocaleString('en')} mm rain`);
      if (d.zone) out.push(`zone ${d.zone}`);
      return out.join(' · ');
    };
    const yearOf = (film) => films.value.find((b) => b.film === film)?.film_year;

    return { c, films, isPlace, isPerson, meta, figureRows, relation, placeTitle, play, tip, derivedLine, yearOf, linkLabel, TYPE_WORDS };
  },
  template: `
    <article class="entity">
      <nav class="crumbs"><a href="./">All places</a><span>›</span>{{ TYPE_WORDS[entity.type] }}</nav>
      <header class="entity-head">
        <h1>{{ entity.name }}</h1>
        <p class="entity-meta">{{ meta }}<template v-if="entity.aliases?.length">; also written {{ entity.aliases.join(', ') }}</template></p>
      </header>

      <section v-if="isPlace && films.length > 1" class="entity-figures">
        <table class="entity-table">
          <thead><tr><th></th><th v-for="b in films" :key="b.film"><a :href="b.link">{{ b.film_year || 'Year not known' }}</a><small>{{ b.title }}</small></th></tr></thead>
          <tbody>
            <tr v-for="row in figureRows" :key="row.of">
              <th scope="row">{{ row.of }}</th>
              <td v-for="cell in row.cells" :key="cell.film">
                <span v-for="cl in cell.claims" :key="cl.id" class="said-figure">{{ cl.text }} <span class="who">{{ cl.by }}</span><a v-if="cl.at != null" class="play" :href="play(cell.film, cl.at)" :title="tip(cl.at)" :aria-label="tip(cl.at)">▸</a></span>
                <span v-if="!cell.claims.length" class="none">not said</span>
              </td>
            </tr>
            <tr class="derived">
              <th scope="row">Location</th>
              <td v-for="b in films" :key="b.film">{{ b.point?.matched || b.where || 'not disclosed' }}<small v-if="derivedLine(b)">{{ derivedLine(b) }}</small></td>
            </tr>
          </tbody>
        </table>
        <p class="meta">Figures are as each film states them, in that film's year. The location line and what follows it are derived from where each film says it is, not stated by the film.</p>
        <p v-for="w in c.location_warnings" :key="w.films.join()" class="note">{{ w.message }}</p>
      </section>

      <section class="entity-films">
        <div v-for="b in films" :key="b.film" class="entity-film">
          <h2><a :href="b.link">{{ isPlace ? placeTitle(b) : b.title }}</a></h2>
          <p class="entity-where">{{ b.where || 'Location not said' }}<template v-if="b.film_year"> · {{ b.film_year }}</template><template v-if="relation(b)"> · {{ relation(b) }}</template></p>
          <p v-if="isPlace && b.gist" class="gist">{{ b.gist }}</p>
          <ul v-if="b.claims.length" class="said">
            <li v-for="cl in b.claims" :key="cl.id">{{ cl.text }}<small v-if="cl.about_title" class="who"> about {{ cl.about_title }}</small><a v-if="cl.at != null" class="play" :href="play(b.film, cl.at)" :title="tip(cl.at)" :aria-label="tip(cl.at)">▸</a><small v-if="cl.doubt" class="doubt"> {{ cl.doubt }}</small></li>
          </ul>
          <p v-else-if="isPerson" class="none">Nothing they say is recorded as a claim in this film.</p>
          <p v-if="b.links.length" class="entity-links"><span class="label">From the description</span>
            <template v-for="(l, i) in b.links" :key="l.url"><span v-if="i" class="sep"> · </span><a :href="l.url" target="_blank" rel="noopener noreferrer nofollow" :title="l.line">{{ linkLabel(l).text }}</a><small v-if="linkLabel(l).kind" class="kind">{{ ' ' + linkLabel(l).kind }}</small><small v-if="l.sponsored" class="sponsored"> sponsored</small><a v-if="l.at != null" class="play" :href="play(b.film, l.at)" :title="tip(l.at)" :aria-label="tip(l.at)">▸</a></template>
          </p>
        </div>
      </section>

      <section v-if="c.mentions.length" class="entity-mentions">
        <h3>Named in other films</h3>
        <ul>
          <li v-for="(m, i) in c.mentions" :key="i"><q>{{ m.quote }}</q> <a :href="m.link" class="film">{{ m.title }}</a><a v-if="m.at != null" class="play" :href="play(m.film, m.at)" :title="tip(m.at)" :aria-label="tip(m.at)">▸</a></li>
        </ul>
      </section>
    </article>
  `,
};
