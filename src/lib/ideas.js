// Idea pages (TRIAL): compiled by scripts/build_ideas.py into data/ideas/. An idea is a
// term or a pattern that several places share; its file lists every instance with its
// frames. The index says which features are instances of which idea, for the feature page.

let indexCache = null;

export async function loadIdeaIndex() {
  if (!indexCache) {
    indexCache = fetch('data/ideas/index.json')
      .then((r) => (r.ok ? r.json() : { ideas: [] }))
      .catch(() => ({ ideas: [] }));
  }
  return indexCache;
}

export async function loadIdea(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`No idea is called "${id}"`);
  const r = await fetch(`data/ideas/${id}.json`);
  if (!r.ok) throw new Error(`No idea is called "${id}"`);
  return r.json();
}

// The ideas a feature is an instance of, each with how many other places share it.
export function ideasFor(index, film, feature) {
  const key = `${film}/${feature}`;
  return (index?.ideas ?? [])
    .filter((idea) => idea.members.includes(key))
    .map((idea) => ({ ...idea, otherPlaces: new Set(idea.members.map((m) => m.split('/')[0]).filter((f) => f !== film)).size }))
    .filter((idea) => idea.otherPlaces > 0);
}

export const ideaLink = (id) => `./?idea=${encodeURIComponent(id)}`;
export const featureLink = (film, feature) => `./?property=${encodeURIComponent(film)}#${encodeURIComponent(feature)}`;
export const momentLink = (film, seconds) => `./?property=${encodeURIComponent(film)}&t=${Math.floor(seconds)}`;
