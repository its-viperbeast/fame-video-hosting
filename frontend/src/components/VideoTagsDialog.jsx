import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Save, Tags, X } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Modal from "./Modal";

const clean = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const MAX_TAGS = 10;

export default function VideoTagsDialog({ video, onClose, onSaved, onTagClick }) {
  const existing = useMemo(
    () => (Array.isArray(video.tags) ? video.tags.filter((t) => t && t.name) : []),
    [video.tags],
  );
  const [selected, setSelected] = useState(existing);
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    let live = true;
    api
      .listTags()
      .then((data) => {
        if (live) setAllTags(data.tags || []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onDoc = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const query = clean(input);
  const suggestions = useMemo(() => {
    const taken = new Set(selected.map((t) => t.name.toLowerCase()));
    return allTags
      .filter((t) => !taken.has(t.name.toLowerCase()))
      .filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6);
  }, [allTags, selected, query]);

  // Text still in the input counts as a change: it is added on save.
  const canSave =
    Boolean(query) ||
    JSON.stringify(selected.map((t) => t.name.toLowerCase()).sort()) !==
      JSON.stringify(existing.map((t) => t.name.toLowerCase()).sort());

  function addName(raw) {
    const name = clean(raw);
    setError("");
    if (!name) return;
    if (/[/\\]/.test(name) || /[\x00-\x1f\x7f]/.test(name)) {
      setError("Tags can't contain slashes or control characters.");
      return;
    }
    if (name.length > 30) {
      setError("Keep each tag to 30 characters or fewer.");
      return;
    }
    if (selected.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setInput("");
      setOpen(false);
      return;
    }
    if (selected.length >= MAX_TAGS) {
      setError(`Up to ${MAX_TAGS} tags per video.`);
      return;
    }
    const known = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    setSelected((prev) => [...prev, known || { name }]);
    setInput("");
    setOpen(false);
  }

  function removeName(name) {
    setSelected((prev) => prev.filter((t) => t.name.toLowerCase() !== name.toLowerCase()));
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !canSave) return;
    const names = selected.map((t) => t.name);
    if (query && !names.some((name) => name.toLowerCase() === query.toLowerCase())) {
      if (names.length >= MAX_TAGS) return setError(`Up to ${MAX_TAGS} tags per video.`);
      names.push(query);
    }
    setSaving(true);
    setError("");
    try {
      const { video: updated } = await api.update(video.id, { tags: names });
      toast.success(names.length ? "Tags saved" : "Tags cleared");
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={existing.length ? "Edit tags" : "Add tags"}
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
            form="video-tags-form"
            disabled={saving || !canSave}
          >
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : "Save tags"}
          </button>
        </>
      }
    >
      <p className="modal-intro">{video.name}</p>
      <form id="video-tags-form" onSubmit={save}>
        <label className="field-label" htmlFor="video-tags-input">
          Tags
        </label>
        <div className="tag-chip-row" aria-live="polite">
          {selected.length === 0 && <span className="muted">No tags yet — add one below.</span>}
          {selected.map((tag) => (
            <span key={tag.name.toLowerCase()} className="tag-chip">
              <button
                type="button"
                title={tag.id ? `Filter by ${tag.name}` : tag.name}
                onClick={() => tag.id && onTagClick?.(tag)}
              >
                {tag.name}
              </button>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`Remove ${tag.name}`}
                disabled={saving}
                onClick={() => removeName(tag.name)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="tag-input-wrap" ref={boxRef}>
          <Tags size={15} />
          <input
            id="video-tags-input"
            className="form-input tag-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addName(input);
              }
            }}
            placeholder="Type a tag and press Enter…"
            maxLength={30}
            disabled={saving}
            autoComplete="off"
            aria-describedby="video-tags-hint"
          />
          {open && (suggestions.length > 0 || Boolean(query)) && (
            <ul className="tag-suggest" role="listbox" aria-label="Tag suggestions">
              {query &&
                !suggestions.some((t) => t.name.toLowerCase() === query.toLowerCase()) &&
                !selected.some((t) => t.name.toLowerCase() === query.toLowerCase()) && (
                  <li>
                    <button type="button" onMouseDown={() => addName(query)}>
                      <span className="tag-suggest-new">Create</span>“{query}”
                    </button>
                  </li>
                )}
              {suggestions.map((tag) => (
                <li key={tag.id}>
                  <button type="button" onMouseDown={() => addName(tag.name)}>
                    {tag.name}
                    {tag.videoCount > 0 && <span>{tag.videoCount}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="metadata-hint" id="video-tags-hint">
          New names are created automatically on save.
          <span>
            {selected.length} / {MAX_TAGS}
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
