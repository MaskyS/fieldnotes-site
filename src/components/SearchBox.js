// Global search for one place, in the top bar: features by title and text, and moments
// in the narration. Results drop down under the field. Mouse picks on mousedown so the
// field keeps focus; keys walk the hits with the arrows and choose with Enter.
import { computed, ref, watch } from 'vue';
import { rankFeatures, parseQuery, says } from '../../vendor/search.js';
import { formatTime } from '../lib/format.js';

export default {
  name: 'SearchBox',
  props: {
    catalogue: { type: Object, required: true },
    transcript: { type: Array, required: true },
  },
  emits: ['select', 'play'],
  setup(props, { emit }) {
    const query = ref('');
    const open = ref(false);
    const active = ref(-1);
    const features = computed(() => (query.value.trim() ? rankFeatures(props.catalogue.features, query.value).slice(0, 8) : []));
    const moments = computed(() => {
      const q = parseQuery(query.value);
      if (!q.tokens.length) return [];
      return props.transcript.filter((row) => says(row, q)).slice(0, 4);
    });
    // One list for the keyboard: features first, then moments, in the order shown.
    const hits = computed(() => [
      ...features.value.map((f) => ({ key: `f-${f.id}`, go: () => emit('select', f.id) })),
      ...moments.value.map((m) => ({ key: `m-${m.seconds}`, go: () => emit('play', m.seconds) })),
    ]);
    // Typing reopens the list after a choice closed it; the field still has focus then.
    watch(query, (q) => { active.value = -1; if (q.trim()) open.value = true; });

    const done = () => { query.value = ''; open.value = false; active.value = -1; };
    const pick = (id) => { emit('select', id); done(); };
    const play = (t) => { emit('play', t); done(); };
    const move = (step) => {
      if (!hits.value.length) return;
      open.value = true;
      active.value = (active.value + step + hits.value.length) % hits.value.length;
    };
    const choose = () => {
      const hit = hits.value[active.value] ?? hits.value[0];
      if (hit) { hit.go(); done(); }
    };
    // Close only when focus leaves the box, so tabbing onto a hit keeps it open.
    const onFocusOut = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { open.value = false; active.value = -1; } };
    const activeId = computed(() => (active.value >= 0 ? `search-hit-${active.value}` : null));
    return { query, open, active, activeId, features, moments, pick, play, move, choose, onFocusOut, formatTime };
  },
  template: `
    <div class="searchbox" @focusin="open = true" @focusout="onFocusOut">
      <input v-model="query" type="search" placeholder="Search this place" aria-label="Search this place"
             role="combobox" aria-autocomplete="list" :aria-expanded="open && (features.length || moments.length) ? 'true' : 'false'"
             aria-controls="search-hits" :aria-activedescendant="activeId"
             @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose" @keydown.esc="open = false">
      <div v-if="open && (features.length || moments.length)" id="search-hits" class="results" role="listbox">
        <button v-for="(f, i) in features" :key="f.id" :id="'search-hit-' + i" class="hit" :class="{ active: i === active }" role="option" :aria-selected="i === active"
                @mousedown.prevent="pick(f.id)" @click="pick(f.id)">
          <img :src="$img(f.thumbnail, 'thumb')" alt=""><span><b>{{ f.title }}</b><em>{{ f.theme }}</em></span>
        </button>
        <div v-if="moments.length" class="label">Said in the film</div>
        <button v-for="(m, j) in moments" :key="m.seconds" :id="'search-hit-' + (features.length + j)" class="hit moment" :class="{ active: features.length + j === active }" role="option" :aria-selected="features.length + j === active"
                @mousedown.prevent="play(m.seconds)" @click="play(m.seconds)">
          <time>{{ formatTime(m.seconds) }}</time><span>{{ m.text }}</span>
        </button>
      </div>
    </div>
  `,
};
