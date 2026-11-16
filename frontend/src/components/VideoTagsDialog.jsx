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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            form="video-tags-form"
            disabled={saving || !canSave}
          >
            {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : "Save tags"}
          </button>
        </>
      }
    >
      <p className="mb-5 text-xs leading-relaxed text-muted wrap-anywhere">{video.name}</p>
      <form id="video-tags-form" onSubmit={save}>
        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="video-tags-input">
          Tags
        </label>
        <div className="my-2.5 flex min-h-6 flex-wrap gap-1.5" aria-live="polite">
          {selected.length === 0 && (
            <span className="text-xs text-muted">No tags yet — add one below.</span>
          )}
          {selected.map((tag) => (
            <span
              key={tag.name.toLowerCase()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brandlight py-[3px] pr-1 pl-2.5 text-xs leading-normal font-semibold text-brand"
            >
              <button
                type="button"
                title={tag.id ? `Filter by ${tag.name}` : tag.name}
                onClick={() => tag.id && onTagClick?.(tag)}
                className="hover:underline"
              >
                {tag.name}
              </button>
              <button
                type="button"
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted hover:bg-[#dceaff] hover:text-brand"
                aria-label={`Remove ${tag.name}`}
                disabled={saving}
                onClick={() => removeName(tag.name)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="relative mt-2.5 flex items-center gap-2" ref={boxRef}>
          <Tags size={15} className="pointer-events-none absolute left-3 text-[#98a3b4]" />
          <input
            id="video-tags-input"
            className="w-full rounded-lg border border-line bg-surface py-3 pr-3 pl-[34px] text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
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
            <ul
              className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 m-0 max-h-[220px] list-none overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_8px_30px_#20334c18]"
              role="listbox"
              aria-label="Tag suggestions"
            >
              {query &&
                !suggestions.some((t) => t.name.toLowerCase() === query.toLowerCase()) &&
                !selected.some((t) => t.name.toLowerCase() === query.toLowerCase()) && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={() => addName(query)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-surfacehover"
                    >
                      <span>
                        <span className="mr-1.5 rounded bg-brandlight px-1.5 py-px text-brand">
                          Create
                        </span>
                        “{query}”
                      </span>
                    </button>
                  </li>
                )}
              {suggestions.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    onMouseDown={() => addName(tag.name)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-surfacehover"
                  >
                    {tag.name}
                    {tag.videoCount > 0 && (
                      <span className="font-normal text-muted">{tag.videoCount}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p
          className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1.5 text-[11px] text-muted"
          id="video-tags-hint"
        >
          New names are created automatically on save.
          <span>
            {selected.length} / {MAX_TAGS}
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
