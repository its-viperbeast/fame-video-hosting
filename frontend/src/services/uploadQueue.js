export const MAX_CONCURRENT_UPLOADS = 3;
// Files in these states keep the upload page busy and can be cancelled.
export const UNFINISHED = ["queued", "uploading", "processing"];

export function createUploadQueue({
  concurrency = MAX_CONCURRENT_UPLOADS,
  upload,
  onChange,
  onComplete,
  onError,
  onCancel,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Upload concurrency must be a positive integer.");
  }

  const pending = [];
  const scheduled = new Map();
  let active = 0;
  let disposed = false;

  function pump() {
    while (!disposed && active < concurrency && pending.length) {
      const task = pending.shift();
      task.controller = new AbortController();
      active++;
      onChange(task.item.id, { status: "uploading", progress: 0, loaded: 0, error: "" });
      void run(task);
    }
  }

  async function run(task) {
    const { item, controller } = task;
    let result;
    let failure;
    try {
      result = await upload(
        item.file,
        item.metadata,
        (progress, loaded = 0) => {
          if (disposed || controller.signal.aborted) return;
          // Every byte is sent; the server prepares the video until it responds.
          onChange(
            item.id,
            progress >= 100
              ? { status: "processing", progress: 100, loaded: item.file.size }
              : { progress, loaded },
          );
        },
        controller.signal,
      );
    } catch (error) {
      failure = error;
    }

    // Release the slot before notifying callers so a retry can be queued immediately.
    // A retry may already have replaced a cancelled task under the same ID.
    if (scheduled.get(item.id) === task) scheduled.delete(item.id);
    active--;
    try {
      // A cancelled upload stays cancelled even if its request had just
      // finished; the upload function asks the server to roll it back.
      if (!disposed && !controller.signal.aborted) {
        if (failure) {
          onChange(item.id, { status: "failed", error: failure.message });
          onError?.(item, failure);
        } else {
          onChange(item.id, { status: "completed", progress: 100 });
          onComplete?.(item, result);
        }
      }
    } finally {
      pump();
    }
  }

  function cancelTask(task) {
    scheduled.delete(task.item.id);
    // An active request frees its slot when the aborted request settles.
    if (task.controller) task.controller.abort();
    else pending.splice(pending.indexOf(task), 1);
    onChange(task.item.id, { status: "cancelled", error: "" });
    onCancel?.(task.item);
  }

  return {
    enqueue(items) {
      if (disposed) return;
      for (const item of items) {
        if (scheduled.has(item.id)) continue;
        const task = { item, controller: null };
        scheduled.set(item.id, task);
        pending.push(task);
        onChange(item.id, { status: "queued", progress: 0, loaded: 0, error: "" });
      }
      pump();
    },
    cancel(id) {
      const task = scheduled.get(id);
      if (!task) return false;
      cancelTask(task);
      return true;
    },
    // Waiting files are cancelled first so none starts while active ones stop.
    cancelAll() {
      const tasks = [...scheduled.values()].sort(
        (a, b) => Number(!!a.controller) - Number(!!b.controller),
      );
      tasks.forEach(cancelTask);
      return tasks.length;
    },
    remove(id) {
      const task = scheduled.get(id);
      if (task?.controller) return false;
      if (task) {
        pending.splice(pending.indexOf(task), 1);
        scheduled.delete(id);
      }
      return true;
    },
    dispose() {
      disposed = true;
      pending.length = 0;
      for (const task of scheduled.values()) task.controller?.abort();
      scheduled.clear();
    },
  };
}

// Byte-weighted progress for one upload run. Cancelled, failed and unqueued
// files are left out, so the total can reach 100%.
export function overallProgress(items) {
  let total = 0;
  let sent = 0;
  let count = 0;
  let completed = 0;
  for (const item of items) {
    if (!["completed", ...UNFINISHED].includes(item.status)) continue;
    const size = item.file.size;
    count++;
    total += size;
    if (item.status === "uploading") sent += Math.min(item.loaded || 0, size);
    else if (item.status !== "queued") sent += size;
    if (item.status === "completed") completed++;
  }
  return { total, sent, count, completed, percent: total ? Math.floor((sent / total) * 100) : 0 };
}
