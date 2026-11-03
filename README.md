# Frame — Video Upload & Management

A responsive video workspace with a **React + Vite frontend** and an independent **Bun + Express backend**. Production videos upload directly to a private Backblaze B2 bucket through its S3-compatible API; MongoDB holds verified metadata and upload sessions.

## Quick start: explore the dashboard

Requires Bun 1.2 or newer.

```sh
cd frontend
bun install
bun run dev
```

Open http://localhost:5173. The application requires the configured backend and opens the sign-in page. Follow the setup below, then sign in with your administrator email and password. The frontend never falls back to a demo account or local video storage.

The overview shows workspace totals and the three newest videos. The library supports search, sorting, pagination, favorites, grid/list views, playback, downloads, and deletion. The dedicated `/upload` page supports the upload queue. The retired `/storage`, `/settings`, and `/shared` pages redirect to the library, `/favorites` redirects to the favorites filter, and `/uploads` redirects to `/upload`.

## Run with Backblaze B2 and MongoDB

### 1. Configure MongoDB

Install MongoDB Community and start `mongod`, or create a MongoDB Atlas database with a dedicated database user. For local development:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/video-manager
```

For Atlas, use its `mongodb+srv://...` connection string in the backend environment only. Allow connections from the backend host, use TLS, and grant the database user read/write access only to the selected database. Mongoose creates the video and upload collections and their indexes, including the upload TTL cleanup index. Ensure the deployment user can create these indexes or provision them during deployment.

### 2. Create the Backblaze B2 bucket

1. Create a private B2 bucket. Note its region, for example `us-west-004`.
2. Leave the bucket private. B2 encrypts objects at rest; do not send an AWS `ServerSideEncryption` header. B2 rejects `AES256`.
3. Allow the frontend origin in the bucket CORS settings for `PUT`, `GET`, and `HEAD`. Permit `content-type`, `content-length`, `if-none-match`, `range`, and `x-amz-*`, and expose `ETag`, `Content-Length`, `Content-Range`, and `Accept-Ranges`. Use your exact frontend origin. Do not use `*`.
4. Abort incomplete multipart uploads after one day. Do not use tag-based expiry. B2 lifecycle rules match name prefixes only, and B2 treats `PutObjectTagging` as an overwrite that replaces the object with the tag XML, so the API never tags objects. The API's cleanup worker removes orphaned objects instead (see Operational notes).
5. B2 keeps object versions. Deleting by name only creates a hide marker; the API explicitly lists and permanently deletes every version and marker for the exact video or thumbnail key, then verifies that none remain.
6. Create an application key restricted to this bucket, with `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles` capabilities. Permanent deletion requires `deleteFiles`, and verifying all versions requires `listFiles`. Copy the key ID and the application key. The application key is shown only once.

Set the backend environment to that region and endpoint:

```dotenv
AWS_REGION=us-west-004
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
AWS_S3_BUCKET=your-b2-bucket
AWS_ACCESS_KEY_ID=your-application-key-id
AWS_SECRET_ACCESS_KEY=your-application-key
```

`S3_ENDPOINT` must be `https://s3.<AWS_REGION>.backblazeb2.com`. The browser uploads and plays through presigned URLs on that host. Do not put these keys in the frontend or any `VITE_*` variable, and do not commit `.env`. Do not add OPTIONS to the bucket’s allowed methods.

### 3. Application key scope

The runtime key needs to upload, read, and delete objects under both `videos/` and `thumbnail/`, including multipart uploads. A B2 application key can be limited to only one name prefix, so restrict it to this bucket but leave the prefix empty. Bucket administration stays on a separate key. B2 enforces this through the application key’s bucket and capability limits.

### 4. Configure and start the backend

```sh
cd backend
bun install
cp .env.example .env
bun run password
```

