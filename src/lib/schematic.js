// Standard schematics drawn from the catalogue's own data (docs/ontology.md, Schematic;
// prompts/schematics.md). A schematic record names features and claims; this file turns
// one into an SVG string the same way for every place, so sheets of one kind compare
// like small multiples. Nothing here invents a figure: every number printed is a claim's
// `quantity`, every solid line is a feature the film showed, every dashed line is one
// it only spoke of, and a dotted one is drawn to hold a place the record does not
// establish. No film time is lettered on a sheet; the provenance sits in a <title> and
// in the element's feature, which the page links to.
//
// Three kinds: `section` (levels stacked bottom to top, with the stated heights and
// links between them), `layers` (a wall or floor build-up, outside to inside, each
// layer at its stated thickness when all are stated), `flow` (water or energy as nodes
// in lanes with arrows). Layout is by rule, not by a solver: stacks and lanes are all
// these kinds need, and a flow of more than three lanes is refused by the checker.

const W = 560;                       // every sheet is drawn in a 560-wide box
const UNIT = { m2: 'm²', ft2: 'ft²', in: 'in', ft: 'ft', m: 'm', cm: 'cm', mm: 'mm', acre: 'acres', ha: 'ha', C: '°C', F: '°F',
               year: 'yr', month: 'mo', week: 'wk', day: 'd', hour: 'h', minute: 'min' };
const TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A claim's figure in the speaker's own unit: "17 ft", "about 3 in", "$25 a month".
export function figure(claim) {
  const q = claim?.quantity;
  if (!q) return null;
  const v = q.value >= 1000 ? q.value.toLocaleString('en') : String(Math.round(q.value * 100) / 100);
  const unit = UNIT[q.unit] ?? q.unit;
  const money = /^[A-Z]{3}$/.test(q.unit) && !UNIT[q.unit];
  const text = money ? `${unit} ${v}` : `${v} ${unit}`;
  return `${q.approx ? 'about ' : ''}${text}${q.per ? ' a ' + q.per : ''}`;
}

// Who said it, for the tooltip: the person's name, or where the words came from.
function speakerOf(catalogue, claim) {
  if (claim.by === 'description') return 'From the video description';
  if (claim.by === 'narrator') return 'The narrator says';
  const p = (catalogue.people ?? []).find((x) => x.id === claim.by);
  return `${p?.name ?? claim.by} says`;
}

const STATUS = { visual_and_spoken: 'seen', visual_only: 'seen', spoken_only: 'said' };
const EVIDENCE = { seen: 'Seen in the film', said: 'Spoken of in the film, not shown', none: 'Not established by the film; drawn to hold a place' };

// Everything the renderer needs to know about one element: its words, its evidence
// kind, and the feature the page can open for it.
function resolve(el, catalogue) {
  const features = new Map((catalogue.features ?? []).map((f) => [f.id, f]));
  const claims = new Map((catalogue.claims ?? []).map((c) => [c.id, c]));
  const f = el.feature ? features.get(el.feature) : null;
  const c = el.claim ? claims.get(el.claim) : null;
  const status = el.established === false ? 'none' : f ? STATUS[f.evidence_status] ?? 'said' : el.status ?? (c ? 'said' : 'none');
  const label = el.label ?? f?.title ?? '';
  const tip = [label, f && f.title !== label ? f.title : null, EVIDENCE[status], c ? `${speakerOf(catalogue, c)}: ${c.text}` : null].filter(Boolean).join('. ');
  return { ...el, label, status, feature: f?.id ?? null, claim: c ?? null, figure: c ? figure(c) : null, tip };
}

