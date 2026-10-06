// One feature: a media stage (still or video) with the film's axis under it, and a
// reading column beside it that opens with the description, where the feature sits (its
// parts, or what it is part of), and the words said around the moment on the stage, so
// the frame and the words about it are read together.
import { computed, ref, watch } from 'vue';
import { formatTime, youtubeLink, youtubeId } from '../lib/format.js';
import { claimSpeaker, anchorOf, windowAround, featuresAt } from '../lib/data.js';
import { followWindow, passageAround, paragraphsOf, currentRow, soundParts, captionsOf } from '../lib/transcript.js';
import Drawing from './Drawing.js';
import Viewer from './Viewer.js';
import YouTubePlayer from './YouTubePlayer.js';
import AskAbout from './AskAbout.js';
import IdeaLinks from './IdeaLinks.js';
import Schematic from './Schematic.js';
import SunCard from './SunCard.js';

// What the reader would otherwise misread. The default case (seen and spoken about, still
// there) is what the page already shows, so it says nothing.
const STATUS = {
  visual_only: 'The film shows this but nobody talks about it; the description is what the camera saw.',
  spoken_only: 'The film talks about this but never shows it; the picture is the moment it is said.',
};
const PHASE = {
  historical: 'An earlier stage: the film shows it as it was, not as it is now.',
  'in progress': 'Unfinished when the film was made.',
  planned: 'Planned, not built when the film was made.',
};

