// Questions a reader takes elsewhere. Fieldnotes only reports what a film shows and what
// people say in it; whether something is allowed in the reader's town is a question for
// an assistant that can search current rules. This builds that question from the
// catalogue, so it arrives with the specifics a useful answer needs.
import { formatTime } from './format.js';
import { claimSpeaker, placeOf, placeTitle } from './data.js';
import { placePoint, figures, latitudeText, isSunFeature } from './sun.js';

// The sun's figures for the question, labelled as what they are: geometry from latitude.
function sunFigures({ catalogue, lat }) {
  const p = placePoint(catalogue);
  if (!p) return [];
  const row = (l, half) => figures(l, half).map((r) => `${r.label.toLowerCase()} ${r.figure}${r.note ? ' (' + r.note + ')' : ''}`).join('; ');
  return ['Calculated from latitude, not said in the film (noon on the solstices, plain geometry, no terrain or neighbours):',
    `- At the place, ${latitudeText(p.lat, p.half)}: ${row(p.lat, p.half)}.`,
    ...(lat != null ? [`- Where I am, ${latitudeText(lat)}: ${row(lat, 0)}.`] : [])];
}

// One entry per kind of question. `claimTopic` picks the owner's own statements to quote.
export const TOPICS = {
  law: {
    claimTopic: 'law',
    // What regulators look at: buildings, materials, water, power, land and shared arrangements.
    // Furnishings, food stores and daily life only lengthen the question.
    skipCategories: ['Food', 'Life', 'Climate', 'Cabin', 'Home and light'],
    label: 'Would this be allowed where you live?',
    blurb: 'An assistant that can search current rules can answer for your town; this builds the question for it.',
    opening: (what, where) => `I am thinking about building ${what} in ${where}, and I want to know what the law there says about it.`,
    asks: [
      'Search for the current rules. Do not answer from memory alone; building law changes and differs by municipality.',
      'Go through the elements one by one. For each, say whether it is allowed, needs a permit or approval, is restricted, or is prohibited where I live, and name the code, statute or authority with a link.',
      'Separate what holds across my country or state from what my municipality decides. Where it is a local decision, tell me which office to ask and what to ask them.',
      'Name the likely blockers first, and for each one the usual legal routes around it: size thresholds, exemptions, agricultural or experimental designations, owner-builder provisions, engineered alternatives.',
      'Treat the owner\'s statements above as one person\'s account of another place. Tell me if any of them looks wrong even for their own jurisdiction.',
      'If a fact you need is missing, such as plot size, zoning or whether the land is rural, ask me before guessing.',
    ],
  },
  sun: {
    // The owners' stated orientations, wherever in the place they are; only the features
    // that sun and shade act on.
    claims: (c) => Boolean(c.facing),
    wholePlace: true,
    keep: isSunFeature,
    label: 'Would this orientation work where you live?',
    blurb: 'An assistant can lay these angles against your own site; this builds the question for it.',
    opening: (what, where) => `I am thinking about building ${what} in ${where}, and I want to know whether the way it faces and the way it is shaded would work there.`,
    saidHeading: () => 'What people in the film say about which way it faces:',
    noneLine: () => 'Nobody in the film says which way it faces, and no overhang depth or window height is measured.',
    extra: sunFigures,
    asks: [
      'Find the latitude of where I live and compare its sun with the figures above: how high the noon sun stands at both solstices, and where it rises and sets.',
      'If I am in the other hemisphere, mirror every compass direction the owners give (south becomes north) before comparing.',
      'Tell me which way the main glazing should face where I live, and how deep an overhang over a window of a given height should be, showing the arithmetic.',
      'Say what changes this on a real site: hills, trees, neighbours, the true bearing of the walls, the hours either side of noon, and whether overheating or heat loss is the bigger risk in my climate.',
      'Treat the owners\' statements as one person\'s account of another place: the film measures no overhang depth or window height.',
      'If a fact you need is missing, such as which way my plot faces or slopes, ask me before guessing.',
    ],
  },
};

const sentence = (text) => (text ?? '').trim().replace(/\.$/, '');
const firstSentence = (text) => sentence((text ?? '').split(/(?<=\.)\s/)[0]);

function said(catalogue, claim) {
  const when = claim.at.length ? ` at ${claim.at.map(formatTime).join(', ')}` : '';
  const doubt = claim.doubt ? ` (Transcription doubt: ${sentence(claim.doubt)}.)` : '';
  return `- "${sentence(claim.text)}" (${claimSpeaker(catalogue, claim)}${when})${doubt}`;
}

