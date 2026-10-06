// The shape of the collection in numbers, folded into the refine line. At rest each
// figure is one quiet line, the same weight as Where and Kind: its name and the two ends
// of what the films state ("Cost €11k – ~$50k"), or the chosen range in green. A click
// opens it into a strip: every place a dot on a log axis and two handles to drag, the
// ends updating live. The range is state in the URL like any other refinement; a place
// whose film does not state the figure has no dot and is kept by no range.
import { computed, ref } from 'vue';

const W = 280, H = 30, PAD = 10;

export default {
  name: 'Strips',
  props: {
    // [{ key, label, points: [{ id, title, value, text }] }], points sorted by value
    strips: { type: Array, required: true },
    // { [key]: [min, max] | null } in the strip's own value scale
    ranges: { type: Object, required: true },
    // ids of the places still shown, so dots the other refinements exclude fade
    shown: { type: Object, required: true },
  },
  emits: ['range'],
  setup(props, { emit }) {
    const open = ref(null);
    // A figure that spans orders of magnitude (cost, land) sits on a log axis; a figure
    // on a scale of its own (a hardiness zone) on a linear one, when the strip says so.
    const scales = computed(() => Object.fromEntries(props.strips.map((s) => {
      const values = s.points.map((p) => p.value).filter((v) => s.linear || v > 0);
      const lo = Math.min(...values), hi = Math.max(...values);
      if (s.linear) {
        const span = hi === lo ? 1 : hi - lo;
        const x = (v) => PAD + ((v - lo) / span) * (W - 2 * PAD);
        const v = (px) => lo + ((px - PAD) / (W - 2 * PAD)) * span;
        return [s.key, { x, v, lo, hi, linear: true }];
      }
      const l0 = Math.log10(lo), l1 = Math.log10(hi === lo ? lo * 10 : hi);
      const x = (v) => PAD + ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * (W - 2 * PAD);
      const v = (px) => 10 ** (l0 + ((px - PAD) / (W - 2 * PAD)) * (l1 - l0));
      return [s.key, { x, v, lo, hi }];
    })));
    // The handles' positions: the range's ends, or the axis ends when nothing is chosen.
    const handles = (s) => {
      const sc = scales.value[s.key];
      const r = drag.value?.key === s.key ? drag.value.r : props.ranges[s.key];
      return r ? [sc.x(r[0]), sc.x(r[1])] : [PAD, W - PAD];
    };
    const drag = ref(null);
    const px = (e, el) => { const b = el.getBoundingClientRect(); return Math.max(PAD, Math.min(W - PAD, ((e.clientX - b.left) / b.width) * W)); };
    function down(e, s) {
      const x = px(e, e.currentTarget);
      const [a, b] = handles(s);
      // The nearer handle follows the pointer; a press in the middle moves the nearer one too.
      const which = Math.abs(x - a) <= Math.abs(x - b) ? 0 : 1;
      const sc = scales.value[s.key];
      const r = props.ranges[s.key] ? [...props.ranges[s.key]] : [sc.lo, sc.hi];
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.value = { key: s.key, which, r };
      move(e, s);
    }
    function move(e, s) {
      if (!drag.value || drag.value.key !== s.key) return;
      const sc = scales.value[s.key];
      const v = sc.v(px(e, e.currentTarget));
      const r = [...drag.value.r];
      r[drag.value.which] = v;
      if (r[0] > r[1]) { r.sort((a, b) => a - b); drag.value.which = 1 - drag.value.which; }
      drag.value = { ...drag.value, r };
    }
    function up(e, s) {
      if (!drag.value || drag.value.key !== s.key) return;
      const sc = scales.value[s.key];
      const [a, b] = drag.value.r; drag.value = null;
      // Handles back at both ends mean no range.
      const slack = sc.linear ? 0.01 : 0;
      emit('range', s.key, (sc.linear ? a <= sc.lo + slack : a <= sc.lo * 1.001) && (sc.linear ? b >= sc.hi - slack : b >= sc.hi * 0.999) ? null : [a, b]);
    }
    // The line at rest: the two ends stated, or the chosen range as the nearest stated figures.
    const distance = (s, a, b) => (s.linear ? Math.abs(a - b) : Math.abs(Math.log(a / b)));
    const nearest = (s, v) => s.points.reduce((best, p) => (distance(s, p.value, v) < distance(s, best.value, v) ? p : best), s.points[0]).text;
    const ends = (s) => {
      const r = drag.value?.key === s.key ? drag.value.r : props.ranges[s.key];
      return r ? `${nearest(s, r[0])} – ${nearest(s, r[1])}` : `${s.points[0].text} – ${s.points[s.points.length - 1].text}`;
    };
    const inRange = (s, p) => { const r = drag.value?.key === s.key ? drag.value.r : props.ranges[s.key]; return !r || (p.value >= r[0] && p.value <= r[1]); };
    function toggle(key) { open.value = open.value === key ? null : key; }
    return { W, H, PAD, open, scales, handles, drag, down, move, up, ends, inRange, toggle };
  },
  template: `
    <div class="strips">
      <div v-for="s in strips" :key="s.key" class="strip" :class="{ open: open === s.key, active: ranges[s.key] }">
        <button class="line" :aria-expanded="open === s.key" :title="open === s.key ? 'Fold' : 'Choose a range of ' + s.label.toLowerCase()" @click="toggle(s.key)">
          <span class="name">{{ s.label }}</span> <span class="num">{{ ends(s) }}</span>
        </button>
        <button v-if="ranges[s.key]" class="clear" :aria-label="'Clear the ' + s.label.toLowerCase() + ' range'" @click="$emit('range', s.key, null)">×</button>
        <svg v-if="open === s.key" :viewBox="'0 0 ' + W + ' ' + H" :width="W" :height="H" role="img" :aria-label="s.label + ': ' + s.points.length + ' places from ' + s.points[0].text + ' to ' + s.points[s.points.length - 1].text + '; drag the handles'"
             @pointerdown="down($event, s)" @pointermove="move($event, s)" @pointerup="up($event, s)" @pointercancel="drag = null">
          <line :x1="PAD" :x2="W - PAD" :y1="H / 2" :y2="H / 2" class="axis"/>
          <rect :x="handles(s)[0]" :width="Math.max(0, handles(s)[1] - handles(s)[0])" y="6" :height="H - 12" class="band"/>
          <circle v-for="p in s.points" :key="p.id" :cx="scales[s.key].x(p.value)" :cy="H / 2" r="4.5" :class="{ out: !shown.has(p.id) || !inRange(s, p) }"><title>{{ p.title }}: {{ p.text }}</title></circle>
          <rect v-for="(x, i) in handles(s)" :key="i" :x="x - 3" y="3" width="6" :height="H - 6" rx="2" class="handle"/>
        </svg>
      </div>
    </div>
  `,
};
