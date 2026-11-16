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
      className="max-w-[580px]"
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!file || saving}
            onClick={save}
          >
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <ImageUp size={16} />}
            {saving ? (progress < 100 ? `Uploading ${progress}%` : "Saving…") : "Save thumbnail"}
          </button>
        </>
      }
    >
      <p className="mb-5 text-xs leading-relaxed text-muted">
        Choose a new image for <strong>{video.name}</strong>. It’s saved as a 1920 × 1080 WebP.
        Other shapes get bars at the edges and are never stretched.
      </p>
      <div className="mt-4.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <figure className="m-0 min-w-0">
          <span className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-line bg-[#0d1622] text-[#7094bf]">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt="Current thumbnail"
                className="block h-full w-full object-contain"
              />
            ) : (
              <FileVideo size={30} />
            )}
          </span>
          <figcaption className="mt-1.5 truncate text-xs whitespace-nowrap text-muted">
            Current
          </figcaption>
        </figure>
        <figure className="m-0 min-w-0">
          <button
            type="button"
            className={`grid aspect-video w-full place-items-center content-center gap-1.5 overflow-hidden rounded-lg border border-dashed bg-brandlight p-0 text-xs text-brand disabled:opacity-50 ${
              preview ? "border-solid bg-[#0d1622]" : ""
            } ${dragging ? "border-brand" : "border-[#b6cff3] dark:border-[#385578]"}`}
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
              <img
                src={preview}
                alt="New thumbnail preview"
                className="block h-full w-full object-contain"
              />
            ) : (
              <>
                <ImageUp size={26} />
                <span>Choose or drop an image</span>
              </>
            )}
          </button>
          <figcaption
            className="mt-1.5 truncate text-xs whitespace-nowrap text-muted"
            title={file?.name}
          >
            {file ? file.name : "New"}
          </figcaption>
        </figure>
      </div>
      <p className="mt-3.5 text-xs text-muted">
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
        <p className="mt-2 block text-xs leading-relaxed text-[#d95665]" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
