import axios from "axios";
import { getToken, setToken, clearToken } from "./authToken";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:9090/api",
  timeout: 30000,
});
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// Used when a proxy or timeout answers without the API's error envelope.
const fallbackMessages = {
  ERR_NETWORK: "Cannot reach the server. Check your connection and backend configuration.",
  ECONNABORTED: "The server took too long to respond. Please try again.",
  ERR_CANCELED: "Upload cancelled.",
  413: "This file is larger than the upload limit.",
  502: "The server is temporarily unavailable. Please try again.",
  503: "The server is temporarily unavailable. Please try again.",
  504: "The server took too long to respond. Please try again.",
};
http.interceptors.response.use(
  (r) => r.data.data,
  (error) => {
    const e = new Error(
      error.response?.data?.error?.message ||
        fallbackMessages[error.response?.status] ||
        fallbackMessages[error.code] ||
        error.message,
    );
    e.status = error.response?.status;
    e.code = error.response?.data?.error?.code;
    return Promise.reject(e);
  },
);

const percent = (event) => Math.min(100, Math.floor((event.loaded / event.total) * 100));

// Upload IDs with a request in flight. If the page is closed or reloaded, the
// browser drops those requests; a keepalive request also asks the server to
// stop them.
const inflight = new Set();

const cancelPath = (id) => `/videos/upload/${id}/cancel`;

if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    // sendBeacon cannot set an Authorization header, so use a keepalive fetch,
    // which survives the page being unloaded.
    const token = getToken();
    for (const id of inflight)
      fetch(`${http.defaults.baseURL}${cancelPath(id)}`, {
        method: "POST",
        keepalive: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
  });
export const api = {
  me: () => http.get("/auth/me"),
  login: async (email, password) => {
    const data = await http.post("/auth/login", { email, password });
    setToken(data.token);
    return data;
  },
  // Changing the password rotates the session, so the new token replaces the old.
  changePassword: async (currentPassword, newPassword) => {
    const data = await http.post("/auth/change-password", { currentPassword, newPassword });
    if (data?.token) setToken(data.token);
    return data;
  },
  logout: clearToken,
  list: (params) => http.get("/videos", { params }),
  details: (id) => http.get(`/videos/${id}`),
  play: (id) => http.get(`/videos/${id}/play`),
  download: (id) => http.get(`/videos/${id}/download`),
  remove: (id) => http.delete(`/videos/${id}`),
  favorite: (id, favorite) => http.patch(`/videos/${id}`, { favorite }),
  update: (id, metadata) => http.patch(`/videos/${id}`, metadata),
  // Progress covers the transfer. At 100% the server is still preparing the
  // video and thumbnail; the request resolves with { video, warning } when both are stored.
  upload(file, metadata, progress, signal) {
    const uploadId = crypto.randomUUID();
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("duration", String(metadata.duration || 0));
    // Aborting stops the transfer. The explicit cancel also stops server work a
    // proxy may keep running, and removes an upload that finished just before.
    signal?.addEventListener(
      "abort",
      () => {
        inflight.delete(uploadId);
        http.post(cancelPath(uploadId)).catch(() => {});
      },
      { once: true },
    );
    inflight.add(uploadId);
    return http
      .post("/videos/upload", form, {
        signal,
        timeout: 0,
        headers: { "X-Upload-Id": uploadId },
        onUploadProgress: (event) => {
          if (!event.total) return;
          // The multipart body is a little larger than the file itself.
          const ratio = Math.min(1, event.loaded / event.total);
          progress(percent(event), Math.round(file.size * ratio));
        },
      })
      .finally(() => inflight.delete(uploadId));
  },
  replaceThumbnail(id, file, progress) {
    const form = new FormData();
    form.append("thumbnail", file, file.name);
    return http.put(`/videos/${id}/thumbnail`, form, {
      timeout: 120000,
      onUploadProgress: (event) => {
        if (event.total) progress?.(percent(event));
      },
    });
  },
};

export function formatBytes(bytes, decimals = 1) {
  if (!bytes) return "0 B";
  const unit = Math.max(0, Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? decimals : 0)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}

export const formatDuration = (s = 0) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export async function inspectVideo(file) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (header.length < 16 || String.fromCharCode(...header.slice(4, 8)) !== "ftyp")
    throw new Error(`${file.name} is not a valid MP4 file.`);
  return new Promise((resolve) => {
    const video = document.createElement("video"),
      url = URL.createObjectURL(file);
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    const done = (metadata) => {
      clearTimeout(timer);
      video.onerror = null;
      video.onloadeddata = null;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(metadata);
    };
    const timer = setTimeout(() => done({ duration: 0 }), 8000);
    video.onerror = () => done({ duration: 0 });
    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = Math.round((640 * video.videoHeight) / (video.videoWidth || 640)) || 360;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      done({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        poster: canvas.toDataURL("image/jpeg", 0.75),
      });
    };
  });
}
