// Small formatting helpers shared by the components.

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(s / 60)).padStart(2, '0');
  const rest = String(s % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function formatTimePrecise(seconds) {
  const hundredths = String(Math.floor(seconds * 100) % 100).padStart(2, '0');
  return `${formatTime(seconds)}.${hundredths}`;
}

// Transcript timestamps arrive as "HH:MM:SS.mmm".
export function parseTimestamp(text) {
  return text.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
}

export function youtubeLink(url, seconds) {
  return `${url}&t=${Math.floor(seconds)}s`;
}

export function youtubeId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') ?? (u.hostname === 'youtu.be' ? u.pathname.slice(1) : null);
  } catch {
    return null;
  }
}
