import { useEffect, useRef } from "react";
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  LoaderCircle,
  RotateCcw,
  X,
  Play,
  FileVideo,
} from "lucide-react";
import { formatBytes } from "../services/api";
import { UNFINISHED } from "../services/uploadQueue";

export default function UploadProgress({ item, onRetry, onRemove, onCancel, onPreview }) {
  const uploading = item.status === "uploading",
    // All bytes are sent; the server is remuxing, creating the thumbnail and storing both.
    processing = item.status === "processing",
    done = item.status === "completed",
    queued = item.status === "queued",
    failed = item.status === "failed",
    cancelled = item.status === "cancelled",
    unfinished = UNFINISHED.includes(item.status);
  const poster = item.video?.thumbnailUrl || item.metadata?.poster;
  const actions = useRef(null),
    refocus = useRef(false);
  // The clicked button disappears, so keep focus in this row on the next action.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    actions.current?.querySelector("button")?.focus();
  }, [item.status]);
  const act = (handler) => () => {
    refocus.current = true;
    handler(item.id);
  };
  const sent = `${formatBytes(item.loaded || 0)} of ${formatBytes(item.file.size)}`;
  return (
    <div
      className={`border-b border-line py-3 last:border-b-0 ${item.status === "cancelled" ? "[&_.upload-thumb]:opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          className="upload-thumb relative grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded bg-brandlight text-[#6293d3]"
          aria-label={`Preview ${item.file.name}`}
          onClick={() => onPreview(item)}
        >
          {poster ? (
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <FileVideo size={22} />
          )}
          <Play size={14} className="absolute right-1 bottom-[3px] text-white" />
        </button>
        <div className="min-w-0 flex-1 basis-40">
          <strong className="block truncate text-xs font-medium" title={item.file.name}>
            {item.file.name}
          </strong>
          <p className="mt-1 text-xs text-muted">
            {uploading ? sent : formatBytes(item.file.size)}{" "}
            <span className="text-muted">· MP4</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-brand max-sm:ml-14">
          {uploading ? (
            <>
              <LoaderCircle className="animate-spin" size={16} />
              Uploading {item.progress}%
            </>
          ) : processing ? (
            <>
              <LoaderCircle className="animate-spin" size={16} />
              Processing
            </>
          ) : done ? (
            <span className="inline-flex items-center gap-1.5 text-[#229b78]">
              <Check size={17} />
              Completed
            </span>
          ) : failed ? (
            <span className="inline-flex items-center gap-1.5 text-[#d95665] dark:text-[#f08591]">
              <CircleAlert size={15} />
              Failed
            </span>
          ) : cancelled ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Ban size={14} />
              Cancelled
            </span>
          ) : queued ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Clock size={14} />
              Queued
            </span>
          ) : (
            <span className="text-muted">Ready</span>
          )}
        </div>
        {!done && (
          <div className="flex shrink-0 items-center gap-2.5 max-sm:ml-auto" ref={actions}>
            {unfinished && (
              <button
                className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-[#d95665]"
                aria-label={`Cancel upload of ${item.file.name}`}
                onClick={act(onCancel)}
              >
                <X size={14} />
                Cancel upload
              </button>
            )}
            {(failed || cancelled) && (
              <button
                className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                aria-label={`Retry upload of ${item.file.name}`}
                onClick={act(onRetry)}
              >
                <RotateCcw size={14} />
                Retry
              </button>
            )}
            {!unfinished && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand"
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onRemove(item.id)}
              >
                <X size={17} />
              </button>
            )}
          </div>
        )}
      </div>
      {uploading && (
        <div
          className="mt-2.5 h-1 w-full overflow-hidden rounded bg-[#e8edf4] dark:bg-line"
          role="progressbar"
          aria-label={`Uploading ${item.file.name}`}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={item.progress}
          aria-valuetext={`${item.progress}%, ${sent}`}
        >
          <span
            className="block h-full bg-brand transition-[width] duration-150"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
      {processing && (
        <>
          <div
            className="mt-2.5 h-1 w-full overflow-hidden rounded bg-[#e8edf4] dark:bg-line"
            role="progressbar"
            aria-label={`Processing ${item.file.name}`}
          >
            <span className="block h-full w-[35%] animate-progress-slide bg-brand" />
          </div>
          <span className="mt-1.5 block text-xs text-muted">
            Upload complete. Preparing playback and thumbnail…
          </span>
        </>
      )}
      {done && item.warning && (
        <span className="mt-1.5 block text-xs leading-relaxed text-[#a8670f] dark:text-[#e2b363]">
          {item.warning}
        </span>
      )}
      {failed && (
        <span className="mt-1.5 block text-xs leading-relaxed text-[#d95665]" role="alert">
          {item.error}
        </span>
      )}
      {cancelled && (
        <span className="mt-1.5 block text-xs text-muted">
          Nothing was saved. Retry to upload it again.
        </span>
      )}
    </div>
  );
}
