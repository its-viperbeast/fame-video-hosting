import { useRef, useState, useEffect, useCallback } from "react";
import { useBlocker } from "react-router-dom";
import {
  CloudUpload,
  FileVideo,
  ShieldCheck,
  ArrowUpRight,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { api, inspectVideo, formatBytes } from "../services/api";
import Modal from "./Modal";
import UploadProgress from "./UploadProgress";
import {
  createUploadQueue,
  MAX_CONCURRENT_UPLOADS,
  overallProgress,
  UNFINISHED,
} from "../services/uploadQueue";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function VideoUpload({
  open,
  onUploaded,
  maxSize,
  droppedFiles,
  onDropConsumed,
  leaveGuard,
}) {
  const [items, setItems] = useState([]),
    [dragging, setDragging] = useState(false),
    [inspecting, setInspecting] = useState(false),
    [preview, setPreview] = useState(null),
    // Files started together, plus any added while they run, share one overall bar.
    [batch, setBatch] = useState(0),
    [pendingLeave, setPendingLeave] = useState(null),
    [announcement, setAnnouncement] = useState("");
  const input = useRef(null),
    queue = useRef(null),
    queueHeading = useRef(null),
    uploadedCallback = useRef(onUploaded),
    consumedDrop = useRef(null),
    inspections = useRef(0),
    objectUrls = useRef(new Set());
  uploadedCallback.current = onUploaded;
  const count = (status) => items.filter((i) => i.status === status).length;
  const activeCount = count("uploading"),
    processingCount = count("processing"),
    queuedCount = count("queued");
  const busy = items.some((i) => UNFINISHED.includes(i.status));
  const overall = overallProgress(items.filter((i) => i.batch === batch));
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      busy && currentLocation.pathname !== nextLocation.pathname,
  );
  const leaving = blocker.state === "blocked" || pendingLeave !== null;
  // Refresh, tab close and window close only allow the browser's own prompt.
  useEffect(() => {
    if (!busy) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => {
    if (!leaveGuard) return;
    leaveGuard.current = busy ? (proceed) => setPendingLeave(() => proceed) : null;
    return () => {
      leaveGuard.current = null;
    };
  }, [busy, leaveGuard]);
  useEffect(() => {
    const scheduler = createUploadQueue({
      upload: api.upload,
      onChange: (id, changes) =>
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item))),
      onComplete: (item, result) => {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, video: result.video, warning: result.warning } : i,
          ),
        );
        if (result.warning) toast.warning(`${item.file.name}: ${result.warning}`);
        else toast.success(`${item.file.name} uploaded successfully`);
        uploadedCallback.current?.();
      },
      onError: (item, error) => toast.error(`${item.file.name}: ${error.message}`),
    });
    queue.current = scheduler;
    const urls = objectUrls.current;
    return () => {
      scheduler.dispose();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const addFiles = useCallback(
    async (files) => {
      inspections.current++;
      setInspecting(true);
      const selected = Array.from(files);
      if (selected.length > 20)
        toast.warning(`Only the first 20 of ${selected.length} videos were added.`);
      for (const file of selected.slice(0, 20)) {
        if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== "video/mp4")) {
          toast.error(`${file.name}: please choose an MP4 video.`);
          continue;
        }
        if (file.size > maxSize || file.size < 16) {
          toast.error(
            `${file.name}: file size must be between 16 bytes and ${formatBytes(maxSize)}.`,
          );
          continue;
        }
        try {
          const metadata = await inspectVideo(file);
          const url = URL.createObjectURL(file);
          objectUrls.current.add(url);
          setItems((prev) => [
            ...prev,
            { id: crypto.randomUUID(), file, metadata, url, status: "ready", progress: 0 },
          ]);
        } catch (err) {
          toast.error(err.message);
        }
      }
      inspections.current--;
      setInspecting(inspections.current > 0);
      if (input.current) input.current.value = "";
    },
    [maxSize],
  );
  useEffect(() => {
    if (droppedFiles?.length && consumedDrop.current !== droppedFiles) {
      consumedDrop.current = droppedFiles;
      addFiles(droppedFiles);
      onDropConsumed();
    }
  }, [droppedFiles, addFiles, onDropConsumed]);

  function upload(selected) {
    const next = busy ? batch : batch + 1;
    const ids = new Set(selected.map((i) => i.id));
    setBatch(next);
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, batch: next } : i)));
    queue.current?.enqueue(selected);
  }

  function cancel(id) {
    if (queue.current?.cancel(id)) {
      const item = items.find((i) => i.id === id);
      setAnnouncement(`Upload of ${item?.file.name} cancelled.`);
    }
  }

  function cancelAll() {
    const cancelled = queue.current?.cancelAll() || 0;
    if (cancelled) setAnnouncement(`${plural(cancelled, "upload")} cancelled.`);
    return cancelled;
  }

  // Only these click handlers move the blocker. Router updates arrive as
  // transitions, so an effect could act on a stale blocker and proceed twice.
  function stay() {
    if (blocker.state === "blocked") blocker.reset();
    setPendingLeave(null);
  }

  function leave() {
    cancelAll();
    if (blocker.state === "blocked") blocker.proceed();
    if (pendingLeave) {
      setPendingLeave(null);
      pendingLeave();
    }
  }

  function remove(id) {
    if (queue.current?.remove(id) === false) return;
    const item = items.find((i) => i.id === id);
    if (item) {
      URL.revokeObjectURL(item.url);
      objectUrls.current.delete(item.url);
      // The preview modal plays that same object URL, so close it too.
      if (preview?.id === id) setPreview(null);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // If the last upload settles while this is open, the choice stays with the
  // user and the wording says nothing will be cancelled.
  const leaveDialog = leaving && (
    <Modal
      title="Leave this page?"
      className="max-w-[450px]"
      onClose={stay}
      footer={
        <>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
            data-autofocus
            onClick={stay}
          >
            {busy ? "Continue uploading" : "Stay on this page"}
          </button>
          <button
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white hover:brightness-110 ${
              busy ? "bg-[#df424b]" : "bg-brandsolid shadow-[0_3px_6px_#2877e919]"
            }`}
            onClick={leave}
          >
            {busy ? "Leave and cancel uploads" : "Leave"}
          </button>
        </>
      }
    >
      <div className="mb-4 grid h-13 w-13 place-items-center rounded-full bg-[#fff4e0] text-[#b7791f] dark:bg-[#4a3a1f] dark:text-[#e2b363]">
        <TriangleAlert size={24} />
      </div>
      {busy ? (
        <>
          <p className="mb-3 text-xs leading-loose wrap-anywhere">
            Uploads are still in progress. Leaving this page will cancel unfinished uploads.
          </p>
          <span className="text-xs text-muted">
            {plural(activeCount + processingCount + queuedCount, "upload")} will be cancelled.
            Completed uploads are kept.
          </span>
        </>
      ) : (
        <p className="text-xs leading-loose">
          All uploads have finished, so nothing will be cancelled.
        </p>
      )}
    </Modal>
  );
  if (!open) return leaveDialog || null;
  const pending = items.filter((i) => ["ready", "failed", "cancelled"].includes(i.status));
  const waiting = busy && !pending.length;
  return (
    <>
      <div className="mx-auto w-full max-w-[760px]">
        <section className="rounded-xl border border-line bg-surface shadow-[0_3px_8px_#26395408]">
          <div className="px-5 py-6 sm:px-7">
            <p className="mb-5 text-xs leading-relaxed text-muted">
              Big ideas deserve a little space. Add your videos below.
            </p>
            <div
              className={`cursor-pointer rounded-[10px] border border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-brand bg-[#dbeaff] dark:bg-line"
                  : "border-[#b6cff3] bg-brandlight dark:border-[#385578]"
              } ${inspecting ? "cursor-default" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={(event) => {
                if (event.target !== input.current && !inspecting) input.current?.click();
              }}
            >
              <div className="mx-auto mb-3.5 grid h-15 w-15 place-items-center rounded-[14px] bg-surface text-[#6096e4] shadow-[0_3px_8px_#377ac00a]">
                <CloudUpload size={30} />
              </div>
              <h3 className="font-display m-0 mb-2 text-base font-bold text-heading">
                Drop your videos here
              </h3>
              <p className="text-xs text-muted">
                or{" "}
                <button
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                  type="button"
                  disabled={inspecting}
                >
                  browse files <ArrowUpRight size={14} />
                </button>{" "}
                from your computer
              </p>
              <span className="mt-3 block text-xs leading-relaxed text-muted">
                MP4 format · Up to {formatBytes(maxSize, 0)} per video
                <br />
                Up to {MAX_CONCURRENT_UPLOADS} videos upload at once
              </span>
              <input
                ref={input}
                type="file"
                accept="video/mp4,.mp4"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
            {inspecting && (
              <div className="flex items-center justify-center gap-1.5 p-4 text-xs text-muted">
                <LoaderCircle className="animate-spin" size={16} />
                Reading video previews…
              </div>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
            {items.length > 0 && (
              <div className="mt-6">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    tabIndex={-1}
                    ref={queueHeading}
                    className="rounded focus:outline-2 focus:outline-brand"
                  >
                    Upload queue{" "}
                    <b className="ml-1 rounded bg-brandlight px-1.5 py-0.5 text-xs text-brand">
                      {items.length}
                    </b>
                    {busy && (
                      <span
                        className="ml-2 text-xs leading-relaxed text-muted"
                        role="status"
                        aria-live="polite"
                      >
                        {[
                          activeCount && `${activeCount} uploading`,
                          processingCount && `${processingCount} processing`,
                          queuedCount && `${queuedCount} queued`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-4">
                    {busy && (
                      <button
                        className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-[#d95665]"
                        onClick={() => {
                          cancelAll();
                          // The button disappears; keep focus on the queue.
                          requestAnimationFrame(() => queueHeading.current?.focus());
                        }}
                      >
                        <X size={14} />
                        Cancel all
                      </button>
                    )}
                    {items.some((i) => i.status === "completed") && (
                      <button
                        className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                        onClick={() =>
                          items.filter((i) => i.status === "completed").forEach((i) => remove(i.id))
                        }
                      >
                        Clear completed
                      </button>
                    )}
                  </span>
                </div>
                {busy && overall.count > 0 && (
                  <div className="my-2 rounded-lg border border-line bg-surfacehover px-3.5 py-3">
                    <div className="flex justify-between text-xs">
                      <strong>Overall progress</strong>
                      <span className="font-semibold text-brand">{overall.percent}%</span>
                    </div>
                    <div
                      className="mt-2.5 h-1 overflow-hidden rounded bg-[#e8edf4] dark:bg-line"
                      role="progressbar"
                      aria-label="Overall upload progress"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={overall.percent}
                      aria-valuetext={`${overall.percent}%, ${formatBytes(overall.sent)} of ${formatBytes(overall.total)}`}
                    >
                      <span
                        className="block h-full bg-brand transition-[width] duration-150"
                        style={{ width: `${overall.percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {formatBytes(overall.sent)} of {formatBytes(overall.total)} transferred ·{" "}
                      {overall.completed} of {plural(overall.count, "video")} completed
                    </p>
                  </div>
                )}
                {items.map((item) => (
                  <UploadProgress
                    key={item.id}
                    item={item}
                    onRetry={(id) => upload(items.filter((i) => i.id === id))}
                    onRemove={remove}
                    onCancel={cancel}
                    onPreview={setPreview}
                  />
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center gap-2.5 text-muted">
              <FileVideo size={18} />
              <p className="text-xs leading-relaxed">
                Bring your best quality. We’ll keep every detail, just as you intended.
              </p>
            </div>
          </div>
          <footer className="flex flex-wrap items-center gap-3 rounded-b-xl border-t border-line bg-surfacehover px-5 py-4 sm:px-7">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brandsolid px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full"
              disabled={inspecting || !pending.length}
              onClick={() => upload(pending)}
            >
              {waiting ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <CloudUpload size={17} />
              )}{" "}
              {waiting
                ? "Uploading…"
                : `${busy ? "Add" : "Upload"} ${pending.length ? plural(pending.length, "video") : "videos"}${busy ? " to queue" : ""}`}
            </button>
          </footer>
        </section>
      </div>
      {preview && (
        <Modal title={preview.file.name} onClose={() => setPreview(null)} className="max-w-[870px]">
          <div className="-m-5 sm:-m-6">
            <video
              className="block max-h-[65vh] w-full bg-[#0c1523]"
              src={preview.url}
              controls
              playsInline
              autoPlay
            />
          </div>
        </Modal>
      )}
      {leaveDialog}
    </>
  );
}