Enter a strong 12–256 character password at the hidden prompt. Copy the printed `AUTH_PASSWORD_HASH` into `.env`. This uses a random salt and scrypt. Configure `AUTH_EMAIL`, MongoDB, and the Backblaze B2 bucket. Generate the session secret:

```sh
bun -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('hex'))"
```

Use the output for `SESSION_SECRET`. Then:

```sh
bun run dev
# Production process:
bun run start
```

The API listens on http://localhost:9090 and starts only after a successful MongoDB connection. Missing or invalid required configuration fails startup instead of silently opening an insecure service.

### 5. Configure and start the frontend

In a second terminal:

```sh
cd frontend
cp .env.example .env
bun install
bun run dev
```

The example sets:

```dotenv
VITE_API_URL=http://localhost:9090/api
VITE_DEMO_MODE=false
VITE_MAX_UPLOAD_BYTES=2147483648
```

Restart Vite after changing `.env`. The first API start stores `AUTH_EMAIL` and `AUTH_PASSWORD_HASH` in the `admins` collection. Sign in with that email and the password you entered. Live-mode failures are shown as errors; the app never silently switches to demo storage. The backend's `MAX_UPLOAD_BYTES` remains authoritative.

For a production frontend build:

```sh
cd frontend
bun run build
bun run preview
```

Serve `frontend/dist` from a static host with SPA fallback to `index.html`. Deploy the Express API independently with Bun, on a host that can reach MongoDB and Backblaze B2. Use HTTPS, `NODE_ENV=production`, the exact production `FRONTEND_URL`, and your production API address. The frontend keeps its signed JWT and sends it in the `Authorization: Bearer` header, so only the origins in `FRONTEND_URL` may call the API; unrelated hosting domains must be added to CORS explicitly. If a trusted reverse proxy terminates TLS, set `TRUST_PROXY` to the exact trusted hop count. Do not blindly trust client-supplied forwarding headers.

`APP_BASE_URL` records the backend's external origin. `FRONTEND_URL` is the browser origin allowed by CORS.

## Features

- Multi-file drag-and-drop upload queue, pre-upload playback and thumbnail inspection, and filename/MIME/size/header validation. Each file shows its own progress bar and percentage, and an overall bar sums transferred bytes. Statuses are Queued, Uploading, Processing (all bytes sent, server still working), Completed, Failed and Cancelled.
- Cancel upload per file and Cancel all. Cancelling never counts as an error, keeps completed uploads, and lets cancelled files be retried. While anything is unfinished, leaving the page asks first: in-app links, Back, and Sign out show a confirmation dialog, and refresh or tab close shows the browser's own prompt.
- Private, immutable UUID object keys. Up to three videos upload concurrently through the API; additional files wait in the queue. Each file keeps its own progress and retry state, and new files or retries can join an active queue.
- The API checks the MP4 container before storing the file.
- Automatic 1920 × 1080 WebP thumbnails from each uploaded video, plus custom thumbnail upload and replacement from the card menu. Images are letterboxed to 16:9 and never stretched. They are stored under `thumbnail/` with unique keys and shown through short-lived signed URLs, or through `MEDIA_BASE_URL` when it is set.
- Owner-scoped management endpoints, search by escaped literal filename, server sorting/pagination, refresh, favorites, total storage and recent-upload statistics.
- Native HTML5 playback controls: play/pause, seeking, volume, and fullscreen, plus a responsive player modal, loading/error feedback, automatic URL renewal, and position restoration.
- Download links, deletion confirmation and bulk deletion, skeletons, empty states, a simplified mobile sidebar, keyboard navigation, modal focus trapping, and persisted dark/light mode.
- Single-administrator authentication with a signed JWT returned at login and sent on every request as an `Authorization: Bearer` header. Every video query is scoped to the authenticated owner. Login and API rate limits, Helmet headers, strict request validation, safe JSON errors, and startup configuration validation.

## Architecture and upload flow

