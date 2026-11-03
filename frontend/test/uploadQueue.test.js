import { test } from "node:test";
import assert from "node:assert/strict";
import { createUploadQueue, overallProgress } from "../src/services/uploadQueue.js";

const item = (id) => ({ id, file: { name: `${id}.mp4` }, metadata: {} });

const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness(concurrency = 3) {
  const states = new Map();
  const transfers = [];
  const completed = [];
  const failed = [];
  let active = 0;
  let peak = 0;
  const queue = createUploadQueue({
    concurrency,
    upload(file, _metadata, progress, signal) {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) => {
        transfers.push({
          name: file.name,
          progress,
          signal,
          resolve() {
            active--;
            resolve({ name: file.name });
          },
          reject(error) {
            active--;
            reject(error);
          },
        });
      });
    },
    onChange(id, changes) {
      states.set(id, { ...states.get(id), ...changes });
    },
    onComplete(file) {
      completed.push(file.id);
    },
    onError(file, error) {
      failed.push({ id: file.id, message: error.message });
    },
  });
  return { queue, states, transfers, completed, failed, peak: () => peak };
}

test("starts three uploads together, preserves independent progress, and starts waiting files as slots free", async () => {
  const h = harness();
  const files = ["a", "b", "c", "d", "e"].map(item);
  h.queue.enqueue(files);
  h.queue.enqueue(files);
  assert.deepEqual(
    h.transfers.map((t) => t.name),
    ["a.mp4", "b.mp4", "c.mp4"],
  );
  assert.equal(h.states.get("d").status, "queued");
  assert.equal(h.states.get("e").status, "queued");
  h.transfers[1].progress(42);
  assert.equal(h.states.get("b").progress, 42);
  assert.equal(h.states.get("a").progress, 0);

  h.transfers[1].resolve();
  await settle();
  assert.equal(h.transfers[3].name, "d.mp4");
  assert.equal(h.states.get("b").status, "completed");
  h.transfers[0].reject(new Error("Transfer interrupted"));
  await settle();
  assert.equal(h.transfers[4].name, "e.mp4");
  assert.equal(h.states.get("a").status, "failed");
  assert.equal(h.states.get("a").error, "Transfer interrupted");
  h.transfers.slice(2).forEach((t) => t.resolve());
  await settle();
  assert.equal(h.peak(), 3);
  assert.deepEqual(h.completed.sort(), ["b", "c", "d", "e"]);
  assert.deepEqual(h.failed, [{ id: "a", message: "Transfer interrupted" }]);
  h.queue.dispose();
});

test("accepts new files and individual retries while other uploads are running", async () => {
  const h = harness(2);
  h.queue.enqueue([item("a"), item("b")]);
  h.queue.enqueue([item("c")]);
  assert.equal(h.states.get("c").status, "queued");
  h.transfers[0].reject(new Error("Retry this file"));
  await settle();
  assert.equal(h.transfers[2].name, "c.mp4");
  h.queue.enqueue([item("a")]);
  h.queue.enqueue([item("a")]);
  assert.equal(h.states.get("a").status, "queued");
  assert.equal(h.states.get("a").error, "");
  assert.equal(h.transfers.length, 3);
  h.transfers[1].resolve();
  await settle();
  assert.equal(h.transfers[3].name, "a.mp4");
  h.transfers[2].resolve();
  h.transfers[3].resolve();
  await settle();
  assert.equal(h.states.get("a").status, "completed");
  assert.equal(h.peak(), 2);
  assert.deepEqual(h.completed.sort(), ["a", "b", "c"]);
  h.queue.dispose();
});

test("removes queued files safely and aborts active transfers when the uploader is disposed", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a"), item("b"), item("c")]);
  assert.equal(h.queue.remove("a"), false);
  assert.equal(h.queue.remove("b"), true);
  h.transfers[0].resolve();
  await settle();
  assert.deepEqual(
    h.transfers.map((t) => t.name),
    ["a.mp4", "c.mp4"],
  );
  h.queue.enqueue([item("d")]);
  h.queue.dispose();
  assert.equal(h.transfers[1].signal.aborted, true);
  h.transfers[1].progress(99);
  h.transfers[1].reject(new Error("Aborted"));
  await settle();
  h.queue.enqueue([item("e")]);
  assert.equal(h.transfers.length, 2);
  assert.equal(h.states.get("c").progress, 0);
  assert.deepEqual(h.completed, ["a"]);
  assert.deepEqual(h.failed, []);
});

