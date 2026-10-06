// One idea across places (TRIAL): the places it appears in, then every instance as a row
// with the same frame columns, so the eye compares without reading. A frame nobody spoke
// of says "not said" rather than disappearing. The summary at the top is written by a
// model from these rows only, checked against them, and cites them by row number.
import { computed, onMounted } from 'vue';
import { formatTime } from '../lib/format.js';
import { ideaLink, featureLink, momentLink } from '../lib/ideas.js';

// The page's own stylesheet, so the trial adds a file instead of editing style.css.
function useStylesheet() {
  if (document.querySelector('link[data-ideas]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'src/ideas.css' });
  link.dataset.ideas = '';
  document.head.append(link);
}

const COST = ['build cost', 'purchase price', 'land price', 'component cost', 'unit cost'];
const SIZE = ['land area', 'floor area'];
const KIND_GROUPS = [
  { key: 'why', label: 'Why' },
  { key: 'relied on', label: 'Relied on' },
  { key: 'living', label: 'Living with it' },
];

function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

export default {
  name: 'IdeaView',
  props: {
    idea: { type: Object, required: true },
    others: { type: Array, default: () => [] },
  },
  setup(props) {
    onMounted(useStylesheet);
    const c = computed(() => props.idea.computed);
    const counts = computed(() => c.value.counts);
    const isPattern = computed(() => props.idea.kind === 'pattern');
    const placeByFilm = computed(() => Object.fromEntries(c.value.places.map((p) => [p.film, p])));
    // Rows are numbered once, in the order shown, so the summary can point at them.
    const number = computed(() => Object.fromEntries(c.value.instances.map((r, i) => [r.id, i + 1])));
    const groups = computed(() => c.value.places.map((p) => ({ place: p, rows: c.value.instances.filter((r) => r.film === p.film) })));

    // The heading is the count, said the way a reader would say it.
    const headline = computed(() => {
      const n = counts.value;
      return `${plural(n.instances, 'feature')} in ${plural(n.places, 'place')}, in ${plural(n.climate_classes, 'climate class', 'climate classes')}`;
    });
    const tally = computed(() => {
      const n = counts.value, out = [];
      out.push(n.cost_stated_for_instance ? `a cost is stated for it at ${plural(n.cost_stated_for_instance, 'place')}` : 'no film states what it cost');
      if (n.running_cost_stated) out.push(`a running cost at ${plural(n.running_cost_stated, 'place')}`);
      if (n.instances_with_no_claim) out.push(`${n.instances_with_no_claim} of the ${n.instances} have nothing said about them as a claim`);
      if (n.said_only) out.push(`${n.said_only} ${n.said_only === 1 ? 'is' : 'are'} said and never shown`);
      if (n.seen_only) out.push(`${n.seen_only} ${n.seen_only === 1 ? 'is' : 'are'} seen and never talked about`);
      const s = out.join('; ');
      return s[0].toUpperCase() + s.slice(1) + '.';
    });

    const synthesis = computed(() => props.idea.synthesis ?? null);
    const placeFigure = (p, keys) => keys.flatMap((k) => p.figures[k] ?? []);
    const kindsKnown = (film) => (placeByFilm.value[film]?.claims_with_kind ?? 0) > 0;
    // The kind column only when some place's claims are sorted by kind; otherwise one line says so.
    const anyKinds = computed(() => c.value.places.some((p) => p.claims_with_kind > 0));
    const columns = computed(() => 6 + (isPattern.value ? 1 : 0) + (anyKinds.value ? 1 : 0));
    const kinded = (r, group) => r.claims.filter((cl) => cl.kind_group === group && !cl.quantity);  // figures keep their own column
    const year = (film) => placeByFilm.value[film]?.film_year;
    const isMoney = (cl) => /^[A-Z]{3}$/.test(cl.quantity?.unit ?? '');
    const proposedAliases = computed(() => (props.idea.aliases ?? []).filter((a) => a.status !== 'rejected'));
    const lineage = computed(() => (props.idea.lineage ?? []).filter((l) => l.status !== 'rejected'));
    const gloss = computed(() => (props.idea.gloss && props.idea.gloss.status !== 'rejected' ? props.idea.gloss : null));
    // What was said, without the claims already shown as figures.
    // and without those the kind column carries (reasons, conditions, living with it).
    const SLOTTED = new Set(KIND_GROUPS.map((k) => k.key));
    const saidOnly = (r) => r.claims.filter((cl) => !cl.quantity && !SLOTTED.has(cl.kind_group));
    const titleOf = (film) => placeByFilm.value[film]?.title ?? film;
    const candidate = (id) => { const [film, feature] = id.split('/'); return { film, feature, href: featureLink(film, feature) }; };

    return { c, counts, isPattern, anyKinds, columns, saidOnly, groups, number, headline, tally, synthesis, placeFigure, kindsKnown, kinded, year, isMoney,
      proposedAliases, lineage, gloss, titleOf, candidate, COST, SIZE, KIND_GROUPS, formatTime, ideaLink, featureLink, momentLink };
  },
  template: `
    <article class="idea">
      <nav class="crumbs"><a href="./">All places</a><span>›</span>Ideas across places</nav>
      <header class="idea-head">
        <h1>{{ idea.title }}</h1>
        <p v-if="isPattern" class="idea-kind">Pattern {{ idea.pattern.number }}, {{ idea.pattern.name }}, in Christopher Alexander's <i>A Pattern Language</i>. In our words: {{ idea.pattern.paraphrase }}</p>
        <p v-else class="idea-kind">A term from the catalogue's vocabulary<template v-if="idea.term_group">, in the {{ idea.term_group }} group</template>: every feature tagged with it is listed below.</p>
        <p v-if="gloss" class="idea-gloss">{{ gloss.text }} <a class="moment" :href="momentLink(gloss.evidence.film, gloss.evidence.at)">{{ formatTime(gloss.evidence.at) }}</a> <span v-if="gloss.status === 'proposed'" class="proposed">Proposed from the film's words; not yet confirmed.</span></p>
      </header>

      <section class="idea-summary">
        <h2>{{ headline }}</h2>
        <p class="tally">{{ tally }}</p>
        <template v-if="synthesis && synthesis.published">
          <p class="synthesis"><template v-for="(s, i) in synthesis.sentences" :key="i">{{ s.text }}<sup class="cites"><a v-for="id in s.cites" :key="id" :href="'#row-' + number[id]">{{ number[id] }}</a></sup>{{ ' ' }}</template></p>
          <p class="meta">Written by a model from the rows below and checked against them; the small numbers are rows.</p>
          <p v-if="synthesis.stale" class="proposed">The rows have changed since this was written<template v-if="synthesis.changed_rows?.length"> (rows {{ synthesis.changed_rows.map((id) => number[id] ?? 'removed').join(', ') }})</template>, so it may not match them.</p>
        </template>
        <p v-else-if="synthesis" class="proposed">A summary was written but failed its check against the rows, so it is not shown.</p>
      </section>

      <section class="idea-places">
        <h3>Where it appears</h3>
        <p class="meta">Climate, rain and zone are derived from the location each film discloses; no film states them.</p>
        <table class="idea-table places">
          <thead><tr><th>Place</th><th>Climate</th><th class="num">Rain</th><th>Zone</th><th>Cost of the whole place</th><th>Running cost</th><th>Land, floor</th></tr></thead>
          <tbody>
            <tr v-for="g in groups" :key="g.place.film">
              <td data-label="Place"><a :href="g.place.link">{{ g.place.title }}</a><small>{{ g.place.where || 'Location not said' }}<template v-if="g.place.film_year">, filmed {{ g.place.film_year }}</template></small></td>
              <td data-label="Climate" class="derived"><template v-if="g.place.derived.climate">{{ g.place.derived.climate.koppen }} <small>{{ g.place.derived.climate.name }}</small></template><span v-else class="none">not derived</span></td>
              <td data-label="Rain" class="derived num"><template v-if="g.place.derived.rain_mm != null">{{ g.place.derived.rain_mm.toLocaleString('en') }} mm</template><span v-else class="none">not derived</span></td>
              <td data-label="Zone" class="derived num"><template v-if="g.place.derived.zone">{{ g.place.derived.zone }}</template><span v-else class="none">not derived</span></td>
              <td data-label="Place cost"><template v-if="placeFigure(g.place, COST).length"><span v-for="cl in placeFigure(g.place, COST)" :key="cl.id" class="said-figure">{{ cl.text }} <a v-if="cl.at != null" class="moment" :href="momentLink(g.place.film, cl.at)">{{ formatTime(cl.at) }}</a></span></template><span v-else class="none">not said</span></td>
              <td data-label="Running cost"><template v-if="placeFigure(g.place, ['running cost']).length"><span v-for="cl in placeFigure(g.place, ['running cost'])" :key="cl.id" class="said-figure">{{ cl.text }} <a v-if="cl.at != null" class="moment" :href="momentLink(g.place.film, cl.at)">{{ formatTime(cl.at) }}</a></span></template><span v-else class="none">not said</span></td>
              <td data-label="Land, floor"><template v-if="placeFigure(g.place, SIZE).length"><span v-for="cl in placeFigure(g.place, SIZE)" :key="cl.id" class="said-figure">{{ cl.text }} <a v-if="cl.at != null" class="moment" :href="momentLink(g.place.film, cl.at)">{{ formatTime(cl.at) }}</a></span></template><span v-else class="none">not said</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="idea-instances">
        <h3>Every instance, with what it relied on</h3>
        <p v-if="isPattern" class="meta">Each feature's stance and fit were assigned by hand in a trial mapping to the pattern; they are not catalogue data.</p>
        <p v-if="!anyKinds" class="meta">What was said at these places is not yet sorted into reasons, conditions and lessons, so it is listed as said.</p>
        <table class="idea-table instances">
          <thead><tr><th class="n"></th><th>Feature</th><th v-if="isPattern">Stance</th><th>Seen or said</th><th>Figures stated</th><th>What was said</th><th v-if="anyKinds">Why, relied on, living with it</th><th>Not established by the film</th></tr></thead>
          <tbody v-for="g in groups" :key="g.place.film">
            <tr class="group"><th :colspan="columns"><a :href="g.place.link">{{ g.place.title }}</a></th></tr>
            <tr v-for="r in g.rows" :key="r.id" :id="'row-' + number[r.id]">
              <td class="n num" data-label="Row">{{ number[r.id] }}</td>
              <td data-label="Feature" class="feature">
                <a :href="featureLink(r.film, r.feature)"><img v-if="r.thumbnail" :src="$img(r.thumbnail, 'thumb')" alt=""><b>{{ r.title }}</b></a>
                <small>{{ r.place_title }}<template v-if="r.part_of">, part of {{ r.part_of.title }}</template><template v-if="r.phase !== 'current'">; {{ r.phase }}</template></small>
                <a v-if="r.moments.frames.length" class="moment" :href="momentLink(r.film, r.moments.frames[0])">{{ formatTime(r.moments.frames[0]) }}</a>
              </td>
              <td v-if="isPattern" data-label="Stance" class="stance"><b>{{ r.assignment.stance }}</b><small>{{ r.assignment.fit }} fit. {{ r.assignment.basis }}</small><small v-if="r.assignment.source !== 'trial-mapping'" class="source">{{ r.assignment.source }}</small></td>
              <td data-label="Seen or said" :class="{ only: r.evidence_status !== 'visual_and_spoken' }">{{ r.seen_or_said }}</td>
              <td data-label="Figures stated">
                <template v-if="r.figures.length"><span v-for="cl in r.figures" :key="cl.id" class="said-figure">{{ cl.text }}<template v-if="isMoney(cl) && year(r.film)"> ({{ year(r.film) }} film)</template> <a v-if="cl.at != null" class="moment" :href="momentLink(r.film, cl.at)">{{ formatTime(cl.at) }}</a></span></template>
                <span v-else class="none">not said</span>
              </td>
              <td data-label="What was said">
                <ul v-if="saidOnly(r).length" class="claims">
                  <li v-for="cl in saidOnly(r)" :key="cl.id">{{ cl.text }} <span class="who">{{ cl.by }}</span> <a v-if="cl.at != null" class="moment" :href="momentLink(r.film, cl.at)">{{ formatTime(cl.at) }}</a><small v-if="cl.doubt" class="doubt"> {{ cl.doubt }}</small></li>
                </ul>
                <span v-else class="none">{{ r.claims.length ? 'nothing more' : 'nothing recorded as a claim' }}</span>
              </td>
              <td v-if="anyKinds" data-label="Why, relied on, living with it" class="kinds">
                <template v-if="kindsKnown(r.film)">
                  <div v-for="k in KIND_GROUPS" :key="k.key" class="slot"><span class="k">{{ k.label }}</span>
                    <ul v-if="kinded(r, k.key).length" class="claims"><li v-for="cl in kinded(r, k.key)" :key="cl.id">{{ cl.text }} <span class="who">{{ cl.kind }}</span> <a v-if="cl.at != null" class="moment" :href="momentLink(r.film, cl.at)">{{ formatTime(cl.at) }}</a></li></ul>
                    <span v-else class="none">not said</span></div>
                </template>
                <span v-else class="none">not sorted yet</span>
              </td>
              <td data-label="Not established by the film" class="unknown">{{ r.unknown || 'Nothing recorded.' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="idea-lineage">
        <h3>Where it comes from</h3>
        <ul v-if="lineage.length" class="lineage">
          <li v-for="(l, i) in lineage" :key="i"><b>{{ l.tradition }}</b> <q>{{ l.evidence.quote }}</q> <span class="who">{{ titleOf(l.evidence.film) }}</span> <a class="moment" :href="momentLink(l.evidence.film, l.evidence.at)">{{ formatTime(l.evidence.at) }}</a> <span v-if="l.status === 'proposed'" class="proposed">Proposed from the film's words; not yet confirmed.</span></li>
        </ul>
        <p v-else class="none">No film names where this comes from.</p>
      </section>

      <section v-if="proposedAliases.length" class="idea-aliases">
        <h3>Possibly the same idea under other words</h3>
        <p class="meta">Proposed by a model and not counted above until confirmed.</p>
        <ul>
          <li v-for="(a, i) in proposedAliases" :key="i"><b>{{ a.surface }}</b>: <template v-for="(id, j) in a.candidates" :key="id"><template v-if="j">, </template><a :href="candidate(id).href">{{ a.titles?.[id] ?? id }}</a></template>. <span class="reason">{{ a.reason }}</span></li>
        </ul>
      </section>

      <section v-if="others.length" class="idea-others">
        <h3>Other ideas across places</h3>
        <p><template v-for="(o, i) in others" :key="o.id"><template v-if="i"> · </template><a :href="ideaLink(o.id)">{{ o.title }}</a> <small>{{ o.places }} places</small></template></p>
      </section>
    </article>
  `,
};
