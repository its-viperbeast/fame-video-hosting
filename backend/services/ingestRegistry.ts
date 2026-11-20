// Server-side uploads handled by this process, keyed by owner and the client's
// upload ID. A closed connection already aborts an upload, but a proxy can keep
// the upstream request open, so an explicit cancel also aborts it here. It also
// rolls back an upload that finished just before the cancel arrived.
type Entry = {
  controller?: AbortController;
  cancelled?: boolean;
  expires?: number;
  videoId?: string;
};

const entries = new Map<string, Entry>();
const KEEP_MS = 5 * 60000;

const keyOf = (owner: string, id: string) => `${owner}\n${id}`;

function prune(now: number) {
  for (const [key, entry] of entries) if (entry.expires && entry.expires < now) entries.delete(key);
}

export function start(owner: string, id: string, controller: AbortController) {
  prune(Date.now());
  const key = keyOf(owner, id);
  if (entries.get(key)?.cancelled) controller.abort();
  else entries.set(key, { controller });
}

// Returns false when the upload was cancelled; the caller must roll it back.
export function finish(owner: string, id: string, controller: AbortController, videoId: string) {
  const key = keyOf(owner, id);
  if (entries.get(key)?.controller !== controller) return false;
  entries.set(key, { videoId, expires: Date.now() + KEEP_MS });
  return true;
}

// Drops an upload that ended without finishing. Cancels and results are kept.
export function settle(owner: string, id: string, controller: AbortController) {
  const key = keyOf(owner, id);
  if (entries.get(key)?.controller === controller) entries.delete(key);
}

// Returns the ID of a video that finished before the cancel arrived, if any.
export function cancel(owner: string, id: string) {
  const now = Date.now();
  prune(now);
  const key = keyOf(owner, id);
  const entry = entries.get(key);
  entries.set(key, { cancelled: true, expires: now + KEEP_MS });
  entry?.controller?.abort();
  return entry?.videoId;
}