test("shows processing once every byte is sent, until the server confirms", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a")]);
  h.transfers[0].progress(42, 420);
  assert.deepEqual(
    [h.states.get("a").status, h.states.get("a").progress, h.states.get("a").loaded],
    ["uploading", 42, 420],
  );
  h.transfers[0].progress(100);
  assert.equal(h.states.get("a").status, "processing");
  h.transfers[0].resolve();
  await settle();
  assert.equal(h.states.get("a").status, "completed");
});

test("cancelling an active upload aborts it and reports cancelled, not failed", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a"), item("b")]);
  assert.equal(h.queue.cancel("a"), true);
  assert.equal(h.transfers[0].signal.aborted, true);
  assert.equal(h.states.get("a").status, "cancelled");
  h.transfers[0].progress(80);
  h.transfers[0].reject(new Error("canceled"));
  await settle();
  assert.equal(h.states.get("a").status, "cancelled");
  assert.equal(h.states.get("a").progress, 0);
  assert.deepEqual(h.failed, []);
  assert.equal(h.transfers[1].name, "b.mp4");
  assert.equal(h.queue.cancel("missing"), false);
  h.queue.dispose();
});

test("a cancelled queued upload never starts", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a"), item("b"), item("c")]);
  h.queue.cancel("b");
  assert.equal(h.states.get("b").status, "cancelled");
  h.transfers[0].resolve();
  await settle();
  assert.deepEqual(
    h.transfers.map((t) => t.name),
    ["a.mp4", "c.mp4"],
  );
  h.queue.dispose();
});

test("cancel all stops active and queued uploads and keeps completed ones", async () => {
  const h = harness(2);
  h.queue.enqueue(["a", "b", "c", "d"].map(item));
  h.transfers[0].resolve();
  await settle();
  assert.equal(h.transfers[2].name, "c.mp4");
  assert.equal(h.queue.cancelAll(), 3);
  for (const id of ["b", "c", "d"]) assert.equal(h.states.get(id).status, "cancelled");
  assert.ok(h.transfers.slice(1).every((t) => t.signal.aborted));
  h.transfers[1].reject(new Error("canceled"));
  h.transfers[2].reject(new Error("canceled"));
  await settle();
  assert.equal(h.transfers.length, 3);
  assert.equal(h.states.get("a").status, "completed");
  assert.deepEqual(h.completed, ["a"]);
  assert.deepEqual(h.failed, []);
  assert.equal(h.queue.cancelAll(), 0);
  h.queue.dispose();
});

test("a cancelled upload can be retried before its aborted request settles", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a")]);
  h.queue.cancel("a");
  h.queue.enqueue([item("a")]);
  assert.equal(h.states.get("a").status, "queued");
  h.transfers[0].reject(new Error("canceled"));
  await settle();
  assert.equal(h.transfers.length, 2);
  assert.equal(h.states.get("a").status, "uploading");
  assert.equal(h.transfers[1].signal.aborted, false);
  h.transfers[1].resolve();
  await settle();
  assert.equal(h.states.get("a").status, "completed");
  assert.deepEqual(h.failed, []);
});

test("a request that finishes after its cancel still counts as cancelled", async () => {
  const h = harness(1);
  h.queue.enqueue([item("a")]);
  h.queue.cancel("a");
  h.transfers[0].resolve();
  await settle();
  assert.equal(h.states.get("a").status, "cancelled");
  assert.deepEqual(h.completed, []);
});

test("overall progress is weighted by transferred bytes and skips cancelled or failed files", () => {
  const sized = (status, size, loaded) => ({ status, loaded, file: { size } });
  const result = overallProgress([
    sized("completed", 100),
    sized("uploading", 200, 50),
    sized("processing", 300),
    sized("queued", 400),
    sized("cancelled", 500),
    sized("failed", 600),
    sized("ready", 700),
  ]);
  assert.deepEqual(result, {
    total: 1000,
    sent: 450,
    count: 4,
    completed: 1,
    percent: 45,
  });
  assert.equal(overallProgress([]).percent, 0);
  assert.equal(overallProgress([sized("uploading", 100, 999)]).sent, 100);
});
