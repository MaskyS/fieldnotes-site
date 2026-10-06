// The sun and overhang card (src/lib/sun.js): what the film says about which way the
// place faces, then the noon sun at both solstices at the place and at the reader's
// latitude, the overhang that shades a window, a section and (folded) a plan of the
// sky. The geometry is calculated from the latitude the location was read at and says
// so; the film's evidence is told apart as said, seen and not established. No film
// time is printed. The reader's latitude lives in the address (?lat=, ?where=); the
// last one typed is also kept in this browser, as the "where you would build" field is.
//
// On a place page it is compact, under the dateline: one line when the film states no
// orientation, two when it does, and the card behind it. On a feature page it shows
// when the feature carries a sun-related term.
import { computed, ref } from 'vue';
import { sunCard, readerFrom, readerFromSearch, searchWithReader, isSunFeature, TOWNS } from '../lib/sun.js';
import AskAbout from './AskAbout.js';

const KEY = 'fieldnotes.lat';
function remembered() { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } }
function remember(reader) { try { if (reader) localStorage.setItem(KEY, JSON.stringify(reader)); else localStorage.removeItem(KEY); } catch { /* private window */ } }
function useStylesheet() {
  if (document.querySelector('link[data-sun]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'src/sun.css' });
  link.dataset.sun = '';
  document.head.append(link);
}
const KIND = { said: 'Said', seen: 'Seen', none: 'Not established' };

export default {
  name: 'SunCard',
  components: { AskAbout },
  props: {
    catalogue: { type: Object, required: true },
    feature: { type: Object, default: null },
    compact: { type: Boolean, default: false },
  },
  emits: ['select'],
  setup(props) {
    useStylesheet();
    const fromAddress = readerFromSearch(location.search);
    const reader = ref(fromAddress ?? remembered());
    const typed = ref(reader.value ? reader.value.where || String(reader.value.lat) : '');
    const refused = ref(false);
    function place(r) {
      history.replaceState(history.state, '', location.pathname + searchWithReader(location.search, r) + location.hash);
    }
    if (!fromAddress && reader.value) place(reader.value);
    function choose() {
      const text = typed.value.trim();
      const r = text ? readerFrom(text) : null;
      refused.value = Boolean(text) && !r;
      if (text && !r) return;
      reader.value = r; remember(r); place(r);
    }
    const shown = computed(() => (props.compact ? true : isSunFeature(props.feature)));
    const card = computed(() => (shown.value ? sunCard(props.catalogue, { featureId: props.feature?.id ?? null, reader: reader.value }) : null));
    const short = computed(() => (props.catalogue.title ?? '').split(/[,’']/)[0].trim() || 'This place');
    const towns = Object.keys(TOWNS);
    // Opened when the reader arrives with a latitude: they came to compare.
    const open = Boolean(fromAddress);
    return { card, short, reader, typed, refused, choose, towns, open, KIND };
  },
  template: `
    <section v-if="card" class="sun" :class="{ compact }">
      <component :is="compact ? 'details' : 'div'" class="sun-fold" :open="compact ? open : undefined">
        <summary v-if="compact">
          <span v-if="card.summary.said" class="sun-said">{{ card.summary.said }}.</span>
          <span v-else class="sun-unsaid">Which way it faces is not established by the film.</span>
          <span class="sun-open">Sun and overhang at {{ card.latitude }}</span>
          <span v-if="card.summary.said" class="sun-noon">{{ card.summary.noon }} <span class="sun-calc">{{ card.calculated }}</span></span>
        </summary>
        <h3 v-else class="sun-head">Sun and overhang</h3>
        <div class="sun-body">
        <ul class="sun-gives">
          <li v-for="(g, i) in card.gives" :key="i" :class="g.kind">
            <span class="k">{{ KIND[g.kind] }}</span>
            <template v-if="g.kind === 'said'"><span class="who">{{ g.who }}</span> <span class="what" :title="g.title">{{ g.text }}</span><a v-if="g.feature && g.feature !== feature?.id" href="#" class="go" :title="g.title" @click.prevent="$emit('select', g.feature)">{{ g.thing }}</a></template>
            <template v-else-if="g.kind === 'seen'">{{ g.text }} <template v-for="(f, j) in g.features" :key="f.id"><span v-if="j">, </span><a href="#" @click.prevent="$emit('select', f.id)">{{ f.title }}</a></template><template v-if="g.more">, and {{ g.more }} more</template>.</template>
            <template v-else>{{ g.text }}</template>
          </li>
        </ul>

        <form class="sun-reader" @submit.prevent="choose">
          <label for="sun-where">Where you would build</label>
          <input id="sun-where" v-model="typed" list="sun-towns" type="text" placeholder="A town, or a latitude such as -37.8" autocomplete="off" @change="choose">
          <datalist id="sun-towns"><option v-for="t in towns" :key="t" :value="t"></option></datalist>
          <small v-if="refused" class="sun-refused">Type a town from the list, or a latitude between 66° S and 66° N.</small>
        </form>

        <table class="sun-figures">
          <thead><tr><th></th><th scope="col">{{ short }}<small>{{ card.latitude }}</small></th><th v-if="card.reader" scope="col">{{ card.reader.where || 'Where you are' }}<small>{{ card.reader.latitude }}</small></th></tr></thead>
          <tbody>
            <tr v-for="r in card.rows" :key="r.key">
              <th scope="row">{{ r.label }}</th>
              <td><b>{{ r.place.figure }}</b><small>{{ r.place.note }}</small></td>
              <td v-if="r.you"><b>{{ r.you.figure }}</b><small>{{ r.you.note }}</small></td>
            </tr>
          </tbody>
        </table>
        <p class="sun-calc">{{ card.calculated + (card.range ? ' ' + card.range : '') }}</p>
        <p v-if="card.mirror" class="sun-mirror"><b>Mirror it.</b> {{ card.mirror.replace(/^Mirror it\. /, '') }}</p>

        <div class="sun-sheets" :class="{ two: card.sections.you }">
          <figure v-html="card.sections.place"></figure>
          <figure v-if="card.sections.you" v-html="card.sections.you"></figure>
        </div>
        <p class="sun-calc">The overhang drawn is the depth that just shades the whole window at midsummer noon. {{ card.caveat }}</p>
        <details class="sun-plan">
          <summary>Where the sun rises and sets</summary>
          <div class="sun-sheets" :class="{ two: card.plans.you }">
            <figure v-html="card.plans.place"></figure>
            <figure v-if="card.plans.you" v-html="card.plans.you"></figure>
          </div>
          <p class="sun-calc">North is up; the ring is the horizon and the centre is overhead. The tinted half is the sky away from the equator: while the sun is there, a wall facing away from the equator is in sun. {{ card.calculated }}</p>
        </details>
        <AskAbout topic="sun" :catalogue="catalogue" :feature="feature" :lat="reader ? reader.lat : null" />
        </div>
      </component>
    </section>
  `,
};