// The feature with its parts, or for a whole place its headline things grouped by theme.
function elements(catalogue, feature, skip, keep = () => true) {
  if (feature) {
    const parts = catalogue.features.filter((f) => f.part_of === feature.id);
    return [
      `- ${feature.title} (${placeTitle(catalogue, feature.place)}${feature.phase !== 'current' ? ', ' + feature.phase : ''}). ${sentence(feature.description)}.`,
      ...parts.map((f) => `- Part of it: ${f.title}. ${firstSentence(f.description)}.`),
    ];
  }
  const groups = new Map();
  for (const f of catalogue.features.filter((x) => !x.part_of && x.phase !== 'historical' && !skip.includes(x.category) && keep(x))) {
    if (!groups.has(f.theme)) groups.set(f.theme, []);
    groups.get(f.theme).push(f.title + (f.phase !== 'current' ? ` (${f.phase})` : ''));
  }
  return [...groups].map(([theme, titles]) => `- ${theme}: ${titles.join('; ')}.`);
}

export function buildQuestion({ topic, catalogue, feature = null, where = '', lat = null }) {
  const t = TOPICS[topic];
  const there = placeOf(catalogue.source.context);
  // What the harness read at the place, so the answer can weigh the setting against the
  // reader's own: the climate, the hardiness zone, the rain, the height.
  const loc = catalogue.source.context?.location ?? {};
  const setting = [loc.climate?.name, loc.hardiness && `hardiness zone ${loc.hardiness.zone}`, loc.stated?.rainfall ? `${loc.stated.rainfall.value} mm of rain a year by the film's own account` : loc.rainfall && `about ${loc.rainfall.mm_per_year} mm of rain a year`, loc.elevation && `${loc.elevation.m} m above sea level`].filter(Boolean).join(', ');
  const what = feature ? `something like the "${feature.title}" described below` : 'a home like the one described below';
  const about = feature ? new Set([feature.id, ...catalogue.features.filter((f) => f.part_of === feature.id).map((f) => f.id)]) : null;
  const mine = (c) => (t.claims ? t.claims(c) : c.topic === t.claimTopic);
  const claims = (catalogue.claims ?? []).filter((c) => mine(c) && (!about || t.wholePlace || about.has(c.about)));
  // A whole place is introduced by its headline facts; one feature does not need them.
  const headline = feature ? [] : (catalogue.claims ?? []).filter((c) => c.headline && !mine(c));

  const lines = [
    t.opening(what, where.trim() || '[WHERE YOU LIVE: town, region, country]'),
    '',
    `It comes from a filmed tour of ${catalogue.title}, in ${there}${setting ? ` (${setting}, read from the location rather than said in the film)` : ''}. Everything below was shown or said in that film. None of it has been checked, and the rules there are not the rules here.`,
    '',
    feature ? 'What it is:' : 'What the place has:',
    ...elements(catalogue, feature, t.skipCategories ?? [], t.keep),
  ];
  if (feature?.unknown) lines.push('', `What the film does not establish: ${sentence(feature.unknown)}.`);
  if (headline.length) lines.push('', 'About the place as a whole, as stated in the film:', ...headline.map((c) => said(catalogue, c)));
  lines.push('', claims.length ? (t.saidHeading?.(there) ?? `What the owner said about the law in ${there}:`) : (t.noneLine?.() ?? `Nobody in the film says anything about permits or regulation for ${feature ? 'this' : 'this place'}.`));
  lines.push(...claims.map((c) => said(catalogue, c)));
  if (t.extra) lines.push('', ...t.extra({ catalogue, feature, lat }));
  lines.push('', 'What I need from you:', ...t.asks.map((a, i) => `${i + 1}. ${a}`));
  return lines.join('\n');
}

// Assistants that accept a question in the address. Long addresses get cut off, so past
// this length the question travels on the clipboard and the chat opens empty.
const LIMIT = 7000;
export const ASSISTANTS = [
  { name: 'Claude', url: (q) => 'https://claude.ai/new' + (q ? '?q=' + q : '') },
  { name: 'ChatGPT', url: (q) => 'https://chatgpt.com/' + (q ? '?q=' + q : '') },
];
export function assistantLink(assistant, question) {
  const q = encodeURIComponent(question);
  return { href: assistant.url(q.length <= LIMIT ? q : ''), prefilled: q.length <= LIMIT };
}
