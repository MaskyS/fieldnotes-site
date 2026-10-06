// The transcript as the feature page reads it: which rows to show around a moment, how the
// page turns while the film plays, where the passage may be cut, which line is being said,
// and how a passage falls into paragraphs. Plain functions, so they are tested on every
// film's transcript without a browser (scripts/test_transcript.mjs).
import { parseTimestamp } from './format.js';

// Rows as transcript.json holds them ({time, end, text}) with `seconds` and `end` as numbers.
// A row without an end (an older transcript) is taken to run until the next one starts.
export function readRows(raw) {
  return raw.map((row, i) => ({ ...row, seconds: parseTimestamp(row.time),
    end: parseTimestamp(row.end ?? raw[i + 1]?.time ?? row.time) }));
}

// The window while the film plays. It holds still while the playhead reads through it,
// so the line being heard does not move under the eye, and turns a page when the playhead
// nears its end or leaves it (a seek): the new page opens just before the playhead.
// `shownFrom` is where the passage on the page starts, which may be before the window: a
// click on one of its first lines is a seek inside the page, not off it.
export function followWindow(held, seconds, shownFrom = Infinity) {
  if (held && seconds >= Math.min(held[0], shownFrom) && seconds <= held[1] - 4) return held;
  return [Math.max(0, seconds - 4), seconds + 20];
}

// A place the words may be cut without cutting a thought: before a change of speaker (the
// captions' ">>"), and after a sentence where the captions punctuate, or at a pause where
// they do not. Captions either punctuate (a quarter to two thirds of rows) or never do; where
// they do, a pause inside a sentence is a breath, and machine-translated captions pause
// anywhere in the English sentence, so the sentence is the better break.
export const PAUSE = 1.5;
const punctuation = new WeakMap();
function punctuated(rows) {
  if (!punctuation.has(rows)) punctuation.set(rows, rows.filter((r) => /[.?!…](\s|$)/.test(r.text)).length >= 0.05 * rows.length);
  return punctuation.get(rows);
}
const paused = (rows, i) => !punctuated(rows) && rows[i + 1].seconds - rows[i].end >= PAUSE;
function breakAfter(rows, i) {
  if (i < 0 || i >= rows.length - 1) return true;
  return /^\s*>>/.test(rows[i + 1].text) || (punctuated(rows) ? /[.?!…]["”’)\]]?$/.test(rows[i].text) : paused(rows, i));
}

// Where a sentence or a speaker's turn starts inside a row, as offsets into its text.
const turnsIn = (text) => [...text.matchAll(/[.?!…]["”’)\]]?\s+(?=\S)|\s+(?=>>)/g)].map((m) => m.index + m[0].length);

// The transcript to show for a window: the rows said inside it (a long cue begun before the
// window still counts, so the line being said is never left off a page), each edge moved out (no
// further than `reach` seconds) to the nearest break, which may fall inside a row, so only
// that row's words after (or before) it are shown. With no break in reach the edge falls on
// a break inside the edge row if it has one, else stays where the window put it and is
// marked cut, so the reader sees the cut. `texts` are the rows' words as shown.
export function passageAround(rows, [start, end], reach = 5) {
  let a = rows.findIndex((r) => r.seconds >= start || r.end > start);
  let b = a < 0 ? -1 : rows.findLastIndex((r) => r.seconds <= end);
  if (a < 0 || b < a) return { rows: [], texts: [], opens: [], cutBefore: false, cutAfter: false };
  let head = null, tail = null;
  for (let i = a; head === null; i--) {
    if (breakAfter(rows, i - 1)) { a = i; head = 0; }
    else if (rows[i - 1].seconds < start - reach) head = turnsIn(rows[a].text)[0] ?? -1;
    else if (turnsIn(rows[i - 1].text).length) { a = i - 1; head = turnsIn(rows[a].text).at(-1); }
  }
  for (let j = b; tail === null; j++) {
    if (breakAfter(rows, j)) { b = j; tail = Infinity; }
    else if (rows[j + 1].seconds > end + reach) tail = turnsIn(rows[b].text).at(-1) ?? -1;
    else if (turnsIn(rows[j + 1].text).length) { b = j + 1; tail = turnsIn(rows[b].text)[0]; }
  }
  const shown = rows.slice(a, b + 1);
  if (a === b && tail >= 0 && tail <= Math.max(head, 0)) tail = -1;  // one row, its only break used for the start
  const texts = shown.map((r, k) => r.text.slice(k === 0 ? Math.max(head, 0) : 0, k === shown.length - 1 && tail >= 0 ? tail : Infinity).trim());
  // Where a pause is the break, it also opens a paragraph.
  const opens = shown.map((r, k) => k > 0 && paused(rows, a + k - 1));
  return { rows: shown, texts, opens, cutBefore: head < 0, cutAfter: tail < 0 };
}

// How far the words can be trusted, in one line: the transcript's kind, or when a catalogue
// has no kind, what its free-text note says. The note is prose ("no translated-caption flag
// is present"), so only "machine translation" in it counts as one.
const CAPTIONS = {
  'automatic captions': 'Automatic captions; words may be misheard.',
  'translated captions': 'Machine translation of automatic captions; names and terms may be wrong.',
  'human captions': 'Captions written by the uploader.',
};
export function captionsOf(source) {
  const kind = source?.transcript_kind ?? (/machine[- ]translat/i.test(source?.transcript ?? '') ? 'translated captions' : 'automatic captions');
  return CAPTIONS[kind] ?? null;
}


// The passage as paragraphs, a new one at each change of speaker (">>") and, in captions
// without punctuation, at each pause. Each piece keeps its row: clicking it plays from
// there, and it is marked while said. Subtitles burned into the picture, which the captions
// miss (`source.text_sources`), join in time order as a note over their interval.
export function paragraphsOf(passage, [start, end], textSources = []) {
  const { rows, texts, opens, cutBefore, cutAfter } = passage;
  const items = [];
  rows.forEach((row, k) => texts[k].split(/\s*>>\s*/).forEach((text, n) => {
    if (n > 0 || !items.length || opens[k]) items.push({ pieces: [] });
    if (text.trim()) items.at(-1).pieces.push({ row, text: text.trim() });
  }));
  const said = items.filter((p) => p.pieces.length).map((p) => ({ ...p, at: p.pieces[0].row.seconds }));
  if (said.length) { said[0].cutBefore = cutBefore; said.at(-1).cutAfter = cutAfter; }
  const from = Math.min(start, rows[0]?.seconds ?? Infinity), to = Math.max(end, rows.at(-1)?.end ?? 0);
  const subtitled = textSources.filter((x) => x.kind === 'burned-in subtitles' && x.start < to && x.end > from)
    .map((x) => ({ at: x.start, till: x.end, note: 'The words here are subtitles in the picture; the captions do not carry them.' }));
  return [...said, ...subtitled].sort((a, b) => a.at - b.at);
}

// The row being said: the last on the page to start by the playhead, unless its words
// ended a pause ago (the captions' silence is not marked as speech).
export function currentRow(rows, seconds) {
  const now = rows.findLast((row) => row.seconds <= seconds + 0.25);
  return now && seconds <= now.end + PAUSE ? now : null;
}

// Sound tags ("[Music]") are not speech; they are set apart from the words.
export const soundParts = (text) => text.split(/(\[[^\]]*\])/).filter(Boolean).map((part) => ({ part, sound: /^\[.*\]$/.test(part) }));
