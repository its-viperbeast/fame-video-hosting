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
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            ORGANIZE YOUR LIBRARY
          </div>
          <h1>
            Tags <span>{tags.length || 0}</span>
          </h1>
          <p>Rename a tag once and every video using it follows. Delete removes it everywhere.</p>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="library-search">
          <Search size={17} />
          <input
            placeholder="Search tags…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search tags"
          />
          {search && (
            <button
              className="search-clear"
              aria-label="Clear tag search"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        <div className="toolbar-right">
          <button
            className="refresh-button"
            onClick={load}
            aria-label="Refresh tags"
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="tag-grid" aria-label="Loading tags" role="status" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton-card" key={i}>
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-meta" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <AlertCircle size={22} />
          <h3>We couldn’t load your tags</h3>
          <p>{error}</p>
          <button className="btn secondary" onClick={load}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : !tags.length ? (
        <div className="empty-state">
          <Tags size={34} />
          <h3>No tags yet</h3>
          <p>
            Open any video’s menu, choose Add tags, and type a name — new tags are created on save.
          </p>
          <button className="btn primary" onClick={() => navigate("/videos")}>
            Browse videos
          </button>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <Search size={34} />
          <h3>No tags match “{search.trim()}”</h3>
          <p>Try a different search.</p>
          <button className="btn secondary" onClick={() => setSearch("")}>
            <X size={17} /> Clear search
          </button>
        </div>
      ) : (
        <div className="tag-grid">
          {filtered.map((tag) => (
            <div className="tag-card" key={tag.id}>
              <button
                className="tag-card-name"
                onClick={() => navigate(`/videos?tag=${tag.id}`)}
                title={`Show videos tagged ${tag.name}`}
              >
                {tag.name}
              </button>
              <span className="tag-card-count">
                {tag.videoCount} video{tag.videoCount === 1 ? "" : "s"}
              </span>
              <div className="tag-card-actions">
                <button
                  className="icon-btn"
                  aria-label={`Rename ${tag.name}`}
                  onClick={() => startEdit(tag)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn danger-text"
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
          className="metadata-modal"
          onClose={() => !editSaving && setEditing(null)}
          footer={
            <>
              <button
                className="btn secondary"
                disabled={editSaving}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                type="submit"
                form="tag-rename-form"
                disabled={editSaving || !editName.trim() || editName.trim() === editing.name}
              >
                {editSaving ? <LoaderCircle className="spin" size={16} /> : <Pencil size={16} />}
                {editSaving ? "Saving…" : "Save name"}
              </button>
            </>
          }
        >
          <p className="modal-intro">
            Every video tagged “{editing.name}” will use the new name. If the name already exists,
            the tags are merged.
          </p>
          <form id="tag-rename-form" onSubmit={saveEdit}>
            <label className="field-label" htmlFor="tag-rename-input">
              Tag name
            </label>
            <input
              id="tag-rename-input"
              className="form-input"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={30}
              required
              disabled={editSaving}
            />
            {editError && (
              <p className="error-text" role="alert">
                {editError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={`Delete “${deleting.name}”?`}
          className="delete-modal"
          onClose={() => !busy && setDeleting(null)}
          footer={
            <>
              <button className="btn secondary" disabled={busy} onClick={() => setDeleting(null)}>
                Keep tag
              </button>
              <button className="btn danger" disabled={busy} onClick={confirmDelete}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                {deleteError ? "Try again" : "Delete tag"}
              </button>
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> will be removed from{" "}
            {deleting.videoCount === 1 ? "1 video" : `${deleting.videoCount} videos`}. The videos
            stay in your library.
          </p>
          {deleteError && (
            <p className="error-text" role="alert">
              {deleteError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
