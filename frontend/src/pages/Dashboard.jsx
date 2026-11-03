import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  CloudUpload,
  Film,
  Grid2X2,
  HardDrive,
  LayoutList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "react-toastify";
import { api, formatBytes } from "../services/api";
import { deleteVideos as removeEach } from "../services/deleteVideos";
import VideoGallery from "../components/VideoGallery";
import VideoCard from "../components/VideoCard";
import VideoPlayer from "../components/VideoPlayer";
import ThumbnailDialog from "../components/ThumbnailDialog";
import VideoMetadataDialog from "../components/VideoMetadataDialog";
import Modal from "../components/Modal";

export function MetricCards({ stats }) {
  return (
    <div className="metric-grid">
      <div className="metric-card">
        <div className="metric-label">
          Total videos
          <span className="metric-icon blue">
            <Video size={19} />
          </span>
        </div>
        <div className="metric-value">{stats.total || 0}</div>
        <p>Every story, in one place</p>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          Storage used
          <span className="metric-icon violet">
            <HardDrive size={18} />
          </span>
        </div>
        <div className="metric-value">
          {formatBytes(stats.size, 2)}
          <span className="metric-value-note">used</span>
        </div>
        <p>Unlimited storage</p>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          Favorites
          <span className="metric-icon teal">
            <Star size={18} />
          </span>
        </div>
        <div className="metric-value">{stats.favorites || 0}</div>
        <p>The videos you want close at hand</p>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          Recent uploads
          <span className="metric-icon amber">
            <CloudUpload size={19} />
          </span>
        </div>
        <div className="metric-value">
          {stats.recent || 0}
          <span className="metric-value-note">24 hours</span>
        </div>
        <p>Keep the creativity coming</p>
      </div>
    </div>
  );
}

