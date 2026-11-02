// Server-side uploads handled by this process, keyed by owner and the client's
// upload ID. A closed connection already aborts an upload, but a proxy can keep
// the upstream request open, so an explicit cancel also aborts it here. It also
// rolls back an upload that finished just before the cancel arrived.
const entries = new Map();
const KEEP_MS = 5 * 60000;
const keyOf = (owner, id) => `${owner}\n${id}`;
function prune(now) {
  for (const [key, entry] of entries)
    if (entry.expires && entry.expires < now) entries.delete(key);
}

export function start(owner, id, controller) {
  prune(Date.now());
  const key = keyOf(owner, id);
  if (entries.get(key)?.cancelled) controller.abort();
  else entries.set(key, { controller });
}

// Returns false when the upload was cancelled; the caller must roll it back.
export function finish(owner, id, controller, videoId) {
  const key = keyOf(owner, id);
  if (entries.get(key)?.controller !== controller) return false;
  entries.set(key, { videoId, expires: Date.now() + KEEP_MS });
  return true;
}

// Drops an upload that ended without finishing. Cancels and results are kept.
export function settle(owner, id, controller) {
  const key = keyOf(owner, id);
  if (entries.get(key)?.controller === controller) entries.delete(key);
}

// Returns the ID of a video that finished before the cancel arrived, if any.
export function cancel(owner, id) {
  const now = Date.now();
  prune(now);
  const key = keyOf(owner, id);
  const entry = entries.get(key);
  entries.set(key, { cancelled: true, expires: now + KEEP_MS });
  entry?.controller?.abort();
  return entry?.videoId;
}
