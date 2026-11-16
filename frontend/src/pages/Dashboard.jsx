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
import { deleteVideos } from "../services/deleteVideos";
import VideoGallery from "../components/VideoGallery";
import VideoCard from "../components/VideoCard";
import VideoPlayer from "../components/VideoPlayer";
import ThumbnailDialog from "../components/ThumbnailDialog";
import VideoMetadataDialog from "../components/VideoMetadataDialog";
import VideoTagsDialog from "../components/VideoTagsDialog";
import Modal from "../components/Modal";
import { libraryQuery } from "../services/libraryQuery";

const metrics = [
  {
    key: "total",
    label: "Total videos",
    copy: "Every story, in one place",
    icon: Video,
    chip: "bg-brandlight text-[#4987e5]",
  },
  {
    key: "size",
    label: "Storage used",
    copy: "Unlimited storage",
    icon: HardDrive,
    chip: "bg-[#f4f0ff] text-[#9a80df] dark:bg-line",
  },
  {
    key: "favorites",
    label: "Favorites",
    copy: "The videos you want close at hand",
    icon: Star,
    chip: "bg-[#eaf8f4] text-[#50b4a0] dark:bg-line",
  },
  {
    key: "recent",
    label: "Recent uploads",
    copy: "Keep the creativity coming",
    icon: CloudUpload,
    chip: "bg-[#fff5e8] text-[#e4ac58] dark:bg-line",
  },
];

function MetricCards({ stats }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ key, label, copy, icon: Icon, chip }) => (
        <div
          key={key}
          className="min-h-[126px] rounded-[10px] border border-line bg-surface p-4 shadow-[0_3px_8px_#26395408]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            {label}
            <span className={`grid h-7 w-7 place-items-center rounded-md ${chip}`}>
              <Icon size={18} />
            </span>
          </div>
          <div className="font-display mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[26px] leading-8 font-bold tracking-tight text-heading">
            {key === "size" ? formatBytes(stats.size, 2) : stats[key] || 0}
            {key === "size" && (
              <span className="font-sans mt-1 text-xs font-normal tracking-normal text-muted">
                used
              </span>
            )}
            {key === "recent" && (
              <span className="font-sans mt-1 text-xs font-normal tracking-normal text-muted">
                24 hours
              </span>
            )}
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs leading-relaxed text-muted">
            {copy}
          </p>
        </div>
      ))}
    </div>
  );
}

