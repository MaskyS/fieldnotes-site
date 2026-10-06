// On a feature page (TRIAL): the ideas this feature is an instance of that other places
// share, as one quiet line each, leading to the idea page (scripts/build_ideas.py).
import { ref, watch } from 'vue';
import { loadIdeaIndex, ideasFor, ideaLink } from '../lib/ideas.js';

export default {
  name: 'IdeaLinks',
  props: {
    catalogue: { type: Object, required: true },
    feature: { type: Object, required: true },
  },
  setup(props) {
    const ideas = ref([]);
    watch(() => props.feature.id, async () => {
      const index = await loadIdeaIndex();
      ideas.value = ideasFor(index, props.catalogue.source.id, props.feature.id);
    }, { immediate: true });
    return { ideas, ideaLink };
  },
  template: `
    <template v-if="ideas.length">
      <h3>Across places</h3>
      <div class="links"><a v-for="i in ideas" :key="i.id" :href="ideaLink(i.id)">Also in {{ i.otherPlaces }} other {{ i.otherPlaces === 1 ? 'place' : 'places' }}: {{ i.title.toLowerCase() }}</a></div>
    </template>
  `,
};