export function UploadBanner({ onUpload, maxSize, onDrop }) {
  const [dragging, setDragging] = useState(false);
  return (
    <section
      className={`upload-banner ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (onDrop) onDrop(event.dataTransfer.files);
        else onUpload();
      }}
    >
      <div className="banner-art">
        <div className="banner-orbit orbit-one" />
        <div className="banner-orbit orbit-two" />
        <span className="floating-tile">
          <Film size={20} />
        </span>
        <span className="upload-art-main">
          <CloudUpload size={34} strokeWidth={1.6} />
        </span>
        <span className="art-plus">+</span>
        <span className="art-dot" />
      </div>
      <div className="upload-banner-copy">
        <div className="upload-banner-eyebrow">
          MAKE ROOM FOR YOUR NEXT BIG IDEA
        </div>
        <h2>Drop it. Upload it. Make it yours.</h2>
        <p>Drag & drop your videos here, or choose a file to get started.</p>
        <span>
          <ShieldCheck size={13} />
          Private by default
          <i />
          MP4 up to {formatBytes(maxSize, 0)}
        </span>
      </div>
      <button className="btn primary banner-upload" onClick={onUpload}>
        <Plus size={17} />
        Upload videos
      </button>
      <div className="banner-corner" />
    </section>
  );
}

export default function Dashboard({
  search,
  sort,
  onSort,
  onSearch,
  data,
  loading,
  error,
  onRefresh,
  onUpload,
  onDrop,
  stats,
}) {
  const location = useLocation(),
    navigate = useNavigate();
  const [view, setView] = useState("grid"),
    [selected, setSelected] = useState([]),
    [player, setPlayer] = useState(null),
    [deleting, setDeleting] = useState(null),
    [deleteError, setDeleteError] = useState(""),
    [thumbnailFor, setThumbnailFor] = useState(null),
    [metadataFor, setMetadataFor] = useState(null),
    [busy, setBusy] = useState(false),
    [overviewQuery, setOverviewQuery] = useState(search);
  const requestedFilter = new URLSearchParams(location.search).get("filter");
  const filter = requestedFilter === "favorites" ? "favorites" : "all";
  const page = Number(new URLSearchParams(location.search).get("page")) || 1;
  const isOverview = location.pathname !== "/videos";

  useEffect(() => {
    setOverviewQuery(search);
  }, [search]);

  useEffect(() => {
    if (location.pathname !== "/videos" || requestedFilter !== "recent") return;
    const params = new URLSearchParams(location.search);
    params.delete("filter");
    const next = params.toString();
    navigate(next ? `/videos?${next}` : "/videos", { replace: true });
  }, [location.pathname, location.search, navigate, requestedFilter]);

  useEffect(() => {
    setSelected([]);
  }, [search, sort, page, filter, location.pathname]);

  function changeFilter(value) {
    navigate(`${location.pathname}?filter=${value}`);
  }

  async function favorite(video) {
    try {
      await api.favorite(video.id, !video.favorite);
      onRefresh(undefined, { silent: true });
      toast.success(
        video.favorite ? "Removed from favorites" : "Added to favorites",
      );
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function download(video) {
    try {
      const { url } = await api.download(video.id);
      const link = document.createElement("a");
      link.href = url;
      link.download = video.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.info("Your download is ready");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function copyLink(video) {
    try {
      const { url } = await api.play(video.id);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (err) {
      toast.error(err.message);
    }
  }

  function confirmDelete(videos) {
    setDeleteError("");
    setDeleting(videos);
  }

  // Videos that fail stay in the dialog, so retrying only repeats unfinished deletions.
  async function deleteVideos() {
    setBusy(true);
    setDeleteError("");
    const { deleted, failed, error } = await removeEach(deleting, api.remove);
    if (deleted)
      toast.success(`${deleted > 1 ? `${deleted} videos` : "Video"} deleted`);
    if (failed.length) {
      setDeleting(failed);
      setDeleteError(error.message);
      setSelected((prev) =>
        prev.filter((id) => failed.some((video) => video.id === id)),
      );
    } else {
      setDeleting(null);
      setSelected([]);
    }
    onRefresh(undefined, { silent: true });
    setBusy(false);
  }

  function thumbnailSaved() {
    setThumbnailFor(null);
    onRefresh(undefined, { silent: true });
  }

  function metadataSaved(updated) {
    setMetadataFor(null);
    setPlayer((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current,
    );
    onRefresh(undefined, { silent: true });
  }

  const titles = {
    favorites: [
      "The ones you love.",
      "Keep your favorite frames a little closer.",
    ],
    all: [
      "Your library at a glance.",
      "A home for your videos. A little space for your creativity.",
    ],
  };
  const title = titles[filter] || titles.all;
  const tabs = [
    { key: "all", text: "All videos", icon: Film, count: stats.total },
    {
      key: "favorites",
      text: "Favorites",
      icon: Star,
      count: stats.favorites,
    },
  ];
  const libraryTitle = filter === "favorites" ? "Favorites" : "All videos";
  const libraryCount = filter === "favorites" ? stats.favorites : stats.total;
  const recentVideos = data?.videos?.slice(0, 3) || [];

  function searchOverview(event) {
    event.preventDefault();
    onSearch(overviewQuery);
  }

  return (
    <>
      {isOverview && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                YOUR CREATIVE SPACE
              </div>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            <div className="heading-actions">
              <span className="private-workspace">
                <ShieldCheck size={14} />
                Private workspace
              </span>
              <button className="btn primary" onClick={onUpload}>
                <Plus size={18} />
                Upload videos
              </button>
            </div>
          </div>
          {error ? (
            <div className="page-error" role="alert">
              <AlertCircle size={22} />
              <div>
                <strong>We couldn’t load your workspace</strong>
                <p>{error}</p>
              </div>
              <button className="btn secondary" onClick={() => onRefresh()}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : (
            <>
              <form className="overview-search" onSubmit={searchOverview}>
                <Search size={17} />
                <input
                  value={overviewQuery}
                  onChange={(event) => setOverviewQuery(event.target.value)}
                  placeholder="Search your videos…"
                  aria-label="Search videos"
                />
                <button className="btn secondary" type="submit">
                  Search
                </button>
              </form>
              {loading ? (
                <div
                  className="overview-loading"
                  role="status"
                  aria-label="Loading workspace"
                >
                  <div className="metric-grid" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div className="metric-card" key={index}>
                        <div className="skeleton skeleton-title" />
                        <div className="skeleton skeleton-meta" />
                      </div>
                    ))}
                  </div>
                  <VideoGallery loading view="grid" selected={[]} />
                  <span className="sr-only">Loading your workspace…</span>
                </div>
              ) : (
                <MetricCards stats={stats} />
              )}
              {!loading && !recentVideos.length && (
                <UploadBanner
                  onUpload={onUpload}
                  onDrop={onDrop}
                  maxSize={data?.maxUploadBytes || 2 * 1024 ** 3}
                />
              )}
              {!loading && recentVideos.length > 0 && (
                <section className="overview-recent">
                  <div className="overview-section-heading">
                    <div>
                      <h2>Recently added</h2>
                      <p>Pick up where you left off.</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => navigate("/videos")}
                    >
                      View all videos
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="video-grid overview-grid">
                    {recentVideos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        view="grid"
                        selectable={false}
                        selected={false}
                        onSelect={() => {}}
                        onPlay={setPlayer}
                        onDelete={(item) => confirmDelete([item])}
                        onDownload={download}
                        onCopyLink={copyLink}
                        onFavorite={favorite}
                        onThumbnail={setThumbnailFor}
                        onRename={(item) =>
                          setMetadataFor({ video: item, field: "name" })
                        }
                        onNote={(item) =>
                          setMetadataFor({ video: item, field: "note" })
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {!isOverview && (
        <section className="library-section">
          <div className="library-heading">
            <div>
              <h1>
                {libraryTitle} <span>{libraryCount || 0}</span>
              </h1>
              <p>Search, sort, and manage everything you’ve uploaded.</p>
            </div>
            <div className="library-actions">
              <button
                className={`refresh-button ${loading ? "refreshing" : ""}`}
                onClick={() => onRefresh()}
                aria-label="Refresh video list"
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Refresh
              </button>
              <button className="btn primary library-upload" onClick={onUpload}>
                <Plus size={16} />
                Upload videos
              </button>
            </div>
          </div>

          <div className="library-tabs">
            <div>
              {tabs.map(({ key, text, icon: Icon, count }) => (
                <button
                  className={`library-tab ${filter === key ? "active" : ""}`}
                  key={key}
                  onClick={() => changeFilter(key)}
                  aria-pressed={filter === key}
                >
                  <Icon size={15} />
                  {text}
                  {count > 0 && <span>{count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="library-toolbar">
            <div className="library-search">
              <Search size={17} />
              <input
                placeholder="Search your videos…"
                value={search}
                onChange={(event) => {
                  onSearch(event.target.value);
                  if (page !== 1)
                    navigate(`${location.pathname}?filter=${filter}&page=1`);
                }}
                aria-label="Search your video collection"
              />
              {search && (
                <button
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => onSearch("")}
                >
                  ×
                </button>
              )}
            </div>
            <div className="toolbar-right">
              <div className="sort-control">
                <ArrowDownUp size={15} />
                <select
                  value={sort}
                  onChange={(event) => {
                    onSort(event.target.value);
                    if (page !== 1)
                      navigate(`${location.pathname}?filter=${filter}&page=1`);
                  }}
                  aria-label="Sort videos"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="size">Largest first</option>
                </select>
                <ChevronDown size={13} />
              </div>
              <div className="view-toggle">
                <button
                  className={view === "grid" ? "active" : ""}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <LayoutList size={17} />
                </button>
              </div>
            </div>
          </div>

          <VideoGallery
            data={data}
            loading={loading}
            error={error}
            filter={filter}
            search={search}
            view={view}
            selected={selected}
            onSelect={(id) =>
              setSelected((prev) =>
                prev.includes(id)
                  ? prev.filter((item) => item !== id)
                  : [...prev, id],
              )
            }
            onClearSelection={() => setSelected([])}
            onBulkDelete={() =>
              confirmDelete(
                data.videos.filter((video) => selected.includes(video.id)),
              )
            }
            onPage={(nextPage) =>
              navigate(`${location.pathname}?filter=${filter}&page=${nextPage}`)
            }
            onUpload={onUpload}
            onRefresh={() => onRefresh()}
            onClearSearch={() => onSearch("")}
            onPlay={setPlayer}
            onDelete={(video) => confirmDelete([video])}
            onDownload={download}
            onCopyLink={copyLink}
            onFavorite={favorite}
            onThumbnail={setThumbnailFor}
            onRename={(video) => setMetadataFor({ video, field: "name" })}
            onNote={(video) => setMetadataFor({ video, field: "note" })}
          />
        </section>
      )}

      <footer className="page-footer">
        <span>
          <ShieldCheck size={13} />
          Safely stored. Ready when you are.
        </span>
        <span>
          Made for your next big idea <span className="little-sparkle">✧</span>
        </span>
      </footer>

      {player && (
        <VideoPlayer
          key={player.id}
          video={player}
          onClose={() => setPlayer(null)}
        />
      )}
      {thumbnailFor && (
        <ThumbnailDialog
          key={thumbnailFor.id}
          video={thumbnailFor}
          maxSize={data?.maxThumbnailBytes || 10 * 1024 ** 2}
          onClose={() => setThumbnailFor(null)}
          onSaved={thumbnailSaved}
        />
      )}
      {metadataFor && (
        <VideoMetadataDialog
          key={`${metadataFor.video.id}-${metadataFor.field}`}
          video={metadataFor.video}
          field={metadataFor.field}
          onClose={() => setMetadataFor(null)}
          onSaved={metadataSaved}
        />
      )}
      {deleting && (
        <Modal
          title={`Delete ${deleting.length > 1 ? `${deleting.length} videos` : "this video"}?`}
          onClose={() => !busy && setDeleting(null)}
          className="delete-modal"
          footer={
            <>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Keep {deleting.length > 1 ? "videos" : "video"}
              </button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={deleteVideos}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {deleteError ? "Try again" : "Delete permanently"}
              </button>
            </>
          }
        >
          <div className="delete-icon">
            <Trash2 size={25} />
          </div>
          <p>
            {deleting.length === 1 ? (
              <strong>{deleting[0].name}</strong>
            ) : (
              `${deleting.length} selected videos`
            )}{" "}
            will be permanently deleted from your library.
          </p>
          <span className="muted">This action can’t be undone.</span>
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
