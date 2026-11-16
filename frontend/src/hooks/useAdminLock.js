import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_MS = 30 * 60 * 1000;
const LOCK_KEY = "frame.admin.lock";
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "scroll"];
const LISTENER_OPTIONS = { capture: true, passive: true };

// Returns null when nothing is stored or storage is blocked; unreadable data reads as locked.
function readStoredLock() {
  let raw;
  try {
    raw = localStorage.getItem(LOCK_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function withIdleLock(saved, now) {
  const activityAt = saved?.activityAt;
  if (!Number.isFinite(activityAt)) return { locked: true, activityAt: now };
  return { locked: saved.locked !== false || now - activityAt >= IDLE_MS, activityAt };
}

function saveLock(state) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(state));
  } catch {
    // This tab still keeps the session when storage is blocked.
  }
}

export function clearLock() {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    // Sign-out still drops the token when storage is blocked.
  }
}

export default function useAdminLock(active) {
  const stateRef = useRef(null);
  if (stateRef.current == null) stateRef.current = withIdleLock(readStoredLock(), Date.now());
  const [locked, setLocked] = useState(stateRef.current.locked);
  const timerRef = useRef(0);

  // Another tab may have recorded newer activity, so the idle timer re-reads storage when it fires.
  const sync = useCallback(() => {
    const now = Date.now();
    const current = stateRef.current;
    const next = withIdleLock(readStoredLock() ?? current, now);
    stateRef.current = next;
    if (next.locked && !current.locked) saveLock(next);
    setLocked(next.locked);
    clearTimeout(timerRef.current);
    if (!next.locked) timerRef.current = setTimeout(sync, next.activityAt + IDLE_MS - now);
  }, []);

  const update = useCallback(
    (next) => {
      stateRef.current = next;
      saveLock(next);
      sync();
    },
    [sync],
  );

  useEffect(() => {
    if (!active) return undefined;
    if (readStoredLock() == null) saveLock(stateRef.current);
    sync();

    const onActivity = () => {
      const { locked, activityAt } = stateRef.current;
      const now = Date.now();
      if (locked || now - activityAt < 1000) return;
      // A late timer (sleep, throttled tab) must lock before activity can extend the session.
      if (now - activityAt >= IDLE_MS) sync();
      else update({ locked: false, activityAt: now });
    };
    const onStorage = (event) => {
      if (event.key === LOCK_KEY) sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, LISTENER_OPTIONS);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timerRef.current);
      for (const type of ACTIVITY_EVENTS)
        window.removeEventListener(type, onActivity, LISTENER_OPTIONS);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, sync, update]);

  const unlock = useCallback(() => update({ locked: false, activityAt: Date.now() }), [update]);
  const lock = useCallback(() => update({ ...stateRef.current, locked: true }), [update]);
  return { locked: active && locked, unlock, lock };
}
