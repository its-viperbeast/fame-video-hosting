import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Ellipsis,
  FileVideo,
  ImageUp,
  Link,
  NotebookPen,
  Pencil,
  Play,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import { api, formatBytes, formatDuration } from "../services/api";

const imageState = (src) => ({ for: src, src, renewed: false, failed: false });

function Thumbnail({ video }) {
  const ref = useRef(null),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false),
    [image, setImage] = useState(() => imageState(video.thumbnailUrl));
  // A replaced thumbnail has a new URL, so the card starts fresh instead of showing a cached image.
  if (image.for !== video.thumbnailUrl) setImage(imageState(video.thumbnailUrl));

  // A lazy image can outlive its signed URL; renew it once before falling back.
  function imageError() {
    const current = image.for;
    if (image.renewed) {
      setImage({ ...image, failed: true });
      return;
    }
    setImage({ ...image, renewed: true });
    api
      .details(video.id)
      .then(({ video: fresh }) =>
        setImage((prev) => (prev.for === current ? { ...prev, src: fresh.thumbnailUrl } : prev)),
      )
      .catch(() => setImage((prev) => (prev.for === current ? { ...prev, failed: true } : prev)));
  }

  useEffect(() => {
    if (video.thumbnailUrl) return;
    let live = true;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        api
          .play(video.id)
          .then((data) => {
            if (live) setUrl(data.url);
          })
          .catch(() => {
            if (live) setFailed(true);
          });
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [video.id, video.thumbnailUrl]);
  const fallback = (
    <span className="grid h-full w-full place-items-center bg-gradient-to-br from-[#daebf7] to-[#c2d5ee] text-[#7094bf] dark:from-[#1e2f47] dark:to-[#253a57]">
      <FileVideo size={44} />
    </span>
  );
  return (
    <span ref={ref} className="absolute inset-0 block">
      {video.thumbnailUrl ? (
        image.src && !image.failed ? (
          <img
            src={image.src}
            alt=""
            loading="lazy"
            onError={imageError}
            className="h-full w-full object-cover saturate-[0.8] transition-transform duration-500 group-hover:scale-[1.04] group-hover:saturate-[0.9]"
          />
        ) : (
          fallback
        )
      ) : url && !failed ? (
        <video
          src={`${url}#t=1`}
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export default function VideoCard({
  video,
  onPlay,
  onDelete,
  onDownload,
  onCopyLink,
  onFavorite,
  onThumbnail,
  onRename,
  onNote,
  onTags,
  onTagClick,
  selected,
  onSelect,
  view,
  selectable = true,
}) {
  const [menu, setMenu] = useState(false),
    [pos, setPos] = useState(null);
  const menuRef = useRef(null);
  const anchorRef = useRef(null);
  const menuItems = [
    { icon: Play, label: "Preview video", action: onPlay },
    { icon: Download, label: "Download", action: onDownload },
    { icon: Link, label: "Copy link", action: onCopyLink },
    {
      icon: ImageUp,
      label: video.thumbnailUrl ? "Change thumbnail" : "Add thumbnail",
      action: onThumbnail,
    },
    { icon: Pencil, label: "Rename video", action: onRename },
    { icon: NotebookPen, label: video.note ? "Edit note" : "Add note", action: onNote },
    {
      icon: Tags,
      label: video.tags?.length > 0 ? `Edit tags (${video.tags.length})` : "Add tags",
      action: onTags,
    },
    {
      icon: Star,
      label: video.favorite ? "Remove from favorites" : "Add to favorites",
      action: onFavorite,
    },
    { icon: Trash2, label: "Delete video", action: onDelete, className: "text-[#da4c58]" },
  ];

  useEffect(() => {
    if (!menu) return;
    const onKey = (event) => {
      if (event.key === "Escape") setMenu(false);
    };
    const onScroll = () => setMenu(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [menu]);

  // The menu floats above everything, clamped to the viewport so it is never
  // cut off by the screen edge or hidden behind other cards.
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const node = menuRef.current;
    if (!anchor || !node) return;
    const target = anchor.getBoundingClientRect();
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const left = Math.max(8, Math.min(target.right - width, window.innerWidth - width - 8));
    const below = target.bottom + 6;
    const top =
      below + height > window.innerHeight - 8 ? Math.max(8, target.top - height - 6) : below;
    setPos({ top, left });
  }, [menu]);

  const isList = view === "list";

  return (
    <article
      className={`group min-w-0 rounded-[10px] border bg-surface shadow-[0_3px_6px_#26395408] transition-colors hover:border-[#dbe4f0] hover:shadow-[0_8px_22px_#26395412] ${
        selected ? "border-[#91b5ee] shadow-[0_0_0_2px_#2877e915]" : "border-line"
      } ${isList ? "flex items-stretch" : ""}`}
    >
      <div
        className={`relative aspect-[1.85] shrink-0 bg-[#dce5ef] dark:bg-[#1e2f47] ${isList ? "w-36 sm:w-42" : "rounded-t-[10px]"}`}
      >
        <button
          className={`relative block h-full w-full overflow-hidden bg-gradient-to-br from-[#cee0ec] to-[#8da8b6] ${isList ? "" : "rounded-t-[10px]"}`}
          aria-label={`Play ${video.name}`}
          onClick={() => onPlay(video)}
        >
          <Thumbnail video={video} />
          <span className="absolute inset-0 bg-gradient-to-b from-[#10213312] via-transparent to-[#091b3430]" />
          <span className="absolute top-1/2 left-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#ffffff75] bg-[#ffffff24] pl-[3px] text-white shadow-[0_2px_8px_#00000010] backdrop-blur-sm transition-colors group-hover:bg-[#ffffff45]">
            <Play size={21} fill="currentColor" />
          </span>
        </button>
        {selectable && (
          <button
            className={`absolute top-2.5 left-2.5 z-[2] grid h-5 w-5 place-items-center rounded border border-[#ffffffaa] bg-[#ffffff33] text-white backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 ${
              selected ? "bg-brand opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label={`Select ${video.name}`}
            aria-pressed={selected}
            onClick={() => onSelect(video.id)}
          >
            {selected && <Check size={13} />}
          </button>
        )}
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded border border-[#ffffff30] bg-[#122b3e39] px-1.5 py-[3px] text-xs font-semibold tracking-wide text-white backdrop-blur-sm transition-opacity group-hover:opacity-0">
          MP4
        </span>
        <button
          className={`absolute top-2 right-2.5 grid h-8 w-8 place-items-center rounded-full bg-[#0b213422] text-white backdrop-blur-[3px] transition-opacity hover:opacity-100 focus-visible:opacity-100 ${
            video.favorite ? "text-[#fff1ca] opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label={`${video.favorite ? "Remove" : "Add"} ${video.name} ${video.favorite ? "from" : "to"} favorites`}
          onClick={() => onFavorite(video)}
        >
          <Star size={16} fill={video.favorite ? "currentColor" : "none"} />
        </button>
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded border border-[#ffffff17] bg-[#0b203b66] px-1.5 py-0.5 text-xs font-medium tracking-wide text-white backdrop-blur-sm">
          {formatDuration(video.duration)}
        </span>
      </div>
      <div className={`min-w-0 flex-1 px-3.5 pt-4 pb-4 ${isList ? "sm:px-4.5" : ""}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          {!isList && (
            <span className="grid h-8.5 w-8 shrink-0 place-items-center rounded-md border border-[#e8eff9] bg-[#f1f5fc] text-[#6a91c7] dark:border-line dark:bg-line dark:text-muted">
              <FileVideo size={17} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <button
              className="mb-1 block w-full truncate p-0 text-left text-sm font-semibold tracking-tight text-[#37485f] hover:text-brand dark:text-ink"
              onClick={() => onPlay(video)}
              title={video.name}
            >
              {video.name}
            </button>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {formatBytes(video.size)}
              <i className="text-[#aab4c1] not-italic">·</i> MP4 video
            </span>
          </div>
          <div className="relative" ref={anchorRef}>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#91a0b6] hover:bg-surfacehover hover:text-brand"
              aria-label={`More options for ${video.name}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-controls={`video-menu-${video.id}`}
              onClick={() => setMenu(!menu)}
            >
              <Ellipsis size={19} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} />
                <div
                  className={`fixed z-50 max-h-[70vh] min-w-44 overflow-auto rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_8px_35px_#20334c15] ${pos ? "" : "invisible"}`}
                  style={pos ? { top: pos.top, left: pos.left } : undefined}
                  id={`video-menu-${video.id}`}
                  role="menu"
                  ref={menuRef}
                >
                  {menuItems.map(({ icon: Icon, label, action, className }) => (
                    <button
                      key={label}
                      role="menuitem"
                      className={`flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-xs whitespace-nowrap hover:bg-surfacehover ${className ?? ""}`}
                      onClick={() => {
                        setMenu(false);
                        action(video);
                      }}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {video.note && (
          <button
            className="mt-3 flex w-full items-start gap-1.5 bg-none p-0 text-left text-xs leading-relaxed text-muted hover:text-brand"
            onClick={() => onNote(video)}
            aria-label={`Edit note for ${video.name}`}
          >
            <NotebookPen size={14} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2 overflow-hidden wrap-anywhere whitespace-pre-wrap">
              {video.note}
            </span>
          </button>
        )}
        {video.tags?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Tags for ${video.name}`}>
            {video.tags.slice(0, 4).map((tag) => (
              <button
                key={tag.id || tag.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-brandlight px-2.5 py-1 text-xs leading-normal font-semibold text-brand"
                onClick={() => onTagClick?.(tag, video)}
                title={`Filter by ${tag.name}`}
              >
                {tag.name}
              </button>
            ))}
            {video.tags.length > 4 && (
              <button
                className="inline-flex items-center gap-1.5 rounded-full bg-surfacehover px-2.5 py-1 text-xs leading-normal font-semibold text-muted"
                onClick={() => onTags(video)}
                title="Edit tags"
              >
                +{video.tags.length - 4}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
