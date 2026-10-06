// The drawing viewer: one sheet large, with pan and zoom, and nothing else. What a
// reader needs to judge a drawing (the frames it was drawn from, the features it
// explains) stands beside it on the page; this is only for reading a dense sheet.
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';

export default {
  name: 'Viewer',
  props: {
    items: { type: Array, required: true },
    index: { type: Number, required: true },
    catalogue: { type: Object, default: null },
  },
  emits: ['close', 'navigate', 'play', 'select'],
  setup(props, { emit }) {
    const item = computed(() => props.items[props.index]);

    // Pan and zoom. scale 0 means "fit".
    const stage = ref(null);
    const scale = ref(0), tx = ref(0), ty = ref(0);
    const natural = ref({ w: 1, h: 1 });
    const fitScale = () => {
      const el = stage.value; if (!el) return 1;
      return Math.min(el.clientWidth / natural.value.w, el.clientHeight / natural.value.h);
    };
    const effective = computed(() => scale.value || fitScale());
    const transform = computed(() => `translate(${tx.value}px, ${ty.value}px) scale(${effective.value})`);
    const onLoad = (e) => { natural.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }; reset(); };
    const reset = () => { scale.value = 0; tx.value = 0; ty.value = 0; };
    const clamp = (s) => Math.min(Math.max(s, fitScale() * 0.5), 6);
    // Stage coordinates: a point on screen, measured from the stage's centre.
    const local = (cx, cy) => {
      const rect = stage.value.getBoundingClientRect();
      return { x: (cx ?? rect.left + rect.width / 2) - rect.left - rect.width / 2, y: (cy ?? rect.top + rect.height / 2) - rect.top - rect.height / 2 };
    };
    const zoomAt = (factor, cx, cy) => {
      if (!stage.value) return;
      const p = local(cx, cy);
      const before = effective.value;
      const after = clamp(before * factor);
      const k = after / before;
      tx.value = p.x - k * (p.x - tx.value); ty.value = p.y - k * (p.y - ty.value);
      scale.value = after;
    };
    const onWheel = (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); };
    const onDblClick = (e) => { if (scale.value && Math.abs(scale.value - fitScale()) < 0.01) zoomAt(2.5 / effective.value * fitScale(), e.clientX, e.clientY); else if (scale.value) reset(); else zoomAt(2.5, e.clientX, e.clientY); };

    // Pointer events cover mouse, pen and touch: one pointer pans, two pinch. A gesture
    // is measured from the moment the number of pointers last changed.
    const pointers = new Map();
    let gesture = null;
    const centroid = () => {
      const pts = [...pointers.values()];
      const c = { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
      const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 1;
      return { ...local(c.x, c.y), dist };
    };
    const startGesture = () => { gesture = pointers.size ? { tx: tx.value, ty: ty.value, scale: effective.value, ...centroid() } : null; };
    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      stage.value.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      startGesture();
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = centroid();
      const k = pointers.size > 1 ? clamp(gesture.scale * now.dist / gesture.dist) / gesture.scale : 1;
      tx.value = now.x - k * (gesture.x - gesture.tx);
      ty.value = now.y - k * (gesture.y - gesture.ty);
      if (k !== 1) scale.value = gesture.scale * k;
    };
    const onUp = (e) => { pointers.delete(e.pointerId); startGesture(); };
    const zoomLabel = computed(() => `${Math.round(effective.value * 100)}%`);

    watch(() => props.index, reset);

    // A dialog: keys work while it is open, focus moves into it and back out on close.
    const closeButton = ref(null);
    let opener = null;
    const onKey = (e) => {
      if (e.key === 'Escape') emit('close');
      if (e.key === 'ArrowRight') emit('navigate', 1);
      if (e.key === 'ArrowLeft') emit('navigate', -1);
    };
    onMounted(async () => {
      window.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      opener = document.activeElement;
      await nextTick();
      closeButton.value?.focus();
    });
    onUnmounted(() => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      opener?.focus?.();
    });

    return { item, stage, transform, onLoad, onWheel, onDblClick, onDown, onMove, onUp, zoomAt, reset, zoomLabel, closeButton, emit };
  },
  template: `
    <div class="viewer" role="dialog" aria-modal="true" :aria-label="item.title" @click.self="emit('close')">
      <div class="viewer-body">
        <div class="viewer-head">
          <h2>{{ item.title }}</h2>
          <button ref="closeButton" class="close" @click="emit('close')" aria-label="Close">×</button>
        </div>
        <div class="stage-wrap">
          <div class="stage-zoom" ref="stage" @wheel="onWheel" @dblclick="onDblClick" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
            <img :src="$img(item.path)" :alt="item.title" :style="{ transform }" draggable="false" @load="onLoad">
          </div>
          <div class="zoom-bar">
            <button @click="emit('navigate', -1)" :disabled="index === 0" aria-label="Previous drawing">‹</button>
            <span class="count">{{ index + 1 }} / {{ items.length }}</span>
            <button @click="emit('navigate', 1)" :disabled="index === items.length - 1" aria-label="Next drawing">›</button>
            <span class="gap"></span>
            <button @click="zoomAt(0.8)" aria-label="Zoom out">−</button>
            <button class="pct" @click="reset" title="Fit to window">{{ zoomLabel }}</button>
            <button @click="zoomAt(1.25)" aria-label="Zoom in">+</button>
            <span class="tip">Scroll to zoom, drag to pan, double-click to reset. Arrow keys change drawing.</span>
          </div>
        </div>
      </div>
    </div>
  `,
};
