// The sun at a place and at the reader's latitude, for the sun and overhang card
// (src/components/SunCard.js). Two layers, kept apart:
//
//   geometry   plain spherical astronomy with the sun's declination fixed at the
//              solstices (±23.44°), no refraction, no equation of time: good to about
//              half a degree, and printed in whole degrees.
//   evidence   what the film itself gives: the claims that state which way a feature
//              faces (`facing`, docs/ontology.md), the sun-related features the camera
//              shows, and what nobody states. The geometry is never presented as the
//              film's: it is calculated from the latitude the location was read at.
//
// Everything here is pure, so scripts/test_sun.mjs checks the same functions the page
// renders. No film time is printed: attribution is in words, provenance in titles.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const DECL = 23.44;

// ---------- geometry ----------
export function noonAltitude(lat, decl) { return 90 - Math.abs(lat - decl); }
// Azimuth of sunrise from north through east; sunset is 360 minus this.
export function sunriseAzimuth(lat, decl) {
  const c = Math.sin(decl * D2R) / Math.cos(lat * D2R);
  if (c >= 1) return 0; if (c <= -1) return 180;
  return Math.acos(c) * R2D;
}
export function dayLength(lat, decl) {
  const c = -Math.tan(lat * D2R) * Math.tan(decl * D2R);
  if (c <= -1) return 24; if (c >= 1) return 0;
  return 2 * Math.acos(c) * R2D / 15;
}
// Altitude and azimuth at hour angle H (degrees, 0 at solar noon, negative before).
export function sunAt(lat, decl, H) {
  const p = lat * D2R, d = decl * D2R, h = H * D2R;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(d) - Math.sin(p) * sinAlt) / (Math.cos(p) * Math.cos(alt));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * R2D;
  if (H > 0) az = 360 - az;
  return { alt: alt * R2D, az };
}
// Hours a day the sun is up and on the poleward side of the east-west line: the direct
// sun a wall facing away from the equator receives.
export function polewardSunHours(lat, decl, step = 1 / 60) {
  const half = dayLength(lat, decl) / 2;
  let hours = 0;
  for (let t = -half; t <= half; t += step) {
    const { az } = sunAt(lat, decl, t * 15);
    if (lat >= 0 ? (az < 90 || az > 270) : (az > 90 && az < 270)) hours += step;
  }
  return hours;
}
// Overhang depth, per unit of window height, that just shades the whole window at noon.
export function depthRatio(alt) { return 1 / Math.tan(alt * D2R); }

// ---------- words ----------
export const hemisphere = (lat) => (lat >= 0 ? 'northern' : 'southern');
export const equatorSide = (lat) => (lat >= 0 ? 'south' : 'north');
export const poleSide = (lat) => (lat >= 0 ? 'north' : 'south');
const summerDecl = (lat) => (lat >= 0 ? DECL : -DECL);
const MONTHS = { summer: ['June', 'December'], winter: ['December', 'June'] };
export const month = (season, lat) => MONTHS[season][lat >= 0 ? 0 : 1];
const whole = (x) => Math.round(x);
// The side of the sky the noon sun stands on, for a declination.
const noonSide = (lat, decl) => (Math.abs(lat - decl) < 0.5 ? 'overhead' : lat > decl ? 'south' : 'north');
// "28° north of east", "due east".
export function fromEastWest(az) {
  const a = az <= 180 ? az : 360 - az, d = Math.abs(a - 90);
  return whole(d) === 0 ? `due ${az <= 180 ? 'east' : 'west'}` : `${whole(d)}° ${a < 90 ? 'north' : 'south'} of ${az <= 180 ? 'east' : 'west'}`;
}
// A compass direction seen from the other hemisphere: south-facing becomes north-facing.
export function mirrored(direction) {
  return direction.replace(/north|south/g, (w) => (w === 'north' ? 'south' : 'north'));
}

