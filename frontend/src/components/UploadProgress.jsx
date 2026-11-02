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
export default function UploadProgress({
  item,
  onRetry,
  onRemove,
  onCancel,
  onPreview,
}) {
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
    <div className={`upload-item is-${item.status}`}>
      <button
        className="upload-preview"
        aria-label={`Preview ${item.file.name}`}
        onClick={() => onPreview(item)}
      >
        {poster ? <img src={poster} alt="" /> : <FileVideo size={22} />}
        <Play size={14} className="tiny-play" />
      </button>
      <div className="upload-item-info">
        <strong title={item.file.name}>{item.file.name}</strong>
        <p>
          {uploading ? sent : formatBytes(item.file.size)} <span>· MP4</span>
        </p>
        {uploading && (
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Uploading ${item.file.name}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={item.progress}
            aria-valuetext={`${item.progress}%, ${sent}`}
          >
            <span style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {processing && (
          <>
            <div
              className="progress-track indeterminate"
              role="progressbar"
              aria-label={`Processing ${item.file.name}`}
            >
              <span />
            </div>
            <span className="upload-note">
              Upload complete. Preparing playback and thumbnail…
            </span>
          </>
        )}
        {done && item.warning && (
          <span className="warning-text">{item.warning}</span>
        )}
        {failed && (
          <span className="error-text" role="alert">
            {item.error}
          </span>
        )}
        {cancelled && (
          <span className="upload-note">
            Nothing was saved. Retry to upload it again.
          </span>
        )}
      </div>
      <div className="upload-item-state">
        {uploading ? (
          <>
            <LoaderCircle className="spin" size={16} />
            Uploading {item.progress}%
          </>
        ) : processing ? (
          <>
            <LoaderCircle className="spin" size={16} />
            Processing
          </>
        ) : done ? (
          <span className="success-text">
            <Check size={17} />
            Completed
          </span>
        ) : failed ? (
          <span className="upload-status-failed">
            <CircleAlert size={15} />
            Failed
          </span>
        ) : cancelled ? (
          <span className="upload-status-muted">
            <Ban size={14} />
            Cancelled
          </span>
        ) : queued ? (
          <span className="upload-status-muted">
            <Clock size={14} />
            Queued
          </span>
        ) : (
          <span className="muted">Ready</span>
        )}
      </div>
      {!done && (
        <div className="upload-item-actions" ref={actions}>
          {unfinished && (
            <button
              className="text-btn upload-cancel"
              aria-label={`Cancel upload of ${item.file.name}`}
              onClick={act(onCancel)}
            >
              <X size={14} />
              Cancel upload
            </button>
          )}
          {(failed || cancelled) && (
            <button
              className="text-btn"
              aria-label={`Retry upload of ${item.file.name}`}
              onClick={act(onRetry)}
            >
              <RotateCcw size={14} />
              Retry
            </button>
          )}
          {!unfinished && (
            <button
              className="icon-btn"
              aria-label={`Remove ${item.file.name}`}
              onClick={() => onRemove(item.id)}
            >
              <X size={17} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
