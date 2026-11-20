import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Modal from "./Modal";

export default function VideoMetadataDialog({ video, field, onClose, onSaved }) {
  const renaming = field === "name";
  const [value, setValue] = useState(video[field] || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const maxLength = renaming ? 180 : 5000;
  const trimmed = value.trim();
  // A note can be cleared, but a video always needs a name.
  const canSave = trimmed !== (video[field] || "") && !(renaming && !trimmed);

  async function save(event) {
    event.preventDefault();
    if (saving || !canSave) return;
    setSaving(true);
    setError("");
    try {
      const { video: updated } = await api.update(video.id, { [field]: trimmed });
      toast.success(renaming ? "Video renamed" : "Note saved");
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={renaming ? "Rename video" : video.note ? "Edit note" : "Add note"}
      className="w-[min(560px,100%)]"
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brandsolid px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            form="video-metadata-form"
            disabled={saving || !canSave}
          >
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : renaming ? "Save name" : "Save note"}
          </button>
        </>
      }
    >
      <p className="mb-5 text-xs leading-relaxed text-muted wrap-anywhere">
        {renaming ? "Choose a name for your library." : video.name}
      </p>
      <form id="video-metadata-form" onSubmit={save}>
        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="video-metadata-value">
          {renaming ? "Video name" : "Note"}
        </label>
        {renaming ? (
          <input
            id="video-metadata-value"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={maxLength}
            required
            disabled={saving}
            aria-describedby="video-metadata-hint"
          />
        ) : (
          <textarea
            id="video-metadata-value"
            className="min-h-[130px] w-full resize-y rounded-lg border border-line bg-surface px-3 py-3 text-sm leading-relaxed text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={maxLength}
            rows={7}
            placeholder="Add a note about this video…"
            disabled={saving}
            aria-describedby="video-metadata-hint"
          />
        )}
        <p
          className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1.5 text-[11px] text-muted"
          id="video-metadata-hint"
        >
          {renaming ? "Up to 180 characters." : "Clear the text to remove the note."}
          <span>
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </p>
        {error && (
          <p className="mt-2 block text-xs leading-relaxed text-[#d95665]" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
