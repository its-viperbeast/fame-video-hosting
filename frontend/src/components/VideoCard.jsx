import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Ellipsis,
  FileVideo,
  ImageUp,
  NotebookPen,
  Pencil,
  Play,
  Shield,
  Star,
  Trash2,
} from "lucide-react";
import { api, formatBytes, formatDate, formatDuration } from "../services/api";
const imageState = (src) => ({ for: src, src, renewed: false, failed: false });
function Thumbnail({ video }) {
  const ref = useRef(null),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false),
    [image, setImage] = useState(() => imageState(video.thumbnailUrl));
  // A replaced thumbnail has a new URL, so the card starts fresh instead of showing a cached image.
  if (image.for !== video.thumbnailUrl)
    setImage(imageState(video.thumbnailUrl));
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
        setImage((prev) =>
          prev.for === current ? { ...prev, src: fresh.thumbnailUrl } : prev,
        ),
      )
      .catch(() =>
        setImage((prev) =>
          prev.for === current ? { ...prev, failed: true } : prev,
        ),
      );
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
    <span className="thumbnail-fallback">
      <FileVideo size={44} />
    </span>
  );
  return (
    <span ref={ref} className="thumbnail-image">
      {video.thumbnailUrl ? (
        image.src && !image.failed ? (
          <img src={image.src} alt="" loading="lazy" onError={imageError} />
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
  onFavorite,
  onThumbnail,
  onRename,
  onNote,
  selected,
  onSelect,
  view,
  selectable = true,
}) {
  const [menu, setMenu] = useState(false),
    [dropUp, setDropUp] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (event) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) {
      setDropUp(false);
      return;
    }
    const node = menuRef.current;
    if (!node || dropUp) return;
    const { bottom } = node.getBoundingClientRect();
    if (bottom > window.innerHeight - 12) setDropUp(true);
  }, [menu, dropUp]);

  return (
    <article
      className={`video-card ${selected ? "selected" : ""} ${view === "list" ? "list-card" : ""}`}
    >
      <div className="thumbnail">
        <button
          className="thumbnail-button"
          aria-label={`Play ${video.name}`}
          onClick={() => onPlay(video)}
        >
          <Thumbnail video={video} />
          <span className="thumbnail-shade" />
          <span className="play-circle">
            <Play size={21} fill="currentColor" />
          </span>
        </button>
        {selectable && (
          <button
            className={`video-select ${selected ? "checked" : ""}`}
            aria-label={`Select ${video.name}`}
            aria-pressed={selected}
            onClick={() => onSelect(video.id)}
          >
            {selected && <Check size={13} />}
          </button>
        )}
        <span className="format-tag">MP4</span>
        <button
          className={`favorite-button ${video.favorite ? "is-favorite" : ""}`}
          aria-label={`${video.favorite ? "Remove" : "Add"} ${video.name} ${video.favorite ? "from" : "to"} favorites`}
          onClick={() => onFavorite(video)}
        >
          <Star size={16} fill={video.favorite ? "currentColor" : "none"} />
        </button>
        <span className="duration-tag">{formatDuration(video.duration)}</span>
      </div>
      <div className="video-content">
        <div className="video-title-row">
          <span className="file-type-icon">
            <FileVideo size={17} />
          </span>
          <div className="video-name-wrap">
            <button
              className="video-title"
              onClick={() => onPlay(video)}
              title={video.name}
            >
              {video.name}
            </button>
            <span>
              {formatBytes(video.size)}
              <i>·</i> {video.category || "MP4 video"}
            </span>
          </div>
          <div className="card-menu-anchor">
            <button
              className="icon-btn card-menu-button"
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
                <div
                  className="popover-dismiss"
                  onClick={() => setMenu(false)}
                />
                <div
                  className={`card-menu${dropUp ? " drop-up" : ""}`}
                  id={`video-menu-${video.id}`}
                  role="menu"
                  ref={menuRef}
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onPlay(video);
                    }}
                  >
                    <Play size={15} />
                    Preview video
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onDownload(video);
                    }}
                  >
                    <Download size={15} />
                    Download
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onThumbnail(video);
                    }}
                  >
                    <ImageUp size={15} />
                    {video.thumbnailUrl ? "Change thumbnail" : "Add thumbnail"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onRename(video);
                    }}
                  >
                    <Pencil size={15} />
                    Rename video
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onNote(video);
                    }}
                  >
                    <NotebookPen size={15} />
                    {video.note ? "Edit note" : "Add note"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onFavorite(video);
                    }}
                  >
                    <Star size={15} />
                    {video.favorite
                      ? "Remove from favorites"
                      : "Add to favorites"}
                  </button>
                  <button
                    role="menuitem"
                    className="danger-text"
                    onClick={() => {
                      setMenu(false);
                      onDelete(video);
                    }}
                  >
                    <Trash2 size={15} />
                    Delete video
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {video.note && (
          <button
            className="video-note"
            onClick={() => onNote(video)}
            aria-label={`Edit note for ${video.name}`}
          >
            <NotebookPen size={14} />
            <span>{video.note}</span>
          </button>
        )}
        <div className="video-card-footer">
          <span>
            <CalendarDays size={13} />
            {formatDate(video.createdAt)}
          </span>
          <div>
            <span className="video-access">
              <Shield size={12} />
              Private
            </span>
            <button
              className="icon-btn"
              aria-label={`Download ${video.name}`}
              onClick={() => onDownload(video)}
            >
              <Download size={15} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
