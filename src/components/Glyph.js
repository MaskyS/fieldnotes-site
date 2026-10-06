// One small line glyph for a kind of home or a Köppen climate class, drawn in the text's
// colour. The home marks are from two icon sets on the same 24-unit grid and 2-unit
// stroke, Lucide (ISC, lucide.dev) and Tabler Icons (MIT, tabler.io/icons), copied here
// so the page has no runtime dependency; a climate is composed from the letters of its
// code (below). Given a title the glyph is an image with that name; without one it is
// decoration beside its label.
import { computed } from 'vue';

const LUCIDE = {
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  building: '<path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/><path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><rect x="4" y="2" width="16" height="20" rx="2"/>',
  bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
};
const TABLER = {
  buildingCommunity: '<path d="M8 9l5 5v7h-5v-4m0 4h-5v-7l5 -5m1 1v-6a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v17h-8"/><path d="M13 7l0 .01"/><path d="M17 7l0 .01"/><path d="M17 11l0 .01"/><path d="M17 15l0 .01"/>',
};

// A mark placed and scaled on the grid, its stroke kept at the grid's 2 units.
const at = (body, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" stroke-width="${(2 / s).toFixed(2)}">${body}</g>`;

// A climate is composed from its Köppen code, so a class the catalogues have not met
// still gets a sensible mark. The sky (top half) is the summer heat, the third letter:
// a hot → sun, b warm → sun behind cloud, c/d cool → cloud; the ground (bottom half) is
// the rain pattern, the second letter: f wet all year → rain, s dry summer → a dry
// horizon over the sea, w dry winter → one shower over the ground, W desert → bare
// ground, S steppe → sparse tufts. Group A is always hot with heavy rain or savanna
// grass; group D is its summer sky beside a winter snowflake; group E is snow over
// tundra or ice.
// Each part is one bold element, since a mark is 17px tall: a sun is a disc with four
// rays, rain is two long drops, snow one six-pointed star.
const SKY = {
  // The sun's rays stop at its sides, so it stands over the ground rather than piercing it.
  sun: '<circle cx="12" cy="8" r="4"/><path d="M12 .5V3M4.5 8H7M17 8h2.5M6.7 2.7l1.75 1.75M17.3 2.7l-1.75 1.75"/>',
  sunCloud: '<path d="M11.6 7.6a3.75 3.75 0 1 1 7.1-.3M15.5 .25v1.5M21 5.75h1.5M19.4 1.9l1.05-1.05M11.6 1.9l-1.05-1.05"/><path d="M13 14.5H6a3.5 3.5 0 0 1-.6-6.95 5 5 0 0 1 9.6-1.2 4.1 4.1 0 0 1-2 8.15z"/>',
  cloud: '<path d="M16.5 14H7a4.5 4.5 0 0 1-.8-8.9 6 6 0 0 1 11.6-1A4.95 4.95 0 0 1 16.5 14z"/>',
  snow: '<path d="M12 1v12M6.8 4l10.4 6M17.2 4L6.8 10"/>',
};
const GROUND = {
  rain: '<path d="M8.5 15.5l-2 7M15.5 15.5l-2 7"/>',
  heavyRain: '<path d="M6.5 15.5l-2.5 7M12.5 15.5l-2.5 7M18.5 15.5l-2.5 7"/>',
  sea: '<path d="M3.5 16h17M3.5 21.5c2.1-2.5 4.2-2.5 6.3 0s4.2 2.5 6.3 0 3.2-1.5 4.4 0"/>',
  shower: '<path d="M13.5 14.5l-2 6M3.5 22.5h17"/>',
  // A dune on the horizon, so a desert is a shape and not a lone line.
  bare: '<path d="M2 22h20M5.5 22c2.5-5.5 10.5-5.5 13 0"/>',
  // Stubble: a ground line with three short blades.
  tufts: '<path d="M2.5 22h19M7 22v-4.5M12 22v-4.5M17 22v-4.5"/>',
  tundra: '<path d="M3 21h18M7.5 21l-1.5-4M12 21l-1.5-4M16.5 21l-1.5-4"/>',
  ice: '<path d="M3 17.5h18M5.5 22h13"/>',
};
// Winter and summer side by side for group D: the sky small at the top left, a
// snowflake at the bottom right, so the two seasons read as a pair, not a stack.
const winter = (sky) => at(sky, -1, -1, 0.72) + '<path d="M16.5 10v13.5M10.65 13.4l11.7 6.7M22.35 13.4l-11.7 6.7"/>';
const HEAT = { a: 'sun', b: 'sunCloud', c: 'cloud', d: 'cloud', h: 'sun', k: 'cloud' };
const RAIN = { f: 'rain', s: 'sea', w: 'shower', m: 'rain', W: 'bare', S: 'tufts', T: 'tundra', F: 'ice' };
export function climateGlyph(code) {
  const [g, m, h] = code ?? '';
  if (!/^[A-E]$/.test(g ?? '')) return null;
  let sky = SKY[HEAT[h]] ?? (g === 'E' ? null : SKY.sun);
  let ground = GROUND[RAIN[m]] ?? GROUND.bare;
  if (g === 'A') { sky = SKY.sun; ground = m === 'w' || m === 's' ? GROUND.tufts : GROUND.heavyRain; }
  if (g === 'D') return winter(sky);
  if (g === 'E') { sky = SKY.snow; ground = m === 'F' ? GROUND.ice : GROUND.tundra; }
  return sky + ground;
}

const GLYPHS = {
  site: LUCIDE.house,
  community: TABLER.buildingCommunity,
  household: `<circle cx="12" cy="12" r="11"/>${at(LUCIDE.house, 5.5, 5.5, 0.54)}`,
  unit: LUCIDE.building,
  vehicle: LUCIDE.bus,
  several: LUCIDE.copy,
};

// A kind of home by its id, or a climate by its Köppen code ("Cfa").
const glyphFor = (kind) => GLYPHS[kind] ?? climateGlyph(kind);

export default {
  name: 'Glyph',
  props: {
    kind: { type: String, required: true },
    title: { type: String, default: null },
  },
  setup(props) {
    return { body: computed(() => glyphFor(props.kind)) };
  },
  template: `
    <svg v-if="body" class="glyph" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :role="title ? 'img' : null" :aria-label="title" :aria-hidden="title ? null : 'true'">
      <title v-if="title">{{ title }}</title>
      <g v-html="body"></g>
    </svg>
  `,
};