// A latitude in whole degrees, or the range a region's point stands for.
export function latitudeText(lat, half = 0) {
  const one = (x) => (whole(x) === 0 ? '0°' : `${Math.abs(whole(x))}° ${x >= 0 ? 'N' : 'S'}`);
  if (half < 0.5) return one(lat);
  const lo = lat - half, hi = lat + half;
  if ((lo >= 0) !== (hi >= 0)) return `${one(lo)} to ${one(hi)}`;
  const [a, b] = [Math.abs(whole(lo)), Math.abs(whole(hi))].sort((x, y) => x - y);
  return a === b ? one(lat) : `${a}–${b}° ${lat >= 0 ? 'N' : 'S'}`;
}
// A figure at one latitude, or its range across the region the point stands for: the
// number varies, the words after it ("° north of east", " × its height") are said once.
function spread(fn, lat, half, fmt) {
  if (half < 0.5) return fmt(fn(lat));
  const a = fmt(fn(lat - half)), b = fmt(fn(lat + half));
  if (a === b) return a;
  const [x, y] = [a, b].map((t) => /^(\d+(?:\.\d+)?)(.*)$/.exec(t));
  if (x && y && x[2] === y[2]) { const [lo, hi] = [x[1], y[1]].sort((m, n) => m - n); return `${lo}–${hi}${x[2]}`; }
  return `${a} to ${b}`;
}
const degreesOf = (fn, lat, half) => {
  if (half < 0.5) return `${whole(fn(lat))}°`;
  const [a, b] = [whole(fn(lat - half)), whole(fn(lat + half))].sort((x, y) => x - y);
  return a === b ? `${a}°` : `${a}–${b}°`;
};

// Where the location was read (scripts/derive.py): the point, and how far it may be off
// when it stands for a region. Null when nothing was derived.
export function placePoint(catalogue) {
  const loc = catalogue?.source?.context?.location ?? {};
  const from = ['climate', 'rainfall', 'hardiness', 'elevation'].map((k) => loc[k]?.derived_from).find((d) => d && Number.isFinite(d.lat));
  if (!from) return null;
  const half = from.extent_km ? from.extent_km / 2 / 111.2 : 0;
  return { lat: from.lat, lon: from.lon, half, stands_for: from.stands_for ?? null, extent_km: from.extent_km ?? null, name: from.matched?.split(',')[0] ?? from.query };
}

// The card's figures at one latitude: each row a figure and a few words under it.
export function figures(lat, half = 0) {
  const sD = summerDecl(lat), wD = -sD, eq = equatorSide(lat);
  const winterUp = noonAltitude(lat + (lat >= 0 ? half : -half), wD) > 0;
  const tropics = Math.abs(lat) < DECL;
  const sideS = noonSide(lat, sD), sideW = noonSide(lat, wD);
  const neverSets = dayLength(lat, sD) >= 24;
  return [
    { key: 'summer', label: 'Noon sun at midsummer', figure: degreesOf((l) => noonAltitude(l, sD), lat, half),
      note: `${month('summer', lat)}, ${sideS === 'overhead' ? 'overhead' : 'to the ' + sideS}` },
    { key: 'winter', label: 'Noon sun at midwinter', figure: winterUp ? degreesOf((l) => noonAltitude(l, wD), lat, half) : 'below the horizon',
      note: `${month('winter', lat)}${winterUp ? ', to the ' + sideW : ''}` },
    { key: 'sunrise', label: 'Sunrise at midsummer', figure: neverSets ? 'never sets' : spread((l) => sunriseAzimuth(l, sD), lat, half, fromEastWest),
      note: neverSets ? '' : `sets ${spread((l) => 360 - sunriseAzimuth(l, sD), lat, half, fromEastWest)}` },
    { key: 'shade', label: 'Overhang that shades a window at midsummer noon',
      figure: tropics ? 'none needed at noon' : spread((l) => depthRatio(noonAltitude(l, sD)), lat, half, (x) => `${(Math.round(x * 100) / 100).toFixed(2)} × its height`),
      note: tropics ? `the noon sun is ${sideS === 'overhead' ? 'overhead' : 'to the ' + sideS} then; east and west sun is what to shade` : `for a ${eq}-facing window` },
  ];
}

// ---------- the reader ----------
// A latitude as a reader types it: "-37.8", "37.8 S", "37.8°S", "37 s". Null otherwise.
export function parseLatitude(text) {
  const m = /^\s*([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NSns])?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] && /s/i.test(m[2])) v = -Math.abs(v);
  return Math.abs(v) <= 66 ? v : null;
}
// A few towns, so a reader who does not know their latitude can type where they are.
export const TOWNS = { Auckland: -36.85, Bogotá: 4.71, Brisbane: -27.47, 'Buenos Aires': -34.6, Cairo: 30.04, 'Cape Town': -33.93, Chicago: 41.88,
  Denver: 39.74, Edinburgh: 55.95, Jakarta: -6.2, Johannesburg: -26.2, Lagos: 6.5, Lisbon: 38.72, London: 51.51, 'Los Angeles': 34.05,
  Madrid: 40.42, Melbourne: -37.81, 'Mexico City': 19.43, Montreal: 45.5, Mumbai: 19.08, Nairobi: -1.29, 'New York': 40.71, Paris: 48.86,
  Perth: -31.95, Reykjavík: 64.15, Santiago: -33.45, 'São Paulo': -23.55, Seattle: 47.61, Singapore: 1.35, Stockholm: 59.33,
  Sydney: -33.87, Tokyo: 35.68, Toronto: 43.65, Vancouver: 49.28, Wellington: -41.29 };