export default {
  name: 'FeatureView',
  components: { Drawing, Viewer, YouTubePlayer, AskAbout, IdeaLinks, Schematic, SunCard },
  props: {
    feature: { type: Object, required: true },
    catalogue: { type: Object, required: true },
    transcript: { type: Array, required: true },
    illustrations: { type: Array, required: true },
    themes: { type: Array, default: () => [] },
  },
  emits: ['select', 'home', 'play', 'time'],
  setup(props, { emit }) {
    const video = ref(null);
    const playing = ref(false);
    const started = ref(false);  // the reader has played the film on this feature
    const currentFrame = ref(null);
    const playhead = ref(0);
    const startAt = ref(0);
    const videoId = computed(() => youtubeId(props.catalogue.source.url) ?? props.catalogue.source.id);

    const frames = computed(() => props.feature.evidence.filter((e) => e.type === 'frame'));
    const spoken = computed(() => props.feature.evidence.filter((e) => e.type === 'transcript'));
    const note = computed(() => [PHASE[props.feature.phase], STATUS[props.feature.evidence_status]].filter(Boolean).join(' '));
    const place = computed(() => props.catalogue.places.find((p) => p.id === props.feature.place)?.title ?? props.feature.place);

    const relationships = computed(() =>
      props.catalogue.relationships.filter((r) => r.subject === props.feature.id || r.object === props.feature.id));
    const related = computed(() =>
      props.feature.related_ids.map((id) => props.catalogue.features.find((f) => f.id === id)).filter(Boolean));
    const whole = computed(() => props.catalogue.features.find((f) => f.id === props.feature.part_of) ?? null);
    const parts = computed(() => props.catalogue.features.filter((f) => f.part_of === props.feature.id));
    const siblings = computed(() => whole.value ? props.catalogue.features.filter((f) => f.part_of === whole.value.id && f.id !== props.feature.id) : []);
    // The local moves a reader makes: what else is in this place, what the film showed before and after.
    const inPlace = computed(() => props.catalogue.features
      .filter((f) => f.place === props.feature.place && f.id !== props.feature.id && !f.part_of).slice(0, 8));
    const byTime = computed(() => [...props.catalogue.features].sort((a, b) => anchorOf(a) - anchorOf(b)));
    const previous = computed(() => { const i = byTime.value.findIndex((f) => f.id === props.feature.id); return i > 0 ? byTime.value[i - 1] : null; });
    const next = computed(() => { const i = byTime.value.findIndex((f) => f.id === props.feature.id); return i >= 0 && i < byTime.value.length - 1 ? byTime.value[i + 1] : null; });
    const drawings = computed(() =>
      props.illustrations.filter((d) => (d.feature_ids ?? []).includes(props.feature.id)));
    // What people said about this feature under a spoken theme (permits and the law), by theme.
    const said = computed(() => props.themes.filter((t) => t.claim_topics?.length).map((theme) => ({
      theme,
      claims: (props.catalogue.claims ?? []).filter((c) => c.about === props.feature.id && theme.claim_topics.includes(c.topic))
        .map((c) => ({ ...c, speaker: claimSpeaker(props.catalogue, c) })),
    })).filter((group) => group.claims.length));
    const viewing = ref(-1);
    const openDrawing = (item) => { viewing.value = drawings.value.findIndex((d) => d.id === item.id); };
    const navigate = (step) => { viewing.value = Math.min(Math.max(viewing.value + step, 0), drawings.value.length - 1); };

    // The moment the reader is at: the still's time, or the playhead while playing. The
    // words and the neighbours below the description follow it through one window.
    const anchorTime = computed(() => (playing.value ? playhead.value : currentFrame.value?.time ?? 0));
    // While the film plays the window holds still and turns pages, so the text is not
    // reflowed on every tick of the playhead.
    const stretch = ref(windowAround(0));
    const passage = computed(() => passageAround(props.transcript, stretch.value));
    watch([anchorTime, playing, () => props.feature], () => {
      stretch.value = playing.value ? followWindow(stretch.value, anchorTime.value, passage.value.rows[0]?.seconds) : windowAround(anchorTime.value);
    }, { immediate: true });
    const words = computed(() => paragraphsOf(passage.value, stretch.value, props.catalogue.source.text_sources));
    // With nothing said in the window, where the captions pick up again.
    const wordsNext = computed(() => props.transcript.find((row) => row.seconds > stretch.value[1]) ?? null);
    const captions = computed(() => captionsOf(props.catalogue.source));
    const saying = computed(() => (playing.value ? currentRow(passage.value.rows, playhead.value) : null));
    const sounds = soundParts;
    const nearby = computed(() => featuresAt(props.catalogue, stretch.value, props.feature.id).slice(0, 6));
    // The crumb names the place only when it says more than the film's title does: the
    // site of a single-property film is usually the title again, in another spelling.
    const plain = (s) => (s ?? '').toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, '');
    const placeRepeatsTitle = computed(() => plain(place.value) === plain(props.catalogue.title));
    // A connection's evidence note: kept when it says something, dropped when it is a token
    // such as "shown" or "visual_and_spoken", and freed of that token when it opens with one.
    const evidenceNote = (r) => {
      const text = (r.status ?? '').replace(/^(visual_and_spoken|visual|spoken|shown|demonstrated)\s*:\s*/i, '').trim();
      if (!/\s/.test(text)) return '';
      return text[0].toUpperCase() + text.slice(1).replace(/\.?$/, '.');
    };
    // The words said in a transcript span, so the reader sees what was said and not only when.
    const excerpt = (span) => {
      // All of it: a cut here fell just before the numbers (R5, R40) a reader came for.
      // The captions' ">>" change of speaker reads as a dash. A row counts when it overlaps
      // the span, so a line that starts just before a span authored against later times
      // is kept; rows without an `end` fall back to their start.
      return props.transcript.filter((row) => (row.end ?? row.seconds) >= span.start - 1 && row.seconds <= span.end).map((row) => row.text).join(' ')
        .replace(/\s*>>\s*/g, ' — ').replace(/\s+/g, ' ').replace(/^ — /, '').trim();
    };

    const youtube = computed(() => youtubeLink(props.catalogue.source.url, anchorTime.value));

    function titleOf(id) { return props.catalogue.features.find((f) => f.id === id)?.title ?? id; }

    // The player mounts when `playing` turns true and starts where it was asked to.
    function play(seconds) {
      playhead.value = seconds;
      if (playing.value && video.value) { video.value.seek(seconds); return; }
      startAt.value = seconds;
      playing.value = true;
      started.value = true;
    }

    function showFrame(frame) {
      playing.value = false;
      video.value?.pause();
      currentFrame.value = frame;
    }

    function onTimeUpdate(seconds) { playhead.value = seconds; emit('time', { seconds, playing: true }); }

    watch(() => props.feature, () => { playing.value = false; started.value = false; currentFrame.value = frames.value[0] ?? null; }, { immediate: true });
    watch(playing, (p) => { if (!p) emit('time', { seconds: playhead.value, playing: false }); });

    return { video, videoId, startAt, playing, started, currentFrame, playhead, frames, spoken, note, place, relationships, related, whole, parts, siblings, inPlace, previous, next, anchorOf, drawings, said, viewing, openDrawing, navigate,
      words, wordsNext, captions, saying, sounds, nearby, placeRepeatsTitle, evidenceNote, excerpt, youtube, anchorTime, titleOf, play, showFrame, onTimeUpdate, formatTime, emit };
  },
  expose: ['play'],
  // The slot is the film's timeline, owned by the app so that it can change the route;
  // it renders under the frames because that is the axis the frames and moments sit on.
  template: `
    <div>
      <nav class="crumbs"><a href="#" @click.prevent="emit('home')">{{ catalogue.title }}</a><template v-if="!placeRepeatsTitle"><span>›</span>{{ place }}</template><template v-if="whole"><span>›</span><a href="#" @click.prevent="emit('select', whole.id)">{{ whole.title }}</a></template></nav>
      <header class="feature-head">
        <h1>{{ feature.title }}</h1>
      </header>

      <div class="feature-body">
        <div>
          <div class="stage">
            <YouTubePlayer v-if="playing" ref="video" :key="videoId" :video-id="videoId" :start="startAt" :watch-url="youtube" @time="onTimeUpdate" />
            <button v-else-if="currentFrame" class="plays" :aria-label="'Play the film from ' + formatTime(currentFrame.time)" @click="play(currentFrame.time)">
              <img :src="$img(currentFrame.path)" :alt="feature.title + ' at ' + formatTime(currentFrame.time)">
              <span class="play-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>
            </button>
            <div class="overlay" v-if="!playing">
              <span class="time">{{ formatTime(anchorTime) }}</span>
              <a :href="youtube" target="_blank" rel="noopener">YouTube ↗</a>
            </div>
          </div>
          <div v-if="frames.length > 1 || playing" class="frames">
            <button v-for="frame in frames" :key="frame.path" :class="{ active: !playing && currentFrame && frame.path === currentFrame.path }" :aria-label="'Show the frame at ' + formatTime(frame.time)" @click="showFrame(frame)">
              <img :src="$img(frame.path, 'thumb')" alt=""><span>{{ formatTime(frame.time) }}</span>
            </button>
          </div>
          <slot></slot>
          <!-- The words said around the moment, under the film's axis. They appear once the
               reader first plays the film here, then follow the playhead or the chosen frame. -->
          <section v-if="started" class="words">
            <h3>Said around this moment</h3>
            <p v-if="captions" class="provenance">{{ captions }}</p>
            <p v-for="item in words" :key="item.at + (item.note ? '-note' : '')" :class="{ aside: item.note }"><button class="moment" :aria-label="'Play the film at ' + formatTime(item.at)" @click="play(item.at)">{{ formatTime(item.at) }}<template v-if="item.till">–{{ formatTime(item.till) }}</template></button><template v-if="item.note">{{ item.note }}</template><template v-else><span v-if="item.cutBefore" class="cut">…</span><template v-for="(piece, n) in item.pieces" :key="n"><span class="line" :class="{ now: piece.row === saying }" :title="'Play from ' + formatTime(piece.row.seconds)" @click="play(piece.row.seconds)"><template v-for="(bit, m) in sounds(piece.text)" :key="m"><span v-if="bit.sound" class="sound">{{ bit.part }}</span><template v-else>{{ bit.part }}</template></template></span>{{ n < item.pieces.length - 1 ? ' ' : '' }}</template><span v-if="item.cutAfter" class="cut">…</span></template></p>
            <p v-if="!words.length" class="aside">Nothing is said here in the captions.<template v-if="wordsNext"> They pick up at <button class="moment inline" :aria-label="'Play the film at ' + formatTime(wordsNext.seconds)" @click="play(wordsNext.seconds)">{{ formatTime(wordsNext.seconds) }}</button>.</template></p>
          </section>
        </div>

        <div class="reading">
          <p class="description">{{ feature.description }}</p>
          <p v-if="note" class="note">{{ note }}</p>
          <section v-if="whole" class="composition">
            <h3>Part of</h3>
            <a href="#" class="whole" @click.prevent="emit('select', whole.id)">
              <img :src="$img(whole.thumbnail, 'thumb')" alt="">
              <b>{{ whole.title }}</b>
            </a>
            <div v-if="siblings.length" class="siblings">
              <a v-for="f in siblings" :key="f.id" href="#" @click.prevent="emit('select', f.id)"><img :src="$img(f.thumbnail, 'thumb')" alt="">{{ f.title }}</a>
            </div>
          </section>
          <section v-else-if="parts.length" class="composition">
            <h3>Its parts</h3>
            <div class="parts-strip">
              <a v-for="f in parts" :key="f.id" href="#" @click.prevent="emit('select', f.id)"><img :src="$img(f.thumbnail, 'thumb')" alt=""><span>{{ f.title }}<template v-if="f.phase !== 'current'">, {{ f.phase }}</template></span></a>
            </div>
          </section>
          <!-- What else the film is on at the moment on the stage; it follows the frame the
               reader chose or the playhead. -->
          <section v-if="nearby.length" class="nearby">
            <h3>Also at this moment</h3>
            <ul>
              <li v-for="n in nearby" :key="n.feature.id"><a href="#" @click.prevent="emit('select', n.feature.id)"><img :src="$img(n.feature.thumbnail, 'thumb')" alt=""><span><b>{{ n.feature.title }}</b><small>{{ formatTime(n.time) }}</small></span></a></li>
            </ul>
          </section>
          <p class="unknown"><b>Not established by the film.</b> {{ feature.unknown }}</p>

          <template v-for="group in said" :key="group.theme.id">
            <h3>{{ group.theme.name }}</h3>
            <ul class="moments said">
              <li v-for="c in group.claims" :key="c.id">
                <span class="what">
                  <a v-if="c.at.length" href="#" class="fact" :title="'Plays the film at ' + formatTime(c.at[0])" :aria-label="c.text + ', play the film at ' + formatTime(c.at[0])" @click.prevent="play(c.at[0])"><b>{{ c.text }}</b><span class="play">▸</span></a>
                  <b v-else>{{ c.text }}</b>
                  <span class="who">{{ c.speaker }}</span><small v-if="c.doubt"> {{ c.doubt }}</small>
                </span>
              </li>
            </ul>
          </template>
          <AskAbout topic="law" :catalogue="catalogue" :feature="feature" />

          <h3 v-if="spoken.length">Where the film talks about it</h3>
          <ul v-if="spoken.length" class="moments">
            <li v-for="(s, i) in spoken" :key="i"><button class="moment" :aria-label="'Play the film at ' + formatTime(s.start)" @click="play(s.start)">{{ formatTime(s.start) }}–{{ formatTime(s.end) }}</button><span class="what">{{ excerpt(s) }}</span></li>
          </ul>

          <template v-if="relationships.length">
            <h3>Connections the film supports</h3>
            <div v-for="(r, i) in relationships" :key="i" class="connection">
              <a href="#" @click.prevent="emit('select', r.subject)">{{ titleOf(r.subject) }}</a><span class="pred">{{ r.predicate }}</span><a href="#" @click.prevent="emit('select', r.object)">{{ titleOf(r.object) }}</a>
              <small v-if="evidenceNote(r)">{{ evidenceNote(r) }}</small>
            </div>
          </template>

          <template v-if="related.length">
            <h3>Related</h3>
            <div class="links"><a v-for="f in related" :key="f.id" href="#" @click.prevent="emit('select', f.id)">{{ f.title }}</a></div>
          </template>
          <IdeaLinks :catalogue="catalogue" :feature="feature" />
          <Schematic :catalogue="catalogue" :feature="feature.id" @select="emit('select', $event)" />
          <SunCard :catalogue="catalogue" :feature="feature" @select="emit('select', $event)" />

          <template v-if="drawings.length">
            <h3>Drawings</h3>
            <div class="mini-drawings"><Drawing v-for="d in drawings" :key="d.id" :item="d" compact @open="openDrawing" /></div>
          </template>
        </div>
      </div>

      <section v-if="inPlace.length" class="context-row">
        <h3>Also in {{ place }}</h3>
        <div class="row">
          <a v-for="f in inPlace" :key="f.id" href="#" @click.prevent="emit('select', f.id)"><img :src="$img(f.thumbnail, 'thumb')" alt=""><span>{{ f.title }}</span></a>
        </div>
      </section>

      <Viewer v-if="viewing >= 0" :items="drawings" :index="viewing" :catalogue="catalogue" @close="viewing = -1" @navigate="navigate" @play="play($event)" @select="emit('select', $event)" />

      <nav class="pager">
        <a v-if="previous" href="#" class="prev" @click.prevent="emit('select', previous.id)"><small>Earlier in the film, {{ formatTime(anchorOf(previous)) }}</small><b>{{ previous.title }}</b></a>
        <span v-else></span>
        <a v-if="next" href="#" class="next" @click.prevent="emit('select', next.id)"><small>Next in the film, {{ formatTime(anchorOf(next)) }}</small><b>{{ next.title }}</b></a>
      </nav>
    </div>
  `,
};
