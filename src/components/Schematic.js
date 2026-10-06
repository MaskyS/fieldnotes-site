// The standard schematics of a place (data/<id>/schematics.json; scripts/schematics.py;
// src/lib/schematic.js): sheets drawn by rule from the catalogue's own features and
// claims, so one kind of sheet looks the same at every place. Each element on a sheet
// links to its feature; its evidence and the claim's words are in the element's title.
// No film time is printed on a sheet. The component fetches its own record, so the
// page that mounts it changes by one line.
import { computed, onMounted, ref } from 'vue';
import { renderSchematic } from '../lib/schematic.js';

function useStylesheet() {
  if (document.querySelector('link[data-schematic]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'src/schematic.css' });
  link.dataset.schematic = '';
  document.head.append(link);
}

export default {
  name: 'Schematic',
  props: {
    catalogue: { type: Object, required: true },
    // On a feature page: only the sheets that name this feature.
    feature: { type: String, default: null },
    heading: { type: String, default: 'Drawn from the film\'s words' },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const items = ref([]);
    onMounted(async () => {
      useStylesheet();
      try {
        const r = await fetch(`data/${encodeURIComponent(props.catalogue.source.id)}/schematics.json`);
        if (!r.ok) return;
        const spec = await r.json();
        items.value = (spec.items ?? []).map((it) => { try { return renderSchematic(it, props.catalogue); } catch (e) { console.warn('schematic', it.id, e); return null; } }).filter(Boolean);
      } catch { items.value = []; }
    });
    const shown = computed(() => props.feature ? items.value.filter((s) => s.features.includes(props.feature)) : items.value);
    const titleOf = (id) => props.catalogue.features.find((f) => f.id === id)?.title ?? id;
    // A click or a key on an element that names a feature opens that feature.
    function pick(e) {
      const el = e.target.closest?.('[data-feature]');
      if (!el) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      emit('select', el.dataset.feature);
    }
    return { shown, titleOf, pick };
  },
  template: `
    <section v-if="shown.length" class="section schematics">
      <h2 v-if="heading">{{ heading }}</h2>
      <div class="schematic-sheets" :class="{ one: shown.length === 1 }">
        <figure v-for="s in shown" :key="s.id" class="schematic-sheet" @click="pick" @keydown="pick">
          <div class="sheet" v-html="s.svg"></div>
          <figcaption>
            <b>{{ s.title }}</b>
            <span class="explains"><template v-for="(id, i) in s.features" :key="id"><span v-if="i"> · </span><a href="#" @click.prevent="$emit('select', id)">{{ titleOf(id) }}</a></template></span>
          </figcaption>
        </figure>
      </div>
    </section>
  `,
};
