import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Modal from "../components/Modal";

export default function TagsPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listTags();
      setTags(data.tags || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  function startEdit(tag) {
    setEditError("");
    setEditing(tag);
    setEditName(tag.name);
  }

  async function saveEdit(event) {
    event.preventDefault();
    const name = editName.trim().replace(/\s+/g, " ");
    if (!name || !editing) return;
    if (name.length > 30) {
      setEditError("Keep the tag to 30 characters or fewer.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await api.renameTag(editing.id, name);
      toast.success("Tag updated");
      setEditing(null);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setDeleteError("");
    try {
      await api.deleteTag(deleting.id);
      toast.success("Tag deleted");
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-7 min-w-0">
        <h1 className="font-display my-2 flex items-center gap-3 text-3xl leading-tight font-bold tracking-tight text-heading">
          Tags{" "}
          <span className="grid min-w-7 place-items-center rounded-lg border border-line bg-surface px-2 py-1 font-sans text-[13px] font-semibold tracking-normal text-muted">
            {tags.length || 0}
          </span>
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Rename a tag once and every video using it follows. Delete removes it everywhere.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="library-search flex max-w-[420px] min-h-11 min-w-30 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-[#2877e91a]">
          <Search size={17} />
          <input
            placeholder="Search tags…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search tags"
            className="w-full min-w-0 flex-1 border-0 bg-transparent pr-6 text-sm text-ink outline-none"
          />
          {search && (
            <button
              className="absolute right-2 grid h-7 w-7 place-items-center rounded text-lg text-muted hover:text-brand"
              aria-label="Clear tag search"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="flex min-h-9 min-w-9 items-center gap-1.5 text-xs text-muted hover:text-brand disabled:opacity-50"
            onClick={load}
            aria-label="Refresh tags"
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading tags"
          role="status"
          aria-busy="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-[10px] border border-line bg-surface p-4">
              <div className="h-3 w-3/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%]" />
              <div className="mt-3 h-2 w-2/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          className="flex min-h-[330px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface p-8 text-center"
          role="alert"
        >
          <AlertCircle size={22} className="mb-4 text-[#c54a55]" />
          <h3 className="font-display my-2.5 text-lg font-bold text-heading">
            We couldn’t load your tags
          </h3>
          <p className="mb-5 max-w-[360px] text-xs leading-relaxed text-muted">{error}</p>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
            onClick={load}
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : !tags.length ? (
        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface p-8 text-center">
          <Tags size={34} className="mb-4 text-[#85a8da]" />
          <h3 className="font-display my-2.5 text-lg font-bold text-heading">No tags yet</h3>
          <p className="mb-5 max-w-[360px] text-xs leading-relaxed text-muted">
            Open any video’s menu, choose Add tags, and type a name — new tags are created on save.
          </p>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brandsolid px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110"
            onClick={() => navigate("/videos")}
          >
            Browse videos
          </button>
        </div>
      ) : !filtered.length ? (
        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface p-8 text-center">
          <Search size={34} className="mb-4 text-[#85a8da]" />
          <h3 className="font-display my-2.5 text-lg font-bold text-heading">
            No tags match “{search.trim()}”
          </h3>
          <p className="mb-5 max-w-[360px] text-xs leading-relaxed text-muted">
            Try a different search.
          </p>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
            onClick={() => setSearch("")}
          >
            <X size={17} /> Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((tag) => (
            <div
              key={tag.id}
              className="flex min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface py-3 pr-2.5 pl-4 shadow-[0_3px_8px_#26395408]"
            >
              <button
                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-heading hover:text-brand"
                onClick={() => navigate(`/videos?tag=${tag.id}`)}
                title={`Show videos tagged ${tag.name}`}
              >
                {tag.name}
              </button>
              <span className="text-xs whitespace-nowrap text-muted">
                {tag.videoCount} video{tag.videoCount === 1 ? "" : "s"}
              </span>
              <div className="flex gap-0.5">
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand"
                  aria-label={`Rename ${tag.name}`}
                  onClick={() => startEdit(tag)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#da4c58] hover:bg-surfacehover"
                  aria-label={`Delete ${tag.name}`}
                  onClick={() => {
                    setDeleteError("");
                    setDeleting(tag);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={`Rename “${editing.name}”`}
          className="w-[min(560px,100%)]"
          onClose={() => !editSaving && setEditing(null)}
          footer={
            <>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={editSaving}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brandsolid px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                form="tag-rename-form"
                disabled={editSaving || !editName.trim() || editName.trim() === editing.name}
              >
                {editSaving ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Pencil size={16} />
                )}
                {editSaving ? "Saving…" : "Save name"}
              </button>
            </>
          }
        >
          <p className="mb-5 text-xs leading-relaxed text-muted">
            Every video tagged “{editing.name}” will use the new name. If the name already exists,
            the tags are merged.
          </p>
          <form id="tag-rename-form" onSubmit={saveEdit}>
            <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="tag-rename-input">
              Tag name
            </label>
            <input
              id="tag-rename-input"
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={30}
              required
              disabled={editSaving}
            />
            {editError && (
              <p className="mt-2 block text-xs leading-relaxed text-[#d95665]" role="alert">
                {editError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={`Delete “${deleting.name}”?`}
          className="max-w-[450px]"
          onClose={() => !busy && setDeleting(null)}
          footer={
            <>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Keep tag
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#df424b] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={confirmDelete}
              >
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                {deleteError ? "Try again" : "Delete tag"}
              </button>
            </>
          }
        >
          <div className="mb-4 grid h-13 w-13 place-items-center rounded-full bg-[#fff0f0] text-[#dc6670] dark:bg-[#492b39]">
            <Trash2 size={25} />
          </div>
          <p className="mb-3 text-xs leading-loose text-muted wrap-anywhere">
            <strong>{deleting.name}</strong> will be removed from{" "}
            {deleting.videoCount === 1 ? "1 video" : `${deleting.videoCount} videos`}. The videos
            stay in your library.
          </p>
          {deleteError && (
            <p className="mt-2 block text-xs leading-relaxed text-[#d95665]" role="alert">
              {deleteError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