```text
shubh-stream/
├── frontend/
│   ├── src/
│   │   ├── components/  # Navbar, upload queue, cards, gallery, player and dialogs
│   │   ├── pages/       # Dashboard and Upload
│   │   ├── services/   # Axios API, signed uploads and IndexedDB demo adapter
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── config/         # Validated environment, AWS SDK and MongoDB
│   ├── controllers/
│   ├── middleware/     # Bearer-token auth and error handling
│   ├── models/         # Video and Upload
│   ├── routes/
│   ├── scripts/        # Interactive password hashing
│   ├── services/       # S3 signing and object verification
│   ├── test/
│   ├── utils/
│   ├── .env.example
│   ├── app.js
│   ├── server.js
│   └── package.json
└── README.md
```

The workspace root is the `video-manager/` project described in the brief; frontend and backend remain independent applications.

1. React checks MP4 extension, browser MIME when present, size and `ftyp`; reads duration and creates a local poster/preview.
2. React posts the file to `/api/videos/upload` with a random `X-Upload-Id` for that attempt. Multer streams it to a temporary file on disk (never into memory), within `MAX_UPLOAD_BYTES`. The queue shows transfer percentage, then Processing until the server responds.
3. Express checks the MP4 signature and runs the ffmpeg faststart remux. It extracts one frame (10% in, at most 10 s, falling back to the first frame), and sharp encodes it as a 1920 × 1080 WebP.
4. Before writing anything to B2, Express records both new object keys in the cleanup journal. It then uploads the video to `videos/<uuid>.mp4` and the thumbnail to `thumbnail/<uuid>.webp`, confirms the thumbnail with HeadObject, and creates the MongoDB record with both keys. Either way it then settles the journal: referenced keys are kept, and anything unreferenced (after a failure) is deleted. If the client disconnects, ffmpeg and the B2 transfer are aborted.
5. If only the thumbnail fails, the playable video is still saved and the response carries a `warning`. The panel shows it and offers a custom thumbnail.
6. React refreshes the collection. Playback, download, and thumbnail URLs are returned only to the signed-in owner. They are short-lived signed URLs unless `MEDIA_BASE_URL` is set (see Public media links).

**Cancelling.** Cancelling aborts the browser request and posts `/api/videos/upload/:uploadId/cancel`. If the page is reloaded or closed, a `pagehide` keepalive request posts the same cancel. Either a closed connection or the cancel stops the upload. During the transfer, the server drops the request and Multer deletes the partial file. During processing, ffmpeg is killed and the B2 transfer is aborted. Any object already written is deleted through the cleanup journal, and temp files are removed. If the cancel arrives just after the server saved the video, the video is deleted, because the client never showed it as completed. Queued files are never sent. Uploads in this flow are single PUTs, so there are no multipart uploads to abort. The cancel registry is per process: with several API processes, only the connection close reaches a different process.

Video metadata includes ID, name, unique video and thumbnail object keys (server-only), size, MIME type, upload date, owner, duration, and favorite state. Duration is client-reported display metadata; storage size and container checks are verified by the backend. Cards show the stored thumbnail. Videos uploaded before thumbnails existed fall back to an authorized preview frame until a custom thumbnail is added.

### Thumbnail replacement and deletion

- **Replace:** `PUT /api/videos/:id/thumbnail` accepts one JPEG, PNG, or WebP up to `MAX_THUMBNAIL_BYTES`, at least 180 px per side and at most 8192 × 8192. sharp checks the decoded bytes (not the name or MIME type), applies EXIF orientation, strips metadata, and produces the same 1920 × 1080 WebP. The new object is uploaded and confirmed. The record is then switched with a compare-and-swap on the previous key, and only after that succeeds is the old object deleted. Any failure keeps the current thumbnail and removes the new upload. A concurrent replacement gets 409. Each thumbnail has a new key, so its URL changes and browsers never show a stale cached image.
- **Delete:** `DELETE /api/videos/:id` marks the record `deleting` (hidden from the library), lists all versions of the exact stored video and thumbnail keys (including paginated results), permanently deletes the file versions followed by hide markers using their `VersionId`, and verifies that no versions or markers remain before removing the record. Prefix-matching neighbors are never deleted. Already-missing objects count as deleted. If storage, permissions, or verification fails partway, the record stays `deleting` and the API returns 503 `DELETE_INCOMPLETE`. Retrying the request is safe, and the cleanup worker also retries automatically.

