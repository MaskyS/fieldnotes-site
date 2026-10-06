// The film as an axis: coverage intervals as bands, every feature as a mark at the
// moment it is filmed, the current one green, the playhead while the film runs. Hover
// or focus a mark to see what it is, click to open it; click a band to play the film
// there. Rendered under the frame on the feature page, so the frames' times sit on it.
import { computed, ref } from 'vue';
import { formatTime } from '../lib/format.js';

export default {
  name: 'Timeline',
  props: {
    catalogue: { type: Object, required: true },
    currentId: { type: String, default: null },
    film: { type: Object, default: () => ({ seconds: 0, playing: false }) },
  },
  emits: ['select', 'play'],
  setup(props, { emit }) {
    const duration = computed(() => props.catalogue.source.duration);
    const pct = (t) => `${(100 * t / duration.value).toFixed(2)}%`;

    // A feature sits at its first frame's moment.
    const anchor = (f) => {
      const frames = f.evidence.filter((e) => e.type === 'frame');
      return frames.length ? frames[0].time : (f.evidence[0]?.start ?? 0);
    };
    const ticks = computed(() => props.catalogue.features
      .map((f) => ({ f, time: anchor(f) }))
      .sort((a, b) => a.time - b.time));
    const segments = computed(() => props.catalogue.coverage.map((c, i) => ({ ...c, i })));

    const hovered = ref(null);
    const current = computed(() => ticks.value.find((t) => t.f.id === props.currentId) ?? null);
    // While the film plays, the feature the film is at: the last tick at or before the playhead.
    const now = computed(() => {
      if (!props.film.playing) return null;
      let best = null;
      for (const t of ticks.value) { if (t.time <= props.film.seconds + 0.5) best = t; else break; }
      return best;
    });
    const shown = computed(() => hovered.value ?? now.value ?? current.value);

    return { duration, pct, ticks, segments, hovered, current, now, shown, formatTime, emit };
  },
  template: `
    <div class="timeline" aria-label="The whole film: every feature at the moment it is filmed">
      <div class="track">
        <button v-for="s in segments" :key="s.start" class="segment" :class="{ odd: s.i % 2 }"
          :style="{ left: pct(s.start), width: pct(s.end - s.start) }" :title="s.title + ', ' + formatTime(s.start)"
          :aria-label="'Play the film from ' + formatTime(s.start) + ': ' + s.title"
          @click="emit('play', s.start)"></button>
        <button v-for="t in ticks" :key="t.f.id" class="tick" :class="{ current: t.f.id === currentId, part: !!t.f.part_of }"
          :style="{ left: pct(t.time) }" :aria-label="t.f.title + ', ' + formatTime(t.time)" :aria-current="t.f.id === currentId ? 'true' : null"
          @mouseenter="hovered = t" @mouseleave="hovered = null" @focus="hovered = t" @blur="hovered = null"
          @click="emit('select', t.f.id)"></button>
        <div v-if="film.playing" class="playhead" :style="{ left: pct(film.seconds) }"></div>
      </div>
      <div class="legend">
        <span class="edge">00:00</span>
        <span v-if="shown" class="hint" :class="{ live: hovered, now: !hovered && now }">
          <img :src="$img(shown.f.thumbnail, 'thumb')" alt="">
          <b v-if="!hovered && now && now.f.id !== currentId"><a href="#" @click.prevent="emit('select', now.f.id)">Now showing: {{ now.f.title }}</a></b>
          <b v-else>{{ shown.f.title }}</b>
          <em>{{ !hovered && now ? formatTime(film.seconds) : formatTime(shown.time) }}</em>
        </span>
        <span class="edge">{{ formatTime(duration) }}</span>
      </div>
    </div>
  `,
};
