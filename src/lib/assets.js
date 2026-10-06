// Published builds encode every image in the sizes the pages show (scripts/publish.py)
// and list them in data/assets.json. Served from the working directory there is no such
// file, and every image resolves to its original path.
let published = {};

export async function loadAssets() {
  try {
    const response = await fetch('data/assets.json');
    if (response.ok) published = await response.json();
  } catch { /* working directory: originals */ }
}

// variant: 'full' where the image is the subject, 'thumb' in cards, strips and tiles.
// A published image may exist in one size only; any size beats the unpublished original.
export function img(path, variant = 'full') {
  const entry = published[path];
  return entry?.[variant] ?? entry?.full ?? entry?.thumb ?? path;
}

export const assetsPlugin = { install(app) { app.config.globalProperties.$img = img; } };
