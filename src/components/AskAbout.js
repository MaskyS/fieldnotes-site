// A question to take to an assistant: about one feature, or about the whole place.
// The reader says where they live, reads what will be asked, then copies it or opens it.
import { computed, ref, watch } from 'vue';
import { TOPICS, ASSISTANTS, buildQuestion, assistantLink } from '../lib/ask.js';

const KEY = 'fieldnotes.where';
function remembered() { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } }

export default {
  name: 'AskAbout',
  props: {
    topic: { type: String, default: 'law' },
    catalogue: { type: Object, required: true },
    feature: { type: Object, default: null },
    // The reader's latitude, when the page knows it (the sun card's ?lat=).
    lat: { type: Number, default: null },
  },
  setup(props) {
    const where = ref(remembered());
    const copied = ref(false);
    const t = computed(() => TOPICS[props.topic]);
    const question = computed(() => buildQuestion({ topic: props.topic, catalogue: props.catalogue, feature: props.feature, where: where.value, lat: props.lat }));
    const links = computed(() => ASSISTANTS.map((a) => ({ name: a.name, ...assistantLink(a, question.value) })));

    watch(where, (value) => { try { localStorage.setItem(KEY, value); } catch { /* private window */ } });
    watch(question, () => { copied.value = false; });

    async function copy() {
      try {
        await navigator.clipboard.writeText(question.value);
      } catch {
        // No clipboard permission: select the text so the reader can copy it by hand.
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.ask pre'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
      }
      copied.value = true;
    }

    return { t, where, question, links, copied, copy };
  },
  template: `
    <details class="ask">
      <summary>{{ t.label }}</summary>
      <label>Where you would build
        <input v-model="where" type="text" placeholder="Town, region, country" autocomplete="off">
      </label>
      <div class="actions">
        <button class="primary" @click="copy">{{ copied ? 'Copied' : 'Copy the question' }}</button>
        <a v-for="l in links" :key="l.name" :href="l.href" target="_blank" rel="noopener" @click="copy">Open in {{ l.name }} ↗</a>
      </div>
      <p v-if="links.some((l) => !l.prefilled)" class="small muted">This question is too long to send in a link. It is on your clipboard; paste it into the chat that opens.</p>
      <details class="read">
        <summary>Read the question</summary>
        <pre>{{ question }}</pre>
      </details>
      <p class="small muted">The answer comes from an assistant, not from this site. Check it with your local building office before you spend money.</p>
    </details>
  `,
};
