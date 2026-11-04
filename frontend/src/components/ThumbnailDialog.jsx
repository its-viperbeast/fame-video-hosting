import { useEffect, useRef, useState } from "react";
import { FileVideo, ImageUp, LoaderCircle } from "lucide-react";
import { toast } from "react-toastify";
import { api, formatBytes } from "../services/api";
import {
  MIN_THUMBNAIL_SIDE,
  THUMBNAIL_TYPES,
  thumbnailFileError,
  thumbnailSizeError,
} from "../services/thumbnail";
import Modal from "./Modal";

export default function ThumbnailDialog({ video, maxSize, onClose, onSaved }) {
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [progress, setProgress] = useState(0),
    [dragging, setDragging] = useState(false);
  const input = useRef(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function choose(selected) {
    if (input.current) input.current.value = "";
    if (!selected) return;
    setError("");
    let message = thumbnailFileError(selected, maxSize);
    if (!message) {
      try {
        const bitmap = await createImageBitmap(selected);
        message = thumbnailSizeError(bitmap);
        bitmap.close();
      } catch {
        message = "This image could not be read. Try a different file.";
      }
    }
    if (message) {
      setError(message);
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function save() {
    setSaving(true);
    setError("");
    setProgress(0);
    try {
      const { video: updated } = await api.replaceThumbnail(video.id, file, setProgress);
      toast.success("Thumbnail updated");
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Change thumbnail"
      className="thumbnail-modal"
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button className="btn secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!file || saving} onClick={save}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <ImageUp size={16} />}
            {saving ? (progress < 100 ? `Uploading ${progress}%` : "Saving…") : "Save thumbnail"}
          </button>
        </>
      }
    >
      <p className="modal-intro">
        Choose a new image for <strong>{video.name}</strong>. It’s saved as a 1920 × 1080 WebP.
        Other shapes get bars at the edges and are never stretched.
      </p>
      <div className="thumbnail-compare">
        <figure>
          <span className="thumbnail-frame">
            {video.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt="Current thumbnail" />
            ) : (
              <FileVideo size={30} />
            )}
          </span>
          <figcaption>Current</figcaption>
        </figure>
        <figure>
          <button
            type="button"
            className={`thumbnail-frame thumbnail-pick ${dragging ? "dragging" : ""}`}
            disabled={saving}
            aria-label={file ? `Replace ${file.name}` : "Choose an image"}
            onClick={() => input.current.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!saving) choose(event.dataTransfer.files[0]);
            }}
          >
            {preview ? (
              <img src={preview} alt="New thumbnail preview" />
            ) : (
              <>
                <ImageUp size={26} />
                <span>Choose or drop an image</span>
              </>
            )}
          </button>
          <figcaption title={file?.name}>{file ? file.name : "New"}</figcaption>
        </figure>
      </div>
      <p className="thumbnail-hint">
        JPEG, PNG, or WebP · Up to {formatBytes(maxSize, 0)} · At least {MIN_THUMBNAIL_SIDE} px on
        each side
      </p>
      <input
        ref={input}
        type="file"
        accept={THUMBNAIL_TYPES.join(",")}
        hidden
        onChange={(event) => choose(event.target.files[0])}
      />
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
