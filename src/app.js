// Fieldnotes: a catalogue of filmed properties with evidence-linked features.
// Routes: the index (no property in the URL), or one property with views
// overview, feature and coverage kept in the hash.
import { createApp, computed, ref, nextTick, watch } from 'vue';
import { loadCollection, loadProperty, loadAll } from './lib/data.js';
import { loadAssets, assetsPlugin } from './lib/assets.js';
import Home from './components/Home.js';
import SearchBox from './components/SearchBox.js';
import Timeline from './components/Timeline.js';
import Overview from './components/Overview.js';
import FeatureView from './components/FeatureView.js';
import CoverageView from './components/CoverageView.js';

// index.html shows "Loading the catalogue…" until the app mounts over it. When a load
// fails, the page says so in the same place instead of staying blank.
function fail(title, detail) {
  const app = document.getElementById('app');
  app.replaceChildren();
  const box = document.createElement('div');
  box.className = 'notice';
  const h = document.createElement('h1'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = detail;
  const a = document.createElement('a'); a.href = './'; a.textContent = 'All places';
  box.append(h, p, a);
  app.append(box);
}

let collection;
try {
  [collection] = await Promise.all([loadCollection(), loadAssets()]);
} catch (e) {
  fail('The catalogue did not load', `${e.message}. Reload the page to try again.`);
  throw e;
}
const requestedId = new URLSearchParams(location.search).get('property');
const entry = collection.properties.find((p) => p.id === requestedId) ?? null;

// An idea across places (TRIAL): ?idea=<id>, compiled by scripts/build_ideas.py.
const ideaId = new URLSearchParams(location.search).get('idea');
// An entity across films: ?entity=<id>, compiled by scripts/build_entities.py for
// owner-confirmed entities that have a page.
const entityId = new URLSearchParams(location.search).get('entity');

if (entityId) {
  const [{ loadEntity }, { default: EntityView }] = await Promise.all([import('./lib/entities.js'), import('./components/EntityView.js')]);
  let entity;
  try {
    entity = await loadEntity(entityId);
  } catch (e) {
    fail('Nothing with that address', `${e.message}. The link may be old, or the page may have been taken down.`);
    throw e;
  }
  document.title = `${entity.name} · Housecraft DB`;
  createApp({
    components: { EntityView },
    setup: () => ({ entity }),
    template: `<div class="shell index"><div class="topbar"><a class="brand" href="./"><b>house</b><i>craft</i> <span>DB</span></a></div><main class="main"><EntityView :entity="entity" /></main></div>`,
  }).use(assetsPlugin).mount('#app');
} else if (ideaId) {
  const [{ loadIdea, loadIdeaIndex }, { default: IdeaView }] = await Promise.all([import('./lib/ideas.js'), import('./components/IdeaView.js')]);
  let idea, index;
  try {
    [idea, index] = await Promise.all([loadIdea(ideaId), loadIdeaIndex()]);
  } catch (e) {
    fail('No idea with that address', `${e.message}. The link may be old.`);
    throw e;
  }
  document.title = `${idea.title} · Housecraft DB`;
  const others = index.ideas.filter((o) => o.id !== idea.id);
  createApp({
    components: { IdeaView },
    setup: () => ({ idea, others }),
    template: `<div class="shell index"><div class="topbar"><a class="brand" href="./"><b>house</b><i>craft</i> <span>DB</span></a></div><main class="main"><IdeaView :idea="idea" :others="others" /></main></div>`,
  }).use(assetsPlugin).mount('#app');
} else if (requestedId && !entry) {
  fail('No place with that address', `Nothing here is called "${requestedId}". The link may be old, or the place may have been renamed.`);
} else if (!entry) {
  let all;
  try {
    all = await loadAll(collection);
  } catch (e) {
    fail('The catalogue did not load', `${e.message}. Reload the page to try again.`);
    throw e;
  }
  const { properties, themes, countries, terms } = all;
  createApp({
    components: { Home },
    setup: () => ({ properties, themes, countries, terms }),
    template: `<div class="shell index"><div class="topbar"><a class="brand" href="./"><b>house</b><i>craft</i> <span>DB</span></a></div><main class="main"><Home :properties="properties" :themes="themes" :countries="countries" :terms="terms" /></main></div>`,
  }).use(assetsPlugin).mount('#app');
} else {
  let property;
  try {
    property = await loadProperty(entry);
  } catch (e) {
    fail(`${entry.title} did not load`, `${e.message}. Reload the page to try again.`);
    throw e;
  }
  const { catalogue } = property;

  function readHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash === 'coverage') return { view: 'coverage', id: null };
    if (catalogue.features.some((f) => f.id === hash)) return { view: 'feature', id: hash };
    return { view: 'overview', id: null };
  }

  createApp({
    components: { SearchBox, Timeline, Overview, FeatureView, CoverageView },
    setup() {
      const route = ref(readHash());
      const featureView = ref(null);
      const selected = computed(() => catalogue.features.find((f) => f.id === route.value.id) ?? null);

      function go(view, id = null, { keepScroll = false } = {}) {
        route.value = { view, id };
        location.hash = view === 'feature' ? id : view === 'coverage' ? 'coverage' : '';
        if (!keepScroll) window.scrollTo({ top: 0 });
      }

      // The film's position, reported by the feature page while it plays.
      const film = ref({ seconds: 0, playing: false });

      // From the timeline: change the page without losing the place on it, and if the
      // film is running, keep it running at the same moment on the new page.
      async function goFromTimeline(id) {
        const resume = film.value.playing ? film.value.seconds : null;
        go('feature', id, { keepScroll: true });
        if (resume != null) { await nextTick(); featureView.value?.play(resume); }
      }

      // The reader's latitude (?lat=, ?where=, the sun card's) goes with them to the next place.
      function switchProperty(id) {
        const keep = new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => k === 'lat' || k === 'where'));
        location.href = id ? `?property=${encodeURIComponent(id)}${keep.size ? '&' + keep : ''}` : './';
      }

      // Playing a moment from the sidebar or coverage opens the nearest feature and starts there.
      async function playAt(seconds) {
        if (route.value.view !== 'feature') {
          const nearest = [...catalogue.features]
            .map((f) => ({ f, d: Math.min(...f.evidence.map((e) => Math.abs((e.time ?? e.start) - seconds))) }))
            .sort((a, b) => a.d - b.d)[0]?.f;
          go('feature', nearest?.id ?? catalogue.features[0].id);
          await nextTick();
        }
        featureView.value?.play(seconds);
      }

      window.addEventListener('hashchange', () => { route.value = readHash(); });
      const t = Number(new URLSearchParams(location.search).get('t'));
      if (t > 0) setTimeout(() => playAt(t), 0);
      watch(selected, (f) => { document.title = f ? `${f.title} · ${catalogue.title}` : catalogue.title; }, { immediate: true });

      return { collection, entry, catalogue, property, route, selected, featureView, film, go, goFromTimeline, switchProperty, playAt };
    },
    // The timeline is the film's axis, so it sits under the frame on the feature page
    // (FeatureView's slot) rather than as a strip above everything.
    template: `
      <div class="shell no-sidebar">
        <div class="topbar">
          <a class="brand" href="./"><b>house</b><i>craft</i> <span>DB</span></a>
          <select :value="entry.id" @change="switchProperty($event.target.value)" aria-label="Place">
            <option value="">All places</option>
            <option v-for="p in collection.properties" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <SearchBox :catalogue="catalogue" :transcript="property.transcript" @select="go('feature', $event)" @play="playAt" />
          <nav>
            <a href="#" :class="{ active: route.view !== 'coverage' }" @click.prevent="go('overview')">Catalogue</a>
            <a href="#coverage" :class="{ active: route.view === 'coverage' }" @click.prevent="go('coverage')">Coverage</a>
          </nav>
        </div>

        <main class="main">
          <Overview v-if="route.view === 'overview'" :catalogue="catalogue" :illustrations="property.illustrations" :terms="property.terms" @select="go('feature', $event)" @play="playAt" />
          <FeatureView v-else-if="route.view === 'feature' && selected" ref="featureView" :feature="selected" :catalogue="catalogue" :transcript="property.transcript" :illustrations="property.illustrations" :themes="property.themes" @select="go('feature', $event)" @home="go('overview')" @play="playAt" @time="film = $event">
            <Timeline :catalogue="catalogue" :current-id="route.id" :film="film" @select="goFromTimeline" @play="playAt" />
          </FeatureView>
          <CoverageView v-else :catalogue="catalogue" @play="playAt" />
        </main>
      </div>
    `,
  }).use(assetsPlugin).mount('#app');
}
