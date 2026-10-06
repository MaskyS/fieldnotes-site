// One drawing as a gallery tile: the sheet at a size where its structure reads, and its
// title. Everything else lives in the viewer, which the page owns so that arrow keys
// move between drawings. A tile says "Generated" on the picture only when asked to
// (`disclose`): the portraits are painted to look like photographs, so they need it;
// a plan or a cutaway under a heading that says a model drew it does not.
import { ref } from 'vue';

export default {
  name: 'Drawing',
  props: {
    item: { type: Object, required: true },
    catalogue: { type: Object, default: null },
    compact: { type: Boolean, default: false },
    large: { type: Boolean, default: false },
    disclose: { type: Boolean, default: false },
    // The tile plays the film instead of opening the viewer: a translucent play mark
    // on the picture says so.
    play: { type: Boolean, default: false },
  },
  emits: ['open', 'select'],
  setup(props) {
    const ar = ref(1.5);
    const onLoad = (e) => { ar.value = e.target.naturalWidth / e.target.naturalHeight; };
    return { ar, onLoad };
  },
  template: `
    <figure class="drawing" :class="{ compact }" :style="{ '--ar': ar }">
      <button class="open" :class="{ plays: play }" @click="$emit('open', item)" :aria-label="play ? 'Play the film' : 'Open ' + item.title">
        <img :src="$img(item.path, large ? 'full' : 'thumb')" loading="lazy" :alt="item.title" @load="onLoad">
        <span v-if="disclose" class="generated">Generated</span>
        <span v-if="play" class="play-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>
        <span v-else class="zoom-hint">Open and zoom</span>
      </button>
      <figcaption>
        <b>{{ item.title }}</b>
      </figcaption>
    </figure>
  `,
};
