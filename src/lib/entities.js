// Entities across films (scripts/build_entities.py, docs/ontology.md, Entity). Only an
// owner-confirmed entity with a page is in data/entities/index.json; the catalogues carry
// the confirmed entity's id on a person, place or link as `entity`, and a place page
// links a name only when the stamp names an entity that has a page.

let indexCache = null;

export async function loadEntityIndex() {
  if (!indexCache) {
    indexCache = fetch('data/entities/index.json')
      .then((r) => (r.ok ? r.json() : { entities: [], places: [] }))
      .catch(() => ({ entities: [], places: [] }));
  }
  return indexCache;
}

export async function loadEntity(id) {
  if (!/^ent-[a-z0-9-]+$/.test(id ?? '')) throw new Error(`Nothing is called "${id}"`);
  const r = await fetch(`data/entities/${id}.json`);
  if (!r.ok) throw new Error(`Nothing is called "${id}"`);
  return r.json();
}

export const entityLink = (id) => `./?entity=${encodeURIComponent(id)}`;

// The entity id a stamp names, when that entity has a page; otherwise null.
export function pageFor(index, id) {
  if (!id || !index) return null;
  return (index.entities ?? []).some((e) => e.id === id) ? entityLink(id) : null;
}

// A place more than one film is about: its entity, and the films' years in upload order.
export function placeOfFilm(index, film) {
  return (index?.places ?? []).find((p) => p.films.some((f) => f.film === film)) ?? null;
}

// "filmed 2014 · 2026" for a card whose place another film is also about, or null.
export function filmedLine(index, film) {
  const place = placeOfFilm(index, film);
  if (!place) return null;
  const years = [...new Set(place.films.map((f) => f.year).filter(Boolean))];
  // Two films in one year would read as one; then the count says it.
  const n = place.films.length;
  const text = years.length < n ? `filmed ${n === 2 ? 'twice' : `${n} times`}, ${years.join(' · ')}` : `filmed ${years.join(' · ')}`;
  return { href: entityLink(place.id), text, films: place.films.map((f) => f.film) };
}

// One card per place: of the films about one place, the first in the list stands for
// it and the others are left out, so a place filmed twice is one card. `idOf` reads a
// list item's film id. A film no place entity groups stays as it is.
export function foldPlaces(list, index, idOf = (p) => p.entry.id) {
  if (!index?.places?.length) return list;
  const seen = new Set();
  return list.filter((item) => {
    const place = placeOfFilm(index, idOf(item));
    if (!place) return true;
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

export const momentLink = (film, seconds) => `./?property=${encodeURIComponent(film)}&t=${Math.floor(seconds)}`;
