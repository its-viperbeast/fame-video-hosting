// â Ã Â and U+FFFD are leftover bytes from a filename decoded with the wrong
// encoding. The symbols that stick to them (€™, €", Ã©) are the rest of that
// sequence. Brackets, letters, and the site name stay.
const BROKEN =
  /[\u00C2\u00C3\u00E2\uFFFD](?:[\u0080-\u00A9\u00AB-\u00B4\u00B6-\u00B9\u00BB-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122"'`])*/gu;

export function normalizeVideoName(raw: unknown) {
  const original = String(raw ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
  const ext = original.match(/\.mp4$/i)?.[0] ?? "";
  const stem = (ext ? original.slice(0, -ext.length) : original)
    .replace(BROKEN, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^ /, "")
    .slice(0, 180 - ext.length)
    .replace(/ $/, "");
  return stem ? `${stem}${ext}` : "video.mp4";
}
