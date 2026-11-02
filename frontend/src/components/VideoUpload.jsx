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
    leaveGuard.current = busy
      ? (proceed) => setPendingLeave(() => proceed)
      : null;
    return () => {
      leaveGuard.current = null;
    };
  }, [busy, leaveGuard]);
  useEffect(() => {
    const scheduler = createUploadQueue({
      upload: api.upload,
      onChange: (id, changes) =>
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
        ),
      onComplete: (item, result) => {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, video: result.video, warning: result.warning }
              : i,
          ),
        );
        if (result.warning)
          toast.warning(`${item.file.name}: ${result.warning}`);
        else toast.success(`${item.file.name} uploaded successfully`);
        uploadedCallback.current?.();
      },
      onError: (item, error) =>
        toast.error(`${item.file.name}: ${error.message}`),
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
      for (const file of Array.from(files).slice(0, 20)) {
        if (
          !/\.mp4$/i.test(file.name) ||
          (file.type && file.type !== "video/mp4")
        ) {
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
            {
              id: crypto.randomUUID(),
              file,
              metadata,
              url,
              status: "ready",
              progress: 0,
            },
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
    setItems((prev) =>
      prev.map((i) => (ids.has(i.id) ? { ...i, batch: next } : i)),
    );
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
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }
  // If the last upload settles while this is open, the choice stays with the
  // user and the wording says nothing will be cancelled.
  const leaveDialog = leaving && (
    <Modal
      title="Leave this page?"
      className="delete-modal leave-modal"
      onClose={stay}
      footer={
        <>
          <button className="btn secondary" data-autofocus onClick={stay}>
            {busy ? "Continue uploading" : "Stay on this page"}
          </button>
          <button
            className={`btn ${busy ? "danger" : "primary"}`}
            onClick={leave}
          >
            {busy ? "Leave and cancel uploads" : "Leave"}
          </button>
        </>
      }
    >
      <div className="delete-icon leave-icon">
        <TriangleAlert size={24} />
      </div>
      {busy ? (
        <>
          <p>
            Uploads are still in progress. Leaving this page will cancel
            unfinished uploads.
          </p>
          <span className="muted">
            {plural(activeCount + processingCount + queuedCount, "upload")} will
            be cancelled. Completed uploads are kept.
          </span>
        </>
      ) : (
        <p>All uploads have finished, so nothing will be cancelled.</p>
      )}
    </Modal>
  );
  if (!open) return leaveDialog || null;
  const pending = items.filter((i) =>
    ["ready", "failed", "cancelled"].includes(i.status),
  );
  const footer = (
    <>
      <span className="upload-privacy">
        <ShieldCheck size={15} />
        Your videos are private by default
      </span>
      <button
        className="btn primary"
        disabled={inspecting || !pending.length}
        onClick={() => upload(pending)}
      >
        {busy && !pending.length ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <CloudUpload size={17} />
        )}{" "}
        {busy && !pending.length
          ? "Uploading…"
          : `${busy ? "Add" : "Upload"}${pending.length ? ` ${pending.length} video${pending.length > 1 ? "s" : ""}` : " videos"}${busy ? " to queue" : ""}`}
      </button>
    </>
  );
  return (
    <>
      <div className="upload-page-layout">
        <section className="upload-page-panel">
          <div className="upload-panel-body">
            <p className="modal-intro">
              Big ideas deserve a little space. Add your videos below.
            </p>
            <div
              className={`modal-dropzone ${dragging ? "dragging" : ""} ${inspecting ? "is-unavailable" : ""}`}
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
                if (event.target === input.current) return;
                if (inspecting) return;
                input.current?.click();
              }}
            >
              <div className="upload-cloud">
                <CloudUpload size={30} />
              </div>
              <h3>Drop your videos here</h3>
              <p>
                or{" "}
                <button
                  className="text-btn"
                  type="button"
                  disabled={inspecting}
                >
                  browse files <ArrowUpRight size={14} />
                </button>{" "}
                from your computer
              </p>
              <span>
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
              <div className="inspecting">
                <LoaderCircle className="spin" size={16} />
                Reading video previews…
              </div>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
            {items.length > 0 && (
              <div className="upload-queue">
                <div className="queue-heading">
                  <span ref={queueHeading} tabIndex={-1}>
                    Upload queue <b>{items.length}</b>
                    {busy && (
                      <span
                        className="queue-activity"
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
                  <span className="queue-actions">
                    {busy && (
                      <button
                        className="text-btn upload-cancel"
                        onClick={() => {
                          cancelAll();
                          // The button disappears; keep focus on the queue.
                          requestAnimationFrame(() =>
                            queueHeading.current?.focus(),
                          );
                        }}
                      >
                        <X size={14} />
                        Cancel all
                      </button>
                    )}
                    {items.some((i) => i.status === "completed") && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          items
                            .filter((i) => i.status === "completed")
                            .forEach((i) => remove(i.id))
                        }
                      >
                        Clear completed
                      </button>
                    )}
                  </span>
                </div>
                {busy && overall.count > 0 && (
                  <div className="upload-overall">
                    <div className="upload-overall-head">
                      <strong>Overall progress</strong>
                      <span>{overall.percent}%</span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label="Overall upload progress"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={overall.percent}
                      aria-valuetext={`${overall.percent}%, ${formatBytes(overall.sent)} of ${formatBytes(overall.total)}`}
                    >
                      <span style={{ width: `${overall.percent}%` }} />
                    </div>
                    <p>
                      {formatBytes(overall.sent)} of{" "}
                      {formatBytes(overall.total)} transferred ·{" "}
                      {overall.completed} of {plural(overall.count, "video")}{" "}
                      completed
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
            <div className="upload-tip">
              <FileVideo size={18} />
              <p>
                Bring your best quality. We’ll keep every detail, just as you
                intended.
              </p>
            </div>
          </div>
          <footer className="upload-panel-footer">{footer}</footer>
        </section>
      </div>
      {preview && (
        <Modal
          title={preview.file.name}
          onClose={() => setPreview(null)}
          className="player-modal"
        >
          <video
            className="local-preview"
            src={preview.url}
            controls
            playsInline
            autoPlay
          />
        </Modal>
      )}
      {leaveDialog}
    </>
  );
}
