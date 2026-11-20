import { ChevronLeft, ChevronRight, CloudUpload, Film, RefreshCw, Trash2, X } from "lucide-react";
import VideoCard from "./VideoCard";

const gridClass = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

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
      <div
        className="flex min-h-[330px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface p-8 text-center"
        role="alert"
      >
        <Film size={34} className="mb-4 text-[#85a8da]" />
        <h3 className="font-display my-2.5 text-lg font-bold text-heading">
          We couldn’t load your library
        </h3>
        <p className="mb-5 max-w-[360px] text-xs leading-relaxed text-muted">{error}</p>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
          onClick={onRefresh}
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  const pagination = data?.pagination;
  const [emptyTitle, emptyCopy] = search
    ? ["No videos found", "Try a different search, or upload something new."]
    : filter === "favorites"
      ? ["No favorites yet", "Star a video and it will show up here whenever you need it."]
      : [
          "A little quiet in here",
          "Your next great story belongs here. Upload a video to get started.",
        ];
  return (
    <>
      {selected.length > 0 && (
        <div className="mb-3.5 flex min-h-11 items-center justify-between gap-3.5 rounded-lg border border-[#dce9ff] bg-brandlight px-3 py-2 text-sm text-ink">
          <span>
            <b>{selected.length}</b> video{selected.length > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-3.5">
            <button
              className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-[#da4c58] hover:underline hover:underline-offset-4"
              onClick={onBulkDelete}
            >
              <Trash2 size={15} />
              Delete selected
            </button>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand"
              aria-label="Clear selection"
              onClick={onClearSelection}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <div className={gridClass} aria-label="Loading videos" role="status" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-[10px] border border-line bg-surface pb-5"
            >
              <div className="aspect-[1.85] animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%] dark:from-[#1e2f47] dark:via-[#253a57] dark:to-[#1e2f47]" />
              <div className="mt-4.5 mr-4 mb-3 ml-4 h-3 w-3/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%] dark:from-[#1e2f47] dark:via-[#253a57] dark:to-[#1e2f47]" />
              <div className="ml-4 h-2 w-2/5 rounded animate-shimmer bg-gradient-to-r from-[#eaf0f6] via-[#f4f7fb] to-[#eaf0f6] bg-[length:200%_100%] dark:from-[#1e2f47] dark:via-[#253a57] dark:to-[#1e2f47]" />
            </div>
          ))}
        </div>
      ) : !data?.videos?.length ? (
        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface p-8 text-center">
          <div className="relative grid h-[87px] w-[98px] place-items-center text-[#7ca3da]">
            <div className="absolute inset-x-2.5 inset-y-1.5 rotate-[-10deg] rounded-[13px] border border-[#d6e6fb] bg-brandlight dark:border-[#354f74]" />
            <Film size={42} className="relative z-[1]" />
            <span className="absolute top-0 right-[3px] grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-xl text-brand">
              +
            </span>
          </div>
          <h3 className="font-display my-2.5 text-lg font-bold text-heading">{emptyTitle}</h3>
          <p className="mb-5 max-w-[360px] text-xs leading-relaxed text-muted">{emptyCopy}</p>
          {search && (
            <button
              className="mb-2.5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
              onClick={onClearSearch}
            >
              <X size={17} /> Clear search
            </button>
          )}
          <button
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${
              search
                ? "border border-line bg-surface hover:bg-surfacehover"
                : "bg-brandsolid text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110"
            }`}
            onClick={onUpload}
          >
            <CloudUpload size={17} />
            Upload a video
          </button>
        </div>
      ) : (
        <div className={view === "list" ? "grid grid-cols-1 gap-3" : gridClass}>
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
        <div className="flex items-center justify-between gap-4 py-5 text-xs text-muted tabular-nums">
          <span>
            Showing{" "}
            <strong className="font-medium text-ink">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </strong>{" "}
            of <strong className="font-medium text-ink">{pagination.total}</strong>{" "}
            {filter === "favorites" ? "favorites" : "videos"}
          </span>
          <div className="mx-auto flex items-center gap-1.5">
            <button
              className="grid h-9 min-h-9 w-9 place-items-center rounded border border-line bg-surface text-muted hover:bg-brandlight disabled:opacity-50"
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
                  className={`grid h-9 min-h-9 w-9 place-items-center rounded text-xs text-muted hover:bg-brandlight ${
                    pagination.page === page
                      ? "border border-[#dfeafb] bg-brandlight text-brand"
                      : ""
                  }`}
                  aria-label={`Page ${page}`}
                  aria-current={pagination.page === page ? "page" : undefined}
                  onClick={() => onPage(page)}
                >
                  {page}
                </button>
              );
            })}
            <button
              className="grid h-9 min-h-9 w-9 place-items-center rounded border border-line bg-surface text-muted hover:bg-brandlight disabled:opacity-50"
              aria-label="Next page"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPage(pagination.page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="hidden text-muted lg:inline">
            Page {pagination.page} of {pagination.pages}
          </span>
        </div>
      )}
    </>
  );
}
