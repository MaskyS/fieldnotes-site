// What each stretch of the film shows and what it does not, with the review sheets behind it.
import { formatTime } from '../lib/format.js';

export default {
  name: 'CoverageView',
  props: { catalogue: { type: Object, required: true } },
  emits: ['play'],
  setup(props) {
    const directory = props.catalogue.sampling.review_directory ?? 'review';
    const sheets = Array.from({ length: props.catalogue.sampling.contact_sheets }, (_, i) =>
      `${directory}/contact-${String(i + 1).padStart(2, '0')}.jpg`);
    return { sheets, formatTime };
  },
  template: `
    <div>
      <header class="property-head">
        <h1>{{ catalogue.title }}</h1>
        <p class="context">The film in {{ catalogue.coverage.length }} stretches.</p>
      </header>
      <div class="coverage">
        <article v-for="c in catalogue.coverage" :key="c.start">
          <img :src="$img(c.thumbnail, 'thumb')" loading="lazy" :alt="c.title">
          <div class="body">
            <span class="label">{{ formatTime(c.start) }} – {{ formatTime(c.end) }}</span>
            <h3>{{ c.title }}</h3>
            <p>{{ c.visible }}</p>
            <p class="gaps">{{ c.gaps }}</p>
            <button @click="$emit('play', c.start)">Watch from {{ formatTime(c.start) }}</button>
          </div>
        </article>
      </div>
      <details>
        <summary class="small muted">The {{ sheets.length }} contact sheets the review was made from</summary>
        <div class="sheets"><a v-for="s in sheets" :key="s" :href="$img(s)" target="_blank"><img loading="lazy" :src="$img(s, 'thumb')" alt=""></a></div>
      </details>
    </div>
  `,
};