// What the reader typed, as a latitude and a label: a town from the list or a latitude.
export function readerFrom(text) {
  const t = String(text ?? '').trim();
  const town = Object.keys(TOWNS).find((k) => k.toLowerCase() === t.toLowerCase());
  if (town) return { lat: TOWNS[town], where: town };
  const lat = parseLatitude(t);
  return lat == null ? null : { lat, where: '' };
}
// The reader's latitude lives in the address (?lat=, ?where=), so a view is a page the
// reader can send. Null when the address has none.
export function readerFromSearch(search) {
  const q = new URLSearchParams(search);
  const lat = parseLatitude(q.get('lat'));
  return lat == null ? null : { lat, where: (q.get('where') ?? '').trim() };
}
export function searchWithReader(search, reader) {
  const q = new URLSearchParams(search);
  q.delete('lat'); q.delete('where');
  if (reader) {
    q.set('lat', String(Math.round(reader.lat * 10) / 10));
    if (reader.where) q.set('where', reader.where);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ---------- what the film gives ----------
export const SUN_TERMS = ['porch', 'shading', 'overhang', 'eave', 'glazing', 'skylight', 'passive solar'];
export const isSunFeature = (f) => (f?.terms ?? []).some((t) => SUN_TERMS.includes(t));
const speaker = (catalogue, c) => (c.by === 'description' ? 'The video description' : c.by === 'narrator' ? 'A voice in the film' : (catalogue.people ?? []).find((p) => p.id === c.by)?.name ?? c.by);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// The claims that say which way something faces, the ones about `featureId` first.
export function facingClaims(catalogue, featureId = null) {
  const titles = new Map((catalogue.features ?? []).map((f) => [f.id, f.title]));
  return (catalogue.claims ?? []).filter((c) => c.facing)
    .map((c) => ({ id: c.id, facing: c.facing, text: c.text, who: speaker(catalogue, c), feature: c.about ?? null,
      thing: c.about ? titles.get(c.about) ?? c.about : 'The site',
      title: `${speaker(catalogue, c)}${c.at?.length ? ', at ' + clock(c.at[0]) : ''}${c.about ? '; ' + (titles.get(c.about) ?? c.about) : ''}` }))
    .sort((a, b) => (b.feature === featureId) - (a.feature === featureId));
}

// The film's evidence about sun and shade, as three kinds that read as three things:
// said (a stated orientation), seen (sun-related features the camera shows), and what
// nobody establishes. On a feature page the feature's own evidence comes first.
export function filmGives(catalogue, featureId = null) {
  const out = [];
  // A claim that already opens with its speaker ("Beth describes…") is not prefixed again.
  const named = (c) => [c.who, c.who.split(' ')[0]].some((n) => n && c.text.startsWith(n + ' '));
  for (const c of facingClaims(catalogue, featureId)) out.push({ kind: 'said', who: named(c) ? '' : `${c.who}:`, text: c.text, feature: c.feature, thing: c.thing, title: c.title });
  const sunFeatures = (catalogue.features ?? []).filter((f) => isSunFeature(f) && f.evidence_status !== 'spoken_only');
  const seen = [...sunFeatures].sort((a, b) => (b.id === featureId) - (a.id === featureId));
  if (seen.length) out.push({ kind: 'seen', text: 'In the frames, never measured:', features: seen.slice(0, 6).map((f) => ({ id: f.id, title: f.title })), more: Math.max(0, seen.length - 6) });
  const measured = (terms) => (catalogue.claims ?? []).some((c) => c.quantity && ['length', 'component area'].includes(c.quantity.of)
    && (catalogue.features ?? []).some((f) => f.id === c.about && (f.terms ?? []).some((t) => terms.includes(t))));
  const missing = [];
  if (!out.some((x) => x.kind === 'said')) missing.push('which way it faces');
  if (!measured(['overhang', 'shading', 'porch', 'eave'])) missing.push('the depth of any overhang or porch roof');
  if (!measured(['glazing', 'window', 'skylight'])) missing.push('the height of any window');
  if (missing.length) out.push({ kind: 'none', text: `Nobody states ${missing.join(', ').replace(/, ([^,]*)$/, ' or $1')}.` });
  return out;
}

// ---------- drawings ----------
// Ink only, in the schematics' manner (src/schematic.css): midsummer is a solid line,
// midwinter a dashed one; nothing is coloured to tell them apart.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const txt = (x, y, s, cls = 'sun-label', anchor = 'start') => `<text x="${n1(x)}" y="${n1(y)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;

// A section through a window in a wall facing the equator, with the overhang that just
// shades it at midsummer noon and the two solstice noon rays through the overhang's tip.
export function sectionSVG(lat, title) {
  const W = 400, H = 300, wallX = 250, top = 58, head = 112, sill = 186, ground = 236, win = sill - head, maxD = 200;
  const sD = summerDecl(lat), altS = noonAltitude(lat, sD), altW = noonAltitude(lat, -sD);
  const sunBehind = Math.abs(lat) < DECL;            // the midsummer noon sun stands over the other side
  const ratio = sunBehind ? 0 : depthRatio(altS);
  const D = Math.min(ratio * win, maxD), capped = ratio * win > maxD, tipX = wallX - D;
  const ray = (alt, end) => {
    const t = Math.tan(alt * D2R);
    const x0 = Math.max(12, tipX - (head - top) / t), y0 = head - (tipX - x0) * t;
    return `M${n1(x0)} ${n1(y0)}L${n1(tipX)} ${head}L${n1(end[0])} ${n1(end[1])}`;
  };
  let summer = '', winter = '';
  if (!sunBehind && altS > 0) summer = `<path class="sun-ray summer" d="${ray(altS, [wallX, Math.min(sill, head + D * Math.tan(altS * D2R))])}"/>`;
  let reach = null;
  if (altW > 0) {
    const t = Math.tan(altW * D2R), fx = tipX + (ground - head) / t;   // where the ray meets the floor line
    const end = fx <= W - 8 ? [fx, ground] : [W - 8, head + (W - 8 - tipX) * t];
    if (head + D * t < sill) reach = Math.max(0, (fx - wallX) / win);
    winter = `<path class="sun-ray winter" d="${ray(altW, end)}"/>`;
  }
  const side = equatorSide(lat);
  // Labels sit where no ray passes: under the overhang outside the tip, and outside the
  // wall below the sill; the rays come in above the overhang and leave below it inside.
  const label = sunBehind ? ['no overhang', 'needed at noon'] : ['overhang', `${capped ? 'over ' : ''}${(Math.round(ratio * 100) / 100).toFixed(2)} × window height`];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="sun-sheet section" role="img" aria-label="${esc(`Section at ${latitudeText(lat)}: overhang and window with the noon sun at both solstices`)}">
${txt(16, 24, title, 'sun-title')}
${txt(16, 42, `sun from the ${side} →`, 'sun-small')}${txt(W - 16, 42, 'inside', 'sun-small', 'end')}
<line class="sun-ground" x1="8" y1="${ground}" x2="${W - 8}" y2="${ground}"/>
<rect class="sun-wall" x="${wallX}" y="${top}" width="12" height="${head - top}"/><rect class="sun-wall" x="${wallX}" y="${sill}" width="12" height="${ground - sill}"/>
<line class="sun-glass" x1="${wallX + 6}" y1="${head}" x2="${wallX + 6}" y2="${sill}"/>
${D > 0.5 ? `<line class="sun-overhang" x1="${n1(tipX)}" y1="${head}" x2="${wallX + 12}" y2="${head}"/>` : ''}
${summer}${winter}
${txt(tipX - 8, head + 18, label[0], 'sun-label', 'end')}${txt(tipX - 8, head + 34, label[1], 'sun-label', 'end')}
${txt(wallX - 8, sill + 18, 'window', 'sun-small', 'end')}${txt(wallX - 8, sill + 32, 'height 1', 'sun-small', 'end')}
<line class="sun-key summer" x1="16" y1="${H - 38}" x2="44" y2="${H - 38}"/>${txt(52, H - 34, altS > 0 ? `midsummer noon, ${whole(altS)}°${sunBehind ? ` from the ${poleSide(lat)}, behind this wall` : ', window shaded'}` : 'midsummer noon: sun below the horizon')}
<line class="sun-key winter" x1="16" y1="${H - 18}" x2="44" y2="${H - 18}"/>${txt(52, H - 14, altW > 0 ? `midwinter noon, ${whole(altW)}°${reach != null ? `, reaches ${n1(reach)} window heights in` : ''}` : 'midwinter noon: sun below the horizon')}
</svg>`;
}

// The sky from above, north up: the horizon ring, the two solstice paths, sunrise and
// sunset, the half of the sky away from the equator in a faint tint, and the stated
// facing as an arrow from the house when the film gives one.
export function planSVG(lat, title, facing = null) {
  const W = 400, H = facing ? 418 : 400, R = 120, cx = 200, cy = 190, sD = summerDecl(lat);
  const pt = (alt, az) => { const r = R * (90 - alt) / 90, a = (az - 90) * D2R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (d) => {
    const half = dayLength(lat, d) / 2;
    if (half <= 0) return '';
    const pts = [];
    for (let i = 0; i <= 72; i++) { const s = sunAt(lat, d, (-half + (2 * half * i) / 72) * 15); if (s.alt >= -0.01) pts.push(pt(Math.max(0, s.alt), s.az).map(n1).join(' ')); }
    return pts.length ? 'M' + pts.join('L') : '';
  };
  const poleward = lat >= 0 ? `M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}Z` : `M${cx + R} ${cy}A${R} ${R} 0 0 1 ${cx - R} ${cy}Z`;
  const dots = (d) => (dayLength(lat, d) > 0 && dayLength(lat, d) < 24 ? [sunriseAzimuth(lat, d), 360 - sunriseAzimuth(lat, d)].map((az) => { const [x, y] = pt(0, az); return `<circle class="sun-dot" cx="${n1(x)}" cy="${n1(y)}" r="3"/>`; }).join('') : '');
  const BEARING = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 };
  let arrow = '';
  if (facing && facing in BEARING) {
    const a = (BEARING[facing] - 90) * D2R, x2 = cx + 58 * Math.cos(a), y2 = cy + 58 * Math.sin(a);
    arrow = `<line class="sun-facing" x1="${cx}" y1="${cy}" x2="${n1(x2)}" y2="${n1(y2)}" marker-end="url(#sun-arrow)"/>`;
  }
  const hours = polewardSunHours(lat, sD);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="sun-sheet plan" role="img" aria-label="${esc(`Sun paths at ${latitudeText(lat)}, north up`)}">
<defs><marker id="sun-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L7 4L1 7z" fill="currentColor" stroke="none"/></marker></defs>
${txt(16, 24, title, 'sun-title')}
<path class="sun-sector" d="${poleward}"/>
<circle class="sun-ring" cx="${cx}" cy="${cy}" r="${R}"/><circle class="sun-ring faint" cx="${cx}" cy="${cy}" r="${R * 2 / 3}"/><circle class="sun-ring faint" cx="${cx}" cy="${cy}" r="${R / 3}"/>
<line class="sun-ring faint" x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}"/><line class="sun-ring faint" x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}"/>
${txt(cx, cy - R - 8, 'N', 'sun-label', 'middle')}${txt(cx, cy + R + 18, 'S', 'sun-label', 'middle')}${txt(cx + R + 8, cy + 5, 'E', 'sun-label')}${txt(cx - R - 8, cy + 5, 'W', 'sun-label', 'end')}
<rect class="sun-house" x="${cx - 14}" y="${cy - 14}" width="28" height="28"/>
<path class="sun-ray summer" d="${arc(sD)}"/><path class="sun-ray winter" d="${arc(-sD)}"/>${dots(sD)}${dots(-sD)}
${arrow}
<line class="sun-key summer" x1="16" y1="${H - (facing ? 68 : 50)}" x2="44" y2="${H - (facing ? 68 : 50)}"/>${txt(52, H - (facing ? 64 : 46), dayLength(lat, sD) >= 24 ? 'midsummer: never sets' : `midsummer: rises ${fromEastWest(sunriseAzimuth(lat, sD))}`)}
<line class="sun-key winter" x1="16" y1="${H - (facing ? 50 : 32)}" x2="44" y2="${H - (facing ? 50 : 32)}"/>${txt(52, H - (facing ? 46 : 28), dayLength(lat, -sD) <= 0 ? 'midwinter: never rises' : `midwinter: rises ${fromEastWest(sunriseAzimuth(lat, -sD))}`)}
${txt(16, H - (facing ? 28 : 10), `tinted: sun on a ${poleSide(lat)}-facing wall, about ${whole(hours)} h at midsummer`, 'sun-small')}${facing ? txt(16, H - 10, `arrow: faces ${facing}, as said in the film`, 'sun-small') : ''}
</svg>`;
}

// ---------- the card ----------
// One line for the place page: who says which way it faces.
function saidLine(facings) {
  if (!facings.length) return null;
  const who = [...new Set(facings.map((f) => f.who))], ways = [...new Set(facings.map((f) => f.facing))];
  const and = (xs) => xs.join(' and ');
  return ways.length === 1 ? `${and(who)} ${who.length > 1 ? 'say' : 'says'} it faces ${ways[0]}` : `${and(who)} ${who.length > 1 ? 'name' : 'names'} ${and(ways)} for different parts of it`;
}

// Everything the card shows, as words and drawings, for one catalogue and (optionally)
// the reader. Null when no latitude was derived for the place.
export function sunCard(catalogue, { featureId = null, reader = null } = {}) {
  const point = placePoint(catalogue);
  if (!point) return null;
  const { lat, half } = point;
  const placeName = catalogue.title ?? 'This place';
  const range = half >= 0.5 ? `The location was read at the centre of ${point.name}, a ${point.stands_for ?? 'region'} about ${Math.round(point.extent_km / 10) * 10} km across, so the place lies somewhere in ${latitudeText(lat, half)}.` : null;
  const facings = facingClaims(catalogue, featureId);
  const firstFacing = facings.find((f) => f.feature === featureId) ?? facings[0] ?? null;
  const here = figures(lat, half), there = reader ? figures(reader.lat, 0) : null;
  const rows = here.map((r, i) => ({ key: r.key, label: r.label, place: r, you: there?.[i] ?? null }));
  let mirror = null;
  if (reader && hemisphere(lat) !== hemisphere(reader.lat)) {
    const eqP = equatorSide(lat), eqY = equatorSide(reader.lat);
    const ways = [...new Set(facings.map((f) => f.facing))];
    const one = ways.length === 1 && mirrored(ways[0]) !== ways[0] ? ways[0] : null;
    mirror = `Mirror it. This place is in the ${hemisphere(lat)} hemisphere and you are in the ${hemisphere(reader.lat)}: its noon sun stands to the ${eqP}, yours to the ${eqY}. Where the film says ${eqP}, read ${eqY}`
      + (one ? `: what faces ${one} there would face ${mirrored(one)} where you are.` : '.');
  }
  const summary = {
    said: saidLine(facings),
    noon: `At ${latitudeText(lat, half)} the noon sun stands ${here[0].figure} high at midsummer and ${here[1].figure === 'below the horizon' ? 'below the horizon' : here[1].figure + ' high'} at midwinter.`,
  };
  const short = (catalogue.title ?? '').split(/[,’']/)[0].trim() || 'This place';
  return {
    lat, half, latitude: latitudeText(lat, half), range, placeName,
    reader: reader ? { ...reader, latitude: latitudeText(reader.lat) } : null,
    rows, mirror, summary, facings,
    gives: filmGives(catalogue, featureId),
    calculated: 'Calculated from latitude, not said in the film.',
    caveat: 'Plain geometry at noon on the solstices. Hills, trees, neighbours, the true bearing of a wall and the hours either side of noon all change it: a rule of thumb to take to a designer, not a dimension.',
    sections: { place: sectionSVG(lat, `${short}, ${latitudeText(lat)}`), you: reader ? sectionSVG(reader.lat, `${reader.where || 'You'}, ${latitudeText(reader.lat)}`) : null },
    plans: { place: planSVG(lat, `${short}, ${latitudeText(lat)}`, firstFacing?.facing ?? null), you: reader ? planSVG(reader.lat, `${reader.where || 'You'}, ${latitudeText(reader.lat)}`) : null },
  };
}

// The words a reader sees on the card, drawings included, for checks such as "no film
// time is printed". Titles (tooltips) are left out: they are provenance, not text.
export function cardText(card) {
  if (!card) return '';
  const svgText = (svg) => [...(svg ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ');
  return [card.latitude, card.range, card.reader?.latitude, card.reader?.where, card.mirror, card.summary.said, card.summary.noon,
    ...card.rows.flatMap((r) => [r.label, r.place.figure, r.place.note, r.you?.figure, r.you?.note]),
    ...card.gives.flatMap((g) => [g.who, g.text, g.thing, ...(g.features ?? []).map((f) => f.title)]),
    card.calculated, card.caveat, ...Object.values(card.sections).map(svgText), ...Object.values(card.plans).map(svgText)].filter(Boolean).join('\n');
}
