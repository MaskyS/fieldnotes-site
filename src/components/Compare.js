// Places side by side: the same facts in the same slots, one column per place, so the
// eye compares without reading. Every figure is a claim's quantity in the speaker's own
// unit; a dash is the film not stating it; a figure from a different year than the
// others carries its year, because a 2014 price beside a 2026 one is not a comparison.
import { computed } from 'vue';
import { placeOf } from '../lib/data.js';
import { figures, placeFigures, filmYear, climateOf, COLUMNS, PLACE_COLUMNS } from '../lib/quantities.js';

export default {
  name: 'Compare',
  props: {
    properties: { type: Array, required: true },
    terms: { type: Object, default: () => ({ groups: {}, terms: {} }) },
  },
  emits: ['remove', 'close'],
  setup(props) {
    const cover = (p) => p.illustrations.find((d) => d.hero) ?? p.illustrations.find((d) => d.kind === 'map') ?? p.illustrations[0] ?? null;
    const years = computed(() => props.properties.map((p) => filmYear(p.catalogue)));
    const mixedYears = computed(() => new Set(years.value.filter(Boolean)).size > 1);
    // What each place is made of and runs on: its features' terms in the material, energy
    // and water groups, most frequent first, a handful of each.
    const madeOf = (p, groups) => {
      const tally = new Map();
      for (const f of p.catalogue.features) for (const t of f.terms ?? []) if (groups.includes(props.terms.terms[t])) tally.set(t, (tally.get(t) ?? 0) + 1);
      return [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || a.localeCompare(b)).slice(0, 6);
    };
    const law = (p) => (p.catalogue.claims ?? []).filter((c) => c.topic === 'law');
    const columns = computed(() => props.properties.map((p, i) => {
      const f = figures(p.catalogue);
      return {
        p, cover: cover(p), where: placeOf(p.catalogue.source.context), climate: climateOf(p.catalogue)?.name ?? null, year: years.value[i],
        // What the harness read at the place (zone, rain) sits in rows under the film's
        // figures, in the same cells, so a grower compares zones the way a buyer compares cost.
        figs: { ...Object.fromEntries(COLUMNS.map((c) => [c.key, f[c.key]])), ...placeFigures(p.catalogue) },
        materials: madeOf(p, ['material']), runsOn: madeOf(p, ['energy', 'water']),
        law: law(p),
      };
    }));
    // The rows a stranger compares, in the order they ask: what it took, what it is made
    // of, what it runs on, what the rules were. A row nobody answers is left out.
    const rows = computed(() => [
      ...[...COLUMNS, ...PLACE_COLUMNS].map((c) => ({ key: c.key, label: c.label, cells: columns.value.map((col) => col.figs[c.key]) })),
      { key: 'materials', label: 'Made of', cells: columns.value.map((col) => col.materials) },
      { key: 'runsOn', label: 'Runs on', cells: columns.value.map((col) => col.runsOn) },
      { key: 'law', label: 'Rules', cells: columns.value.map((col) => col.law) },
    ].filter((r) => r.cells.some((c) => c && (Array.isArray(c) ? c.length : true))));
    const link = (p, c) => `?property=${encodeURIComponent(p.entry.id)}` + (c.at?.length ? `&t=${Math.floor(c.at[0])}` : '') + (c.about ? `#${encodeURIComponent(c.about)}` : '');
    return { columns, rows, mixedYears, link };
  },
  template: `
    <section class="compare" aria-label="Places side by side">
      <div class="compare-head">
        <h2>{{ columns.length }} places side by side</h2>
        <button class="ghost" @click="$emit('close')">Close</button>
      </div>
      <div class="compare-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th v-for="col in columns" :key="col.p.entry.id">
                <a :href="'?property=' + col.p.entry.id" class="cover"><img v-if="col.cover" :src="$img(col.cover.path, 'thumb')" :alt="col.cover.title"><img v-else :src="$img(col.p.catalogue.features[0].thumbnail, 'thumb')" alt=""></a>
                <a :href="'?property=' + col.p.entry.id" class="name">{{ col.p.catalogue.title }}</a>
                <span class="place">{{ col.where }}<template v-if="col.climate"> · {{ col.climate }}</template></span>
                <button class="ghost small" :aria-label="'Remove ' + col.p.catalogue.title" @click="$emit('remove', col.p.entry.id)">Remove</button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <th scope="row">{{ r.label }}</th>
              <td v-for="(cell, i) in r.cells" :key="i" :class="{ num: !Array.isArray(cell) }">
                <template v-if="!cell || (Array.isArray(cell) && !cell.length)"><span class="none">–</span></template>
                <template v-else-if="r.key === 'law'">
                  <ul class="rules"><li v-for="c in cell.slice(0, 4)" :key="c.id"><a :href="link(columns[i].p, c)">{{ c.text }}</a></li></ul>
                  <small v-if="cell.length > 4">and {{ cell.length - 4 }} more</small>
                </template>
                <template v-else-if="Array.isArray(cell)">{{ cell.join(', ') }}</template>
                <template v-else-if="!cell.claim"><b :title="'Read from the location, not stated by the film'">{{ cell.text }}</b></template>
                <template v-else>
                  <a :href="link(columns[i].p, cell.claim)" :title="cell.claim.text"><b>{{ cell.text }}</b></a>
                  <small v-if="r.key === 'cost' && cell.of !== 'build cost'">paid</small>
                  <small v-if="cell.said" :title="'Said in the film; the location reads ' + (cell.derived ? cell.derived.mm_per_year + ' mm a year' : 'nothing')">said<template v-if="cell.agrees === false">; location reads {{ cell.derived.mm_per_year }} mm</template></small>
                  <small v-if="mixedYears && columns[i].year && ['cost'].includes(r.key)">{{ columns[i].year }}</small>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
};
