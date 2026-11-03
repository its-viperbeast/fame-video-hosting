import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { api, formatBytes, formatDate } from "../services/api";
import Modal from "./Modal";

export function Player({ video, getSource }) {
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
      const data = await getSource();
      setSource(data);
      setLoading(true);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  useEffect(() => {
    let live = true;
    getSource()
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
  }, [getSource]);
  useEffect(() => {
    if (!source?.expiresAt) return;
    const timeout = setTimeout(
      () => refresh.current(),
      Math.max(1000, new Date(source.expiresAt).getTime() - Date.now() - 60000),
    );
    return () => clearTimeout(timeout);
  }, [source]);
  return (
    <div className="player-wrap">
      <div className="player-screen">
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
            onCanPlay={() => {
              setLoading(false);
            }}
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
          />
        )}
        {loading && !error && (
          <div className="player-loading">
            <LoaderCircle className="spin" size={30} />
            <span>Getting your video ready…</span>
          </div>
        )}
        {error && (
          <div className="player-error">
            <AlertCircle size={30} />
            <p>{error}</p>
            <button
              className="btn secondary"
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
      <div className="player-details">
        <div>
          <h3>{video.name}</h3>
          <p>
            {formatBytes(video.size)} <span>·</span> {formatDate(video.createdAt)}
          </p>
        </div>
        <span className="private-badge">
          <ShieldCheck size={14} />
          Secure playback
        </span>
      </div>
    </div>
  );
}

export default function VideoPlayer({ video, onClose }) {
  const getSource = useCallback(() => api.play(video.id), [video.id]);
  return (
    <Modal title="Video preview" className="player-modal" onClose={onClose}>
      <Player video={video} getSource={getSource} />
    </Modal>
  );
}