function UploadBanner({ onUpload, maxSize, onDrop }) {
  const [dragging, setDragging] = useState(false);
  return (
    <section
      className={`relative mb-8 flex min-h-[145px] flex-col gap-4 overflow-hidden rounded-xl border border-dashed p-6 transition-colors sm:flex-row sm:items-center dark:bg-none ${
        dragging
          ? "border-brand bg-[#dfecff] dark:bg-line"
          : "border-[#a9c3ea] bg-gradient-to-r from-[#f0f6ff] via-[#f5f9ff] to-[#f1f6ff] dark:border-[#385578] dark:from-[#1b2e48] dark:to-[#182940]"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onDrop(event.dataTransfer.files);
      }}
    >
      <div
        className="relative hidden h-24 w-32 shrink-0 place-items-center sm:grid"
        aria-hidden="true"
      >
        <div className="absolute h-[91px] w-[91px] rounded-full border border-[#dfeafc] dark:border-[#345070]" />
        <div className="absolute h-[115px] w-[115px] rounded-full border border-dashed border-[#dfebfb88] dark:border-[#345070]" />
        <span className="relative z-[2] grid h-[69px] w-[69px] -rotate-7 place-items-center rounded-[17px] border border-[#e3ecfb] bg-gradient-to-br from-white to-[#e4efff] text-[#4d8ee9] shadow-[0_5px_16px_#6c9cde18] dark:border-[#3b567c] dark:from-[#2f4b6d] dark:to-[#213d60]">
          <CloudUpload size={34} strokeWidth={1.6} className="rotate-7" />
        </span>
        <span className="absolute top-0 right-2 z-[3] grid h-9 w-8 rotate-12 place-items-center rounded-md border border-[#dae7fb] bg-[#f9fcff] text-[#93b5e6] shadow-[0_4px_6px_#346ba50a] dark:border-[#415f86] dark:bg-[#2d4568]">
          <Film size={20} />
        </span>
      </div>
      <div className="relative z-[2] min-w-0 flex-1">
        <div className="mb-2 text-[11px] font-bold tracking-wide text-[#5d7ea6]">
          MAKE ROOM FOR YOUR NEXT BIG IDEA
        </div>
        <h2 className="font-display text-lg font-bold tracking-tight text-[#2d4b75] dark:text-ink">
          Drop it. Upload it. Make it yours.
        </h2>
        <p className="mt-1.5 text-xs text-[#91a2b9] dark:text-muted">
          Drag & drop your videos here, or choose a file to get started.
        </p>
        <span className="mt-3 flex items-center gap-1.5 text-xs text-[#96a8c1] dark:text-muted">
          <i className="mx-1 h-[3px] w-[3px] rounded-full bg-[#b9c8dc]" />
          MP4 up to {formatBytes(maxSize, 0)}
        </span>
      </div>
      <button
        className="relative z-[2] inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 sm:self-center"
        onClick={onUpload}
      >
        <Plus size={17} />
        Upload videos
      </button>
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
  const query = new URLSearchParams(location.search);
  const filter = query.get("filter") === "favorites" ? "favorites" : "all";
  const page = Number(query.get("page")) || 1;
  const activeTag = libraryQuery(location.pathname, location.search).tag;
  const isOverview = location.pathname !== "/videos";

  useEffect(() => {
    setOverviewQuery(search);
  }, [search]);

  useEffect(() => {
    setSelected([]);
  }, [search, sort, page, filter, location.pathname]);

  const refreshSilently = () => onRefresh(undefined, { silent: true });

  async function favorite(video) {
    try {
      await api.update(video.id, { favorite: !video.favorite });
      refreshSilently();
      toast.success(video.favorite ? "Removed from favorites" : "Added to favorites");
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
  async function deleteConfirmed() {
    setBusy(true);
    setDeleteError("");
    const { deleted, failed, error } = await deleteVideos(deleting, api.remove);
    if (deleted) toast.success(`${deleted > 1 ? `${deleted} videos` : "Video"} deleted`);
    if (failed.length) {
      setDeleting(failed);
      setDeleteError(error.message);
      setSelected((prev) => prev.filter((id) => failed.some((video) => video.id === id)));
    } else {
      setDeleting(null);
      setSelected([]);
    }
    refreshSilently();
    setBusy(false);
  }

  function thumbnailSaved() {
    setThumbnailFor(null);
    refreshSilently();
  }

  function metadataSaved(updated) {
    setMetadataFor(null);
    setPlayer((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    refreshSilently();
  }

  // Tag filtering lives in the library, so Overview clicks open /videos.
  function filterByTag(tag) {
    const next = new URLSearchParams(isOverview ? "" : location.search);
    next.set("tag", tag.id || tag);
    next.delete("page");
    navigate(`/videos?${next}`);
  }

  function clearTag() {
    const next = new URLSearchParams(location.search);
    next.delete("tag");
    next.delete("page");
    const rest = next.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ""}`);
  }

  const cardActions = {
    onPlay: setPlayer,
    onDelete: (video) => confirmDelete([video]),
    onDownload: download,
    onCopyLink: copyLink,
    onFavorite: favorite,
    onThumbnail: setThumbnailFor,
    onRename: (video) => setMetadataFor({ video, field: "name" }),
    onNote: (video) => setMetadataFor({ video, field: "note" }),
    onTags: (video) => setMetadataFor({ video, field: "tags" }),
    onTagClick: (tag) => filterByTag(tag),
  };
  const [title, subtitle] =
    filter === "favorites"
      ? ["The ones you love.", "Keep your favorite frames a little closer."]
      : [
          "Your library at a glance.",
          "A home for your videos. A little space for your creativity.",
        ];
  const tabs = [
    { key: "all", text: "All videos", icon: Film, count: stats.total },
    { key: "favorites", text: "Favorites", icon: Star, count: stats.favorites },
  ];
  const libraryTitle = filter === "favorites" ? "Favorites" : "All videos";
  const libraryCount = filter === "favorites" ? stats.favorites : stats.total;
  const recentVideos = data?.videos?.slice(0, 4) || [];

  function searchOverview(event) {
    event.preventDefault();
    onSearch(overviewQuery);
  }

  return (
    <>
      {isOverview && (
        <>
          <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <h1 className="font-display my-2 text-3xl leading-tight font-bold tracking-tight text-heading">
                {title}
              </h1>
              <p className="text-sm leading-relaxed text-muted">{subtitle}</p>
            </div>
            <div className="flex flex-col items-start gap-3.5 pt-1 sm:items-end">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110"
                onClick={onUpload}
              >
                <Plus size={18} />
                Upload videos
              </button>
            </div>
          </div>
          {error ? (
            <div
              className="mb-6 flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-surface p-5 leading-relaxed"
              role="alert"
            >
              <AlertCircle size={22} className="text-[#c54a55]" />
              <div className="min-w-0 flex-1">
                <strong>We couldn’t load your workspace</strong>
                <p className="mt-1 text-[13px] text-muted">{error}</p>
              </div>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
                onClick={() => onRefresh()}
              >
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : (
            <>
              <form
                className="overview-search mb-6 flex min-h-11 items-center gap-3 rounded-[10px] border border-line bg-surface py-1.5 pr-2 pl-4 text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-[#2877e91a]"
                onSubmit={searchOverview}
              >
                <Search size={17} />
                <input
                  value={overviewQuery}
                  onChange={(event) => setOverviewQuery(event.target.value)}
                  placeholder="Search your videos…"
                  aria-label="Search videos"
                  className="w-full min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-ink outline-none"
                />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
                  type="submit"
                >
                  Search
                </button>
              </form>
              {loading ? (
                <div className="mb-8" role="status" aria-label="Loading workspace">
                  <div
                    className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="min-h-[126px] rounded-[10px] border border-line bg-surface p-4"
                      >
                        <div className="h-3 w-3/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%]" />
                        <div className="mt-3 h-2 w-2/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%]" />
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
                <section className="mt-1.5 mb-8">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold tracking-tight text-heading">
                        Recently added
                      </h2>
                      <p className="mt-1 text-[13px] text-muted">Pick up where you left off.</p>
                    </div>
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                      onClick={() => navigate("/videos")}
                    >
                      View all videos
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {recentVideos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        view="grid"
                        selectable={false}
                        {...cardActions}
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
        <section className="mb-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <h1 className="font-display flex items-center gap-3 text-3xl leading-snug font-bold tracking-tight text-heading">
                {libraryTitle}{" "}
                <span className="grid min-w-7 place-items-center rounded-lg border border-line bg-surface px-2 py-1 font-sans text-[13px] font-semibold tracking-normal text-muted">
                  {libraryCount || 0}
                </span>
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Search, sort, and manage everything you’ve uploaded.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 max-sm:w-full max-sm:justify-between">
              <button
                className={`flex min-h-9 min-w-9 items-center gap-1.5 text-xs text-muted hover:text-brand disabled:opacity-50 ${loading ? "pointer-events-none" : ""}`}
                onClick={() => onRefresh()}
                aria-label="Refresh video list"
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110"
                onClick={onUpload}
              >
                <Plus size={16} />
                Upload videos
              </button>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between border-b border-line">
            <div className="flex gap-6 max-sm:gap-3">
              {tabs.map(({ key, text, icon: Icon, count }) => (
                <button
                  className={`relative min-h-11 items-center gap-1.5 pt-2 pb-3.5 text-sm font-medium whitespace-nowrap ${
                    filter === key ? "font-semibold text-brand" : "text-muted hover:text-brand"
                  } flex`}
                  key={key}
                  onClick={() => navigate(`${location.pathname}?filter=${key}`)}
                  aria-pressed={filter === key}
                >
                  <Icon size={15} className={filter === key ? "text-brand" : "text-[#9ba8b9]"} />
                  {text}
                  {count > 0 && (
                    <span className="rounded bg-brandlight px-1 py-px text-xs">{count}</span>
                  )}
                  {filter === key && (
                    <span
                      className="absolute right-0 -bottom-px left-0 h-0.5 rounded bg-brand"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-4 max-sm:flex-wrap">
            <div className="library-search flex max-w-[420px] min-h-11 min-w-30 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-[#2877e91a]">
              <Search size={17} />
              <input
                placeholder="Search your videos…"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                aria-label="Search your video collection"
                className="w-full min-w-0 flex-1 border-0 bg-transparent pr-6 text-sm text-ink outline-none"
              />
              {search && (
                <button
                  className="absolute right-2 grid h-7 w-7 place-items-center rounded text-lg text-muted hover:text-brand"
                  aria-label="Clear search"
                  onClick={() => onSearch("")}
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-[#8b98ac] focus-within:border-brand focus-within:ring-2 focus-within:ring-[#2877e91a]">
                <ArrowDownUp size={15} className="text-[#9aa7ba]" />
                <select
                  value={sort}
                  onChange={(event) => onSort(event.target.value)}
                  aria-label="Sort videos"
                  className="cursor-pointer appearance-none border-0 bg-none pr-1 text-[13px] text-muted outline-none"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="size">Largest first</option>
                </select>
                <ChevronDown size={13} />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-[3px]">
                <button
                  className={`grid h-9 min-h-9 w-9 place-items-center rounded ${view === "grid" ? "bg-brandlight text-brand" : "text-[#a1adbd] hover:text-brand"}`}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  className={`grid h-9 min-h-9 w-9 place-items-center rounded ${view === "list" ? "bg-brandlight text-brand" : "text-[#a1adbd] hover:text-brand"}`}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <LayoutList size={17} />
                </button>
              </div>
            </div>
          </div>

          {activeTag && (
            <div className="mb-3.5 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brandlight px-2.5 py-1 text-xs leading-normal font-semibold text-brand">
                {(() => {
                  const found = data?.videos
                    ?.flatMap((v) => v.tags || [])
                    .find((t) => t.id === activeTag);
                  return found ? found.name : "Tagged videos";
                })()}
              </span>
              <button
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                onClick={clearTag}
              >
                Clear tag filter
              </button>
              <button
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline hover:underline-offset-4"
                onClick={() => navigate(`/tags`)}
              >
                Manage tags
              </button>
            </div>
          )}
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
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
              )
            }
            onClearSelection={() => setSelected([])}
            onBulkDelete={() =>
              confirmDelete(data.videos.filter((video) => selected.includes(video.id)))
            }
            onPage={(nextPage) =>
              navigate(`${location.pathname}?filter=${filter}&page=${nextPage}`)
            }
            onUpload={onUpload}
            onRefresh={() => onRefresh()}
            onClearSearch={() => onSearch("")}
            {...cardActions}
          />
        </section>
      )}

      {player && <VideoPlayer key={player.id} video={player} onClose={() => setPlayer(null)} />}
      {thumbnailFor && (
        <ThumbnailDialog
          key={thumbnailFor.id}
          video={thumbnailFor}
          maxSize={data?.maxThumbnailBytes || 10 * 1024 ** 2}
          onClose={() => setThumbnailFor(null)}
          onSaved={thumbnailSaved}
        />
      )}
      {metadataFor && metadataFor.field === "tags" ? (
        <VideoTagsDialog
          key={`${metadataFor.video.id}-tags`}
          video={metadataFor.video}
          onClose={() => setMetadataFor(null)}
          onSaved={metadataSaved}
          onTagClick={filterByTag}
        />
      ) : (
        metadataFor && (
          <VideoMetadataDialog
            key={`${metadataFor.video.id}-${metadataFor.field}`}
            video={metadataFor.video}
            field={metadataFor.field}
            onClose={() => setMetadataFor(null)}
            onSaved={metadataSaved}
          />
        )
      )}
      {deleting && (
        <Modal
          title={`Delete ${deleting.length > 1 ? `${deleting.length} videos` : "this video"}?`}
          onClose={() => !busy && setDeleting(null)}
          className="max-w-[450px]"
          footer={
            <>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Keep {deleting.length > 1 ? "videos" : "video"}
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#df424b] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={deleteConfirmed}
              >
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                {deleteError ? "Try again" : "Delete permanently"}
              </button>
            </>
          }
        >
          <div className="mb-4 grid h-13 w-13 place-items-center rounded-full bg-[#fff0f0] text-[#dc6670] dark:bg-[#492b39]">
            <Trash2 size={25} />
          </div>
          <p className="mb-3 text-xs leading-loose text-[#8190a4] wrap-anywhere">
            {deleting.length === 1 ? (
              <strong>{deleting[0].name}</strong>
            ) : (
              `${deleting.length} selected videos`
            )}{" "}
            will be permanently deleted from your library.
          </p>
          <span className="text-xs text-muted">This action can’t be undone.</span>
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