// SVG pieces. Classes carry the evidence kind so the stylesheet draws it; the
// attributes carry a plain default so the sheet reads without any stylesheet.
const DASH = { seen: '', said: ' stroke-dasharray="6 4"', none: ' stroke-dasharray="2 3"' };
function text(x, y, s, cls = 'sch-label', extra = '') {
  return `<text x="${x}" y="${y}" class="${cls}"${extra}>${esc(s)}</text>`;
}
function wrap(s, max) {
  const words = String(s).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
function lines(x, y, s, max, cls, lh = 14, anchor = 'start') {
  return wrap(s, max).map((l, i) => text(x, y + i * lh, l, cls, ` text-anchor="${anchor}"`)).join('');
}
// An element group: tooltip, feature link, evidence class.
function group(el, inner, cls = '') {
  const link = el.feature ? ` data-feature="${esc(el.feature)}" role="link" tabindex="0"` : '';
  return `<g class="sch-el ${el.status} ${cls}"${link}><title>${esc(el.tip)}</title>${inner}</g>`;
}
// A dimension line with arrowheads and its figure. `said` dimensions are the only kind:
// a figure is always something somebody said, so the line is thin and the figure is
// what is emphasised.
function dimension(x1, y1, x2, y2, el, side = 'left') {
  const vertical = x1 === x2, under = side === 'under';
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tick = vertical ? `<path d="M${x1 - 4} ${y1}h8M${x2 - 4} ${y2}h8"/>` : `<path d="M${x1} ${y1 - 4}v8M${x2} ${y2 - 4}v8"/>`;
  const pos = vertical ? (side === 'left' ? ` x="${x1 - 6}" y="${my + 4}" text-anchor="end"` : ` x="${x1 + 6}" y="${my + 4}"`) : ` x="${mx}" y="${under ? y1 + 16 : y1 - 6}" text-anchor="middle"`;
  const label = `<text class="sch-figure"${pos}>${esc(el.figure)}</text>`;
  // A dimension's name under its figure; a vertical one wraps so it stays inside the sheet.
  const words = !el.label ? '' : vertical
    ? lines(side === 'left' ? x1 - 6 : x1 + 6, my + 17, el.label, 12, 'sch-dimname', 12, side === 'left' ? 'end' : 'start')
    : `<text class="sch-dimname" x="${mx}" y="${under ? y1 + 29 : y1 + 14}" text-anchor="middle">${esc(el.label)}</text>`;
  return group(el, `<g class="sch-dim"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#sch-a)" marker-end="url(#sch-a)"/>${tick}</g>${label}${words}`, 'dim');
}

// The sheet frame: defs (arrowhead, the hand-drawn wobble), the title, the legend, and
// the unmeasured band at the foot. The band is what keeps a clean vector honest: it
// says in words what the sheet could not draw because the film did not say it.
function sheet(item, body, h, notes, unmeasured, legend) {
  const foot = [];
  const words = unmeasured.length ? `Unmeasured: ${unmeasured.join('; ')}.` : 'Unmeasured: nothing in this sheet is to a surveyed scale.';
  const bandLines = wrap(words, 88);
  const noteLines = notes.flatMap((n) => wrap(n, 76));
  const bandH = 10 + bandLines.length * 14 + (noteLines.length ? noteLines.length * 14 + 4 : 0);
  let y = h + 8;
  foot.push(`<g class="sch-band"><line x1="20" y1="${y}" x2="${W - 20}" y2="${y}"/>`);
  y += 18;
  foot.push(noteLines.map((l, i) => text(20, y + i * 14, l, 'sch-note')).join(''));
  y += noteLines.length ? noteLines.length * 14 + 4 : 0;
  foot.push(bandLines.map((l, i) => text(20, y + i * 14, l, 'sch-unmeasured')).join(''));
  foot.push('</g>');
  const H = h + 8 + bandH + 12;
  return { width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="schematic ${item.kind}" role="img" aria-label="${esc(item.title)}">
<defs><marker id="sch-a" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L7 4L1 7" fill="none" stroke="currentColor" stroke-width="1"/></marker>
<marker id="sch-f" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L7 4L1 7z" fill="currentColor" stroke="none"/></marker>
<filter id="sch-hand" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
${text(20, 26, item.title, 'sch-title')}${text(20, 44, legend, 'sch-legend')}
${body}
${foot.join('')}
</svg>` };
}

// ---- section: levels bottom to top --------------------------------------------------

function section(item, catalogue) {
  const levels = item.levels.map((l) => resolve(l, catalogue));
  const dims = (item.dimensions ?? []).map((d) => resolve(d, catalogue));
  const marks = (item.marks ?? []).map((m) => resolve(m, catalogue));
  const links = (item.links ?? []).map((l) => resolve(l, catalogue));
  const idx = Object.fromEntries(levels.map((l, i) => [l.id, i]));
  const top = 66, left = 150, width = 230, bottom = 66 + 240, total = bottom - top;
  // Heights: a level with a stated height takes its share of a stated whole; the rest
  // share what remains equally. With no whole stated, every level is equal and the
  // sheet says so.
  const whole = dims.find((d) => d.axis === 'y' && d.span?.length === 2 && d.figure && idx[d.span[0]] === 0 && idx[d.span[1]] === levels.length - 1);
  const mm = (q) => q.value * (TO_MM[q.unit] ?? NaN);
  const stated = {};
  if (whole) for (const d of dims) if (d.axis === 'y' && d.span?.length === 1 && d.claim?.quantity && TO_MM[d.claim.quantity.unit]) stated[d.span[0]] = mm(d.claim.quantity) / mm(whole.claim.quantity);
  const known = Object.values(stated).reduce((a, b) => a + b, 0);
  const free = levels.filter((l) => stated[l.id] == null).length;
  const share = levels.map((l) => stated[l.id] ?? Math.max(0.08, (1 - known) / Math.max(free, 1)));
  const sum = share.reduce((a, b) => a + b, 0);
  const ys = []; let y = bottom;
  for (const s of share) { const h = total * s / sum; ys.push([y - h, y]); y -= h; }
  const parts = [];
  parts.push(`<g filter="url(#sch-hand)">`);
  levels.forEach((l, i) => {
    const [y0, y1] = ys[i];
    const floor = `<line x1="${left}" y1="${y1}" x2="${left + width}" y2="${y1}"${i === 0 ? '' : DASH.said}/>`;
    parts.push(group(l, `<rect x="${left}" y="${y0}" width="${width}" height="${y1 - y0}" fill="none" stroke="none"/>${floor}`, 'level'));
  });
  parts.push(`<line x1="${left}" y1="${ys.at(-1)[0]}" x2="${left + width}" y2="${ys.at(-1)[0]}"${DASH.said}/>`);
  parts.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"/><line x1="${left + width}" y1="${top}" x2="${left + width}" y2="${bottom}"${DASH.said}/>`);
  // Marks on the front edge (a window, a door).
  for (const m of marks) {
    const i = idx[m.level]; if (i == null) continue;
    const [y0, y1] = ys[i];
    parts.push(group(m, `<line x1="${left}" y1="${y0 + 6}" x2="${left}" y2="${y1 - 6}" stroke-width="4"${DASH[m.status]}/>`, 'mark'));
  }
  parts.push('</g>');
  levels.forEach((l, i) => {
    const [y0, y1] = ys[i];
    parts.push(group(l, lines(left + 10, (y0 + y1) / 2 + 4, l.label, 30, 'sch-label'), 'level-label'));
  });
  for (const m of marks) {
    const i = idx[m.level]; if (i == null) continue;
    const [y0, y1] = ys[i];
    parts.push(group(m, lines(left - 8, (y0 + y1) / 2 + 4, m.label, 14, 'sch-small', 12, 'end'), 'mark-label'));
  }
  // Links between adjacent levels: a stair as a short zigzag at the back edge.
  for (const k of links) {
    const a = idx[k.from], b = idx[k.to]; if (a == null || b == null) continue;
    const ya = (ys[a][0] + ys[a][1]) / 2, yb = (ys[b][0] + ys[b][1]) / 2, x = left + width + 10;
    const steps = 4, dy = (yb - ya) / steps, dx = 5;
    let d = `M${x} ${ya}`; for (let s = 0; s < steps; s++) d += `h${dx}v${dy}`;
    parts.push(group(k, `<path d="${d}" fill="none"${DASH[k.status]}/>${lines(x + dx * steps + 8, (ya + yb) / 2 + 4, k.label, 18, 'sch-small', 12)}`, 'link'));
  }
  // Dimensions: the whole at far left, single levels next to it, lengths along the foot.
  for (const d of dims) {
    if (!d.figure) continue;
    if (d.axis === 'y' && d.span?.length === 2) parts.push(dimension(left - 60, ys[idx[d.span[1]]][0], left - 60, ys[idx[d.span[0]]][1], d, 'left'));
    else if (d.axis === 'y' && d.span?.length === 1) parts.push(dimension(left - 28, ys[idx[d.span[0]]][0], left - 28, ys[idx[d.span[0]]][1], d, 'left'));
  }
  const xdims = dims.filter((d) => d.axis === 'x' && d.figure);
  let foot = bottom + 26;
  for (const d of xdims) {
    const to = idx[d.to] != null ? left + width : left + width;
    parts.push(dimension(left, foot, to, foot, d));
    parts.push(text(to + 6, foot + 4, 'not to scale', 'sch-small'));
    foot += 30;
  }
  const figs = (item.figures ?? []).map((f) => resolve(f, catalogue)).filter((f) => f.figure);
  figs.forEach((f, i) => parts.push(group(f, `${text(W - 24, top + 10 + i * 46, f.figure, 'sch-figure big', ' text-anchor="end"')}${text(W - 24, top + 25 + i * 46, f.label ?? f.claim.quantity.of, 'sch-small', ' text-anchor="end"')}`, 'fig')));
  const unmeasured = [...(item.not_established ?? [])];
  if (!whole) unmeasured.unshift('no height is stated, so the levels are drawn equal');
  else if (free > 1) unmeasured.unshift('levels without a stated height share the rest equally');
  if (!xdims.length) unmeasured.push('no plan dimension is stated');
  return sheet(item, parts.join('\n'), Math.max(foot, bottom + 10), [], unmeasured, 'solid: seen · dashed: said · figures: as said');
}

// ---- layers: a build-up outside to inside ---------------------------------------------

export function reconcile(layers, through) {
  // The stated layer figures against the stated whole, in the same unit: what a reader
  // would add up on the sheet, so the sheet adds it up for them.
  const q = (l) => l.claim?.quantity;
  if (!through?.claim?.quantity || !layers.every((l) => q(l) && TO_MM[q(l).unit])) return null;
  const unit = q(through).unit;
  if (!TO_MM[unit]) return null;
  const sum = layers.reduce((a, l) => a + q(l).value * TO_MM[q(l).unit], 0) / TO_MM[unit];
  const whole = q(through).value;
  const parts = layers.map((l) => `${Math.round(q(l).value * TO_MM[q(l).unit] / TO_MM[unit] * 100) / 100} ${UNIT[unit] ?? unit}`);
  return { sum: Math.round(sum * 100) / 100, whole, unit: UNIT[unit] ?? unit, parts, agree: Math.abs(sum - whole) < 1e-6 };
}

function layers(item, catalogue) {
  const ls = item.layers.map((l) => resolve(l, catalogue));
  const through = item.through ? resolve(item.through, catalogue) : null;
  const below = item.below ? resolve(item.below, catalogue) : null;
  const top = 96, left = 60, span = 400, h = 150;
  const mm = (l) => (l.claim?.quantity && TO_MM[l.claim.quantity.unit] ? l.claim.quantity.value * TO_MM[l.claim.quantity.unit] : null);
  const scaled = ls.every((l) => mm(l) != null);
  const totalMm = scaled ? Math.max(ls.reduce((a, l) => a + mm(l), 0), through && mm(through) ? mm(through) : 0) : null;
  const widths = scaled ? ls.map((l) => span * mm(l) / totalMm) : ls.map(() => span / ls.length);
  const parts = [];
  parts.push(`<g filter="url(#sch-hand)">`);
  let x = left;
  const xs = [];
  ls.forEach((l, i) => {
    xs.push([x, x + widths[i]]);
    parts.push(group(l, `<rect x="${x}" y="${top}" width="${widths[i]}" height="${h}" fill="none"${DASH[l.status]}/>`, 'layer'));
    x += widths[i];
  });
  const stackEnd = x;
  if (through) {
    const tw = scaled && mm(through) ? span * mm(through) / totalMm : span;
    const ty = top + h * 0.38;
    parts.push(group(through, `<rect x="${left}" y="${ty}" width="${tw}" height="${h * 0.24}" rx="${h * 0.12}" fill="none" stroke-width="1.6"${DASH[through.status]}/>`, 'through'));
    if (scaled && mm(through) && Math.abs(left + tw - stackEnd) > 0.5) {
      const [a, b] = [Math.min(left + tw, stackEnd), Math.max(left + tw, stackEnd)];
      parts.push(`<rect x="${a}" y="${top}" width="${b - a}" height="${h}" fill="none"${DASH.none}/>`);
    }
  }
  if (below) parts.push(group(below, `<rect x="${left}" y="${top + h + 46}" width="${stackEnd - left}" height="28" fill="none"${DASH[below.status]}/>`, 'below'));
  parts.push('</g>');
  parts.push(text(left, top - 34, item.outside ?? 'outside', 'sch-small'));
  parts.push(text(left + span, top - 34, item.inside ?? 'inside', 'sch-small', ' text-anchor="end"'));
  ls.forEach((l, i) => {
    const [a, b] = xs[i];
    parts.push(group(l, lines((a + b) / 2, top + h + (below ? 92 : 52), l.label, Math.max(10, Math.round((b - a) / 6)), 'sch-label', 14, 'middle'), 'layer-label'));
    if (l.figure) parts.push(dimension(a, top - 14, b, top - 14, { ...l, label: null }));
  });
  if (through) {
    const tw = scaled && mm(through) ? span * mm(through) / totalMm : span;
    parts.push(group(through, `${text(left + tw / 2, top + h * 0.5 + 4, through.label, 'sch-label', ' text-anchor="middle"')}`, 'through-label'));
    if (through.figure) parts.push(dimension(left, top + h + 12, left + tw, top + h + 12, { ...through, label: null }, 'under'));
  }
  if (below) parts.push(group(below, text(left + 8, top + h + 64, below.label, 'sch-small'), 'below-label'));
  const notes = [];
  const r = through ? reconcile(ls, through) : null;
  if (r && !r.agree) notes.push(`As said, ${r.parts.join(' + ')} make ${r.sum} ${r.unit}; the whole is said to be ${r.whole} ${r.unit}. The film does not reconcile them.`);
  const unmeasured = [...(item.not_established ?? [])];
  if (!scaled) unmeasured.unshift('not every layer has a stated thickness, so the layers are drawn equal');
  const bottom = top + h + (below ? 104 : 64);
  return sheet(item, parts.join('\n'), bottom, notes, unmeasured, scaled ? 'widths at the stated thicknesses · solid: seen · dashed: said' : 'not to scale · solid: seen · dashed: said');
}

// ---- flow: nodes in lanes, arrows between ---------------------------------------------

export function lanesOf(item) {
  // Lanes are given, or derived: each node's lane is the first lane that names it, else
  // a lane of its own in order of appearance. The checker refuses more than three.
  if (item.lanes?.length) return item.lanes.map((l) => ({ label: l.label ?? '', nodes: l.nodes }));
  return [{ label: '', nodes: item.nodes.map((n) => n.id) }];
}

function flow(item, catalogue) {
  const nodes = Object.fromEntries(item.nodes.map((n) => [n.id, resolve(n, catalogue)]));
  const edges = item.edges.map((e) => resolve(e, catalogue));
  const lanes = lanesOf(item);
  const cols = Math.max(...lanes.map((l) => l.nodes.length));
  const bw = 104, bh = 52, gapX = (W - 60 - cols * bw) / Math.max(cols - 1, 1), laneH = 100, top = 78;
  const pos = {};
  lanes.forEach((lane, r) => lane.nodes.forEach((id, c) => { pos[id] = { x: 40 + c * (bw + Math.min(gapX, 60)), y: top + r * laneH, r, c }; }));
  const parts = [];
  lanes.forEach((lane, r) => { if (lane.label) parts.push(text(20, top + r * laneH - 10, lane.label, 'sch-lane')); });
  parts.push(`<g filter="url(#sch-hand)">`);
  for (const id of Object.keys(pos)) {
    const n = nodes[id]; if (!n) continue;
    const { x, y } = pos[id];
    parts.push(group(n, `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="none" stroke-width="1.4"${DASH[n.status]}/>`, 'node'));
  }
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) continue;
    let d, lx, ly;
    // Along a lane the gap between boxes is narrow, so the arrow's words sit under it.
    if (a.r === b.r) { d = `M${a.x + bw} ${a.y + bh / 2}L${b.x} ${b.y + bh / 2}`; lx = (a.x + bw + b.x) / 2; ly = a.y + bh + 16; }
    else {
      const x1 = a.x + bw / 2, y1 = a.r < b.r ? a.y + bh : a.y, x2 = b.x + bw / 2, y2 = a.r < b.r ? b.y : b.y + bh;
      d = `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`; lx = (x1 + x2) / 2 + 6; ly = (y1 + y2) / 2 + 4;
    }
    parts.push(group(e, `<path d="${d}" fill="none" marker-end="url(#sch-f)"${DASH[e.status]}/>${e.label ? text(lx, ly, e.label, 'sch-small', ' text-anchor="middle"') : ''}`, 'edge'));
  }
  parts.push('</g>');
  for (const id of Object.keys(pos)) {
    const n = nodes[id]; if (!n) continue;
    const { x, y } = pos[id];
    // The words centred in the box; a figure, when the node has one, on a line of its own
    // at the foot of the box, so nothing is printed outside it.
    const ls = wrap(n.label, 16);
    const mid = n.figure ? y + bh / 2 - 3 : y + bh / 2 + 5;
    parts.push(group(n, lines(x + bw / 2, mid - (ls.length - 1) * 6, n.label, 16, 'sch-label', 13, 'middle'), 'node-label'));
    if (n.figure) parts.push(group(n, text(x + bw / 2, y + bh - 6, n.figure, 'sch-figure', ' text-anchor="middle"'), 'node-figure'));
  }
  const unmeasured = [...(item.not_established ?? [])];
  if (!Object.values(nodes).some((n) => n.figure)) unmeasured.unshift('no volume, flow or distance is carried as a figure in the record');
  return sheet(item, parts.join('\n'), top + lanes.length * laneH - 20, [], unmeasured, 'solid: seen · dashed: said · dotted: not established');
}

const KINDS = { section, layers, flow };

// One schematic as SVG, with what it explains (the features it names) so a page can
// list them and a feature page can find the sheets about it.
export function renderSchematic(item, catalogue) {
  const draw = KINDS[item.kind];
  if (!draw) throw new Error(`No schematic kind ${item.kind}`);
  const out = draw(item, catalogue);
  return { ...out, id: item.id, title: item.title, kind: item.kind, features: featuresOf(item) };
}

export function featuresOf(item) {
  const ids = new Set(item.features ?? []);
  for (const key of ['levels', 'links', 'marks', 'dimensions', 'figures', 'layers', 'nodes', 'edges']) for (const el of item[key] ?? []) if (el.feature) ids.add(el.feature);
  for (const key of ['through', 'below']) if (item[key]?.feature) ids.add(item[key].feature);
  return [...ids];
}
