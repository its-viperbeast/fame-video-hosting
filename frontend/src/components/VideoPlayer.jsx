import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { api, formatBytes, formatDate } from "../services/api";
import Modal from "./Modal";

export default function VideoPlayer({ video, onClose }) {
  const [source, setSource] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const player = useRef(null),
    refresh = useRef(null),
    restore = useRef(null),
    attempts = useRef(0);
  refresh.current = async () => {
    if (player.current)
      restore.current = { time: player.current.currentTime, playing: !player.current.paused };
    setError("");
    try {
      const data = await api.play(video.id);
      setSource(data);
      setLoading(true);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  useEffect(() => {
    let live = true;
    api
      .play(video.id)
      .then((data) => {
        if (live) setSource(data);
      })
      .catch((err) => {
        if (live) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [video.id]);
  useEffect(() => {
    if (!source?.expiresAt) return;
    const timeout = setTimeout(
      () => refresh.current(),
      Math.max(1000, new Date(source.expiresAt).getTime() - Date.now() - 60000),
    );
    return () => clearTimeout(timeout);
  }, [source]);
  return (
    <Modal title="Video preview" className="max-w-[870px]" onClose={onClose}>
      <div className="-m-5 sm:-m-6">
        <div className="relative grid min-h-[250px] place-items-center bg-[#101a28] aspect-video">
          {source && !error && (
            <video
              ref={player}
              src={source.url}
              poster={video.thumbnailUrl}
              controls
              playsInline
              preload="metadata"
              // Play/pause state after a refresh is restored in onLoadedMetadata,
              // which always runs before autoplay can start.
              autoPlay
              onLoadedMetadata={() => {
                if (restore.current) {
                  player.current.currentTime = restore.current.time;
                  if (restore.current.playing) player.current.play().catch(() => {});
                  else player.current.pause();
                  restore.current = null;
                }
              }}
              onCanPlay={() => setLoading(false)}
              onWaiting={() => setLoading(true)}
              onPlaying={() => {
                setLoading(false);
                attempts.current = 0;
              }}
              onError={() => {
                if (attempts.current++ < 1) refresh.current();
                else {
                  setError("This video could not be played. Try refreshing the player.");
                  setLoading(false);
                }
              }}
              className="block h-full max-h-[65vh] w-full object-contain"
            />
          )}
          {loading && !error && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#101a28aa] p-5 text-center text-xs text-[#b7c9e5]">
              <LoaderCircle className="animate-spin" size={30} />
              <span>Getting your video ready…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#101a28] p-5 text-center text-xs text-[#b7c9e5]">
              <AlertCircle size={30} />
              <p>{error}</p>
              <button
                className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap hover:bg-surfacehover"
                onClick={() => {
                  attempts.current = 0;
                  refresh.current();
                }}
              >
                <RefreshCw size={16} />
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 bg-surface px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold wrap-anywhere">{video.name}</h3>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              {formatBytes(video.size)} <span>·</span> {formatDate(video.createdAt)}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-[#73a393]">
            <ShieldCheck size={14} />
            Secure playback
          </span>
        </div>
      </div>
    </Modal>
  );
}