## REST API

All responses use one of:

```json
{ "success": true, "data": { "example": "value" } }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Safe human-readable message",
    "requestId": "request-uuid"
  }
}
```

Success payloads below are inside `data`. Typical errors are 400 validation, 401 authentication, 404 missing/expired or unowned resources, 409 concurrent upload state, 413 size limits, 415 invalid MP4, 422 object mismatch, 429 rate limiting, and safe 500 upstream/service failures. Rate limit responses use the same success/error envelope, without request IDs.

| Method | Endpoint                              | Access / purpose                                       |
| ------ | ------------------------------------- | ------------------------------------------------------ |
| POST   | `/api/auth/login`                     | Public, rate limited; returns a bearer token           |
| GET    | `/api/auth/me`                        | Current authenticated administrator                    |
| POST   | `/api/auth/logout`                    | Acknowledges sign-out; the client drops its token      |
| POST   | `/api/videos/upload`                  | Authenticated, multipart `file` + `duration`; store video and thumbnail |
| POST   | `/api/videos/upload/:uploadId/cancel` | Authenticated; stop that upload, or remove it if it just finished |
| POST   | `/api/videos/validate`                | Authenticated, multipart `header` sample ≤4 KiB        |
| GET    | `/api/videos`                         | Authenticated, list/filter/sort/page plus statistics   |
| GET    | `/api/videos/:id`                     | Authenticated, owned video details                     |
| GET    | `/api/videos/:id/play`                | Authenticated, signed playback URL                     |
| GET    | `/api/videos/:id/download`            | Authenticated, signed attachment URL                   |
| PATCH  | `/api/videos/:id`                     | Authenticated, set `{ "favorite": true }`              |
| PUT    | `/api/videos/:id/thumbnail`           | Authenticated, multipart `thumbnail`; replace thumbnail |
| DELETE | `/api/videos/:id`                     | Authenticated, delete video, thumbnail and metadata    |
| GET    | `/api/health`                         | Public, database readiness; 200 or 503                 |

### Authentication example

Sign in to get a signed JWT, then send it as `Authorization: Bearer <token>` on every authenticated request:

```sh
curl -X POST http://localhost:9090/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@example.com","password":"your-admin-password"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "user": { "email": "admin@example.com", "name": "admin", "role": "admin" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

The token expires after eight hours. The examples below use `TOKEN` for the value from `data.token`.

### Saved video

`POST /api/videos/upload` returns HTTP 201. `data.video` looks like:

```json
{
  "success": true,
  "data": {
    "video": {
      "id": "690000000000000000000002",
      "name": "Alpine escape.mp4",
      "note": "",
      "size": 10485760,
      "duration": 154,
      "favorite": false,
      "createdAt": "2026-11-02T09:02:00.000Z"
    }
  }
}
```

### List, playback and download

```sh
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:9090/api/videos?search=Alpine&sort=newest&page=1&limit=6&filter=all'
curl -H "Authorization: Bearer $TOKEN" http://localhost:9090/api/videos/VIDEO_ID/play
curl -H "Authorization: Bearer $TOKEN" http://localhost:9090/api/videos/VIDEO_ID/download
```

List `data` contains `videos`, `pagination: {page, limit, total, pages}`, `stats: {total, size, favorites, recent}`, `maxUploadBytes`, and `maxThumbnailBytes`. Supported sorts: `newest`, `oldest`, `name`, `size`. Supported filters: `all`, `recent` (24 hours), and `favorites`. Maximum page size is 48. Search treats regex characters literally.

Playback/download `data`:

```json
{
  "url": "https://private-s3-signed-url...",
  "expiresAt": "2026-11-02T09:17:00.000Z"
}
```

With `MEDIA_BASE_URL` set, playback returns `{ "url": "https://serve.octastream.online/videos/<uuid>.mp4" }` with no `expiresAt`, and `thumbnailUrl` is `https://serve.octastream.online/thumbnail/<uuid>.webp`.

