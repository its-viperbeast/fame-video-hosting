import { ChevronLeft, ChevronRight, CloudUpload, Film, RefreshCw, Trash2, X } from "lucide-react";
import VideoCard from "./VideoCard";

export default function VideoGallery({
  data,
  loading,
  error,
  filter = "all",
  search = "",
  view,
  selected,
  onSelect,
  onClearSelection,
  onBulkDelete,
  onPage,
  onUpload,
  onRefresh,
  onClearSearch,
  ...actions
}) {
  if (error)
    return (
      <div className="empty-state" role="alert">
        <Film size={34} />
        <h3>We couldn’t load your library</h3>
        <p>{error}</p>
        <button className="btn secondary" onClick={onRefresh}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  const pagination = data?.pagination;
  const emptyTitle = search
    ? "No videos found"
    : filter === "favorites"
      ? "No favorites yet"
      : "A little quiet in here";
  const emptyCopy = search
    ? "Try a different search, or upload something new."
    : filter === "favorites"
      ? "Star a video and it will show up here whenever you need it."
      : "Your next great story belongs here. Upload a video to get started.";
  return (
    <>
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <b>{selected.length}</b> video{selected.length > 1 ? "s" : ""} selected
          </span>
          <div>
            <button className="text-btn danger-text" onClick={onBulkDelete}>
              <Trash2 size={15} />
              Delete selected
            </button>
            <button className="icon-btn" aria-label="Clear selection" onClick={onClearSelection}>
              <X size={17} />
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <div
          className={`video-grid ${view === "list" ? "list-view" : ""}`}
          aria-label="Loading videos"
          role="status"
          aria-busy="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton-card" key={i}>
              <div className="skeleton skeleton-image" />
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-meta" />
            </div>
          ))}
        </div>
      ) : !data?.videos?.length ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <div />
            <Film size={42} />
            <span>+</span>
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyCopy}</p>
          {search && (
            <button className="btn secondary clear-search-button" onClick={onClearSearch}>
              <X size={17} /> Clear search
            </button>
          )}
          <button className={`btn ${search ? "secondary" : "primary"}`} onClick={onUpload}>
            <CloudUpload size={17} />
            Upload a video
          </button>
        </div>
      ) : (
        <div className={`video-grid ${view === "list" ? "list-view" : ""}`}>
          {data.videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              view={view}
              selected={selected.includes(video.id)}
              onSelect={onSelect}
              {...actions}
            />
          ))}
        </div>
      )}
      {!loading && pagination?.total > 0 && (
        <div className="gallery-pagination">
          <span>
            Showing{" "}
            <strong>
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </strong>{" "}
            of <strong>{pagination.total}</strong> {filter === "favorites" ? "favorites" : "videos"}
          </span>
          <div>
            <button
              className="pagination-arrow"
              aria-label="Previous page"
              disabled={pagination.page === 1}
              onClick={() => onPage(pagination.page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
              const page =
                pagination.pages <= 5
                  ? i + 1
                  : Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4)) + i;
              return (
                <button
                  key={page}
                  className={`page-number ${pagination.page === page ? "current" : ""}`}
                  aria-label={`Page ${page}`}
                  aria-current={pagination.page === page ? "page" : undefined}
                  onClick={() => onPage(page)}
                >
                  {page}
                </button>
              );
            })}
            <button
              className="pagination-arrow"
              aria-label="Next page"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPage(pagination.page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="pagination-note">
            Page {pagination.page} of {pagination.pages}
          </span>
        </div>
      )}
    </>
  );
}
