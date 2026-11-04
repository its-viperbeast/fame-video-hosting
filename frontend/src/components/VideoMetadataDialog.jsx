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
      className="metadata-modal"
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button className="btn secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="submit"
            form="video-metadata-form"
            disabled={saving || !canSave}
          >
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : renaming ? "Save name" : "Save note"}
          </button>
        </>
      }
    >
      <p className="modal-intro">{renaming ? "Choose a name for your library." : video.name}</p>
      <form id="video-metadata-form" onSubmit={save}>
        <label className="field-label" htmlFor="video-metadata-value">
          {renaming ? "Video name" : "Note"}
        </label>
        {renaming ? (
          <input
            id="video-metadata-value"
            className="form-input"
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
            className="form-input metadata-note-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={maxLength}
            rows={7}
            placeholder="Add a note about this video…"
            disabled={saving}
            aria-describedby="video-metadata-hint"
          />
        )}
        <p className="metadata-hint" id="video-metadata-hint">
          {renaming ? "Up to 180 characters." : "Clear the text to remove the note."}
          <span>
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