### Public media links

`MEDIA_BASE_URL` (for example `https://serve.octastream.online`) makes playback and thumbnail URLs `<MEDIA_BASE_URL>/<object key>`. The origin must serve the bucket's objects at their keys, with Range support for seeking. Downloads stay signed so the response can force `Content-Disposition: attachment` with the video's name. A cross-origin link cannot do that.

These links are public and permanent. Anyone who has one can watch the video or load the thumbnail without signing in; the random UUID keys only make them hard to guess. The CDN also caches responses (Cloudflare currently sends `Cache-Control: max-age=14400`), so after a video is deleted from B2, its files can still be served from the edge cache until that copy expires. Purge the cache on deletion, or shorten the TTL, if deleted media must disappear immediately. Each replaced thumbnail has a new key, so the panel never shows a stale image.

Download URLs use `Content-Disposition: attachment` with an encoded filename. The API never redirects to an arbitrary client-supplied URL.

### Rename, notes and favorites

Use the video card menu to choose **Rename video** or **Add note** / **Edit note**. Notes appear on the video card; clear a note and save to remove it. Names and notes are saved only in MongoDB. Renaming does not move, copy, or rewrite the stored video or thumbnail.

```sh
curl -X PATCH http://localhost:9090/api/videos/VIDEO_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Wedding highlights","note":"Review the ending."}'
```

The PATCH endpoint accepts any nonempty combination of `name` (1–180 characters), `note` (up to 5,000 characters, or `""` to clear), and `favorite` (boolean). Names and notes are trimmed. Names reject control characters and path separators; display names do not need an `.mp4` extension. All edits require an authenticated owner and a ready video. The response contains `data.video` with the saved metadata.

### Delete

```sh
curl -X DELETE http://localhost:9090/api/videos/VIDEO_ID \
  -H "Authorization: Bearer $TOKEN"
```

Response: `{"success":true,"data":{"deleted":true,"id":"VIDEO_ID"}}`.

## Configuration reference

| Variable                     | Default / meaning                                                    |
| ---------------------------- | -------------------------------------------------------------------- |
| `MAX_UPLOAD_BYTES`           | 2 GiB per video; validated maximum is 5 GiB                          |
| `MAX_THUMBNAIL_BYTES`        | 10 MiB per custom thumbnail image; validated maximum is 25 MiB       |
| `PRESIGNED_URL_TTL_SECONDS`  | 900; allowed 60–3600                                                 |
| `MEDIA_BASE_URL`             | Unset; optional https origin for public playback and thumbnail links |
| `SESSION_SECRET`             | Required, random 32+ character signing secret                        |
| `AUTH_EMAIL`                 | Seeds the `admins` collection when it is empty                       |
| `AUTH_PASSWORD_HASH`         | Initial scrypt hash stored on that admin                             |
| `FRONTEND_URL`               | Allowed browser origin                                               |
| `APP_BASE_URL`               | External backend origin                                              |
| `TRUST_PROXY`                | 0 by default; exact number of trusted proxy hops                     |

## Verification

```sh
cd frontend
bun run build
bun run test

cd ../backend
bun run test
```

The frontend tests verify bounded concurrent uploads, independent progress, failure isolation, retries during active uploads, queued-file removal, aborting transfers on cleanup, processing and cancelled states, cancel all, retry after cancel, byte-weighted overall progress, thumbnail file checks, and delete retries. The backend tests cover authentication, bearer-token permissions and expiry, ownership scoping, strict metadata validation, safe error envelopes, MP4 signatures, Multer buffer limits, exact object verification, and conditional signed PUTs. They also cover 1080p WebP letterboxing, content-based image validation, thumbnail replacement ordering, failed and racing replacements, deletion with missing objects and partial failures, upload rollback, cancelling during transfer and processing, cancels that race with completion, and the cleanup worker. The ingest and frame tests run the local ffmpeg and are skipped without it. These tests do not require live MongoDB or incur S3 costs. A real B2/MongoDB integration smoke test still requires your own configured services.

For that smoke test: sign in and upload an MP4. Check that `videos/<uuid>.mp4` holds the full file (not 170 bytes of XML) and that `thumbnail/<uuid>.webp` is 1920 × 1080. Replace the thumbnail from the card menu and confirm the old `thumbnail/` object is gone. Try a renamed non-image and confirm the current thumbnail stays. Play, seek, and download. Delete the video and confirm both objects and the record are removed. Check playback renewal with a short configured URL TTL. Verify that anonymous management requests are rejected and that a renamed non-MP4 file cannot complete verification.

For an opt-in check against the configured real services, run `cd backend` then `bun run test:delete-live`. It creates UUID-named sample video versions, a hide marker, a thumbnail, and one MongoDB record; calls the authenticated delete endpoint; checks version listings, object 404 responses, and database removal; and cleans up only those test fixtures. It requires the bucket capabilities listed above and uses the bundled sample MP4.

## Operational notes

- All three MongoDB models disable Mongoose's `__v` version field for new writes. To remove it from existing app records, run `cd backend` then `bun run db:remove-version-keys` using the configured `MONGODB_URI`. This idempotent migration only unsets `__v` in `videos`, `uploads`, and `storagecleanups`; other fields and stored objects are unchanged.
- This is a single-admin workspace, not public registration. For multiple users or organizations, integrate an identity provider and membership authorization, retaining owner checks on every data path.
- The API validates a bounded MP4 container signature, not an entire codec stream. Add isolated media decoding, transcoding, malware scanning and moderation jobs if your deployment accepts untrusted public media. No codec compatibility can be inferred from `.mp4` alone.
- Storage writes and MongoDB commits cannot share a transaction. Every object key is recorded in the `storagecleanups` collection before it is written. A cleanup worker in each API process runs at startup and every five minutes. It deletes tracked objects that no ready video references once they are due (24 hours for in-flight uploads, five minutes for failed cleanups). It finishes deletions stuck in `deleting` for over ten minutes and removes upload temp files older than a day. A crash at any point therefore leaves at most a tracked object that is removed later. Workers in several processes claim entries atomically. The presigned flow keeps its conditional writes, completion leases, and idempotent upserts. B2 lifecycle rules should still abort incomplete multipart uploads.
- Configure an AWS budget and alerts. Signed content lengths and verification enforce per-file limits. Storage is not capped by the API.
- Apply stricter upload-creation budgets if exposed to more administrators. Replace in-memory rate-limit storage with a shared store when running multiple API processes.
- Signing out drops the stored token in the client; existing JWTs stay valid until they expire after eight hours. Rotate the session secret to invalidate all sessions. Use a revocable session store if immediate per-session revocation is required.
- The app does not provide third-party billing or subscription upgrades. The Free/100 GB labels describe the starter's display configuration.
- Restrict API access logs so bearer tokens and presigned URLs are never logged. Treat playback URLs as bearer credentials; with `MEDIA_BASE_URL` they never expire.
- Font files and demo poster images load from Google Fonts and Unsplash. Host approved assets yourself when your deployment requires no third-party asset requests. The bundled `frontend/public/sample.mp4` is the [MDN CC0 flower video](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4). All sample cards use this same illustrative clip.
