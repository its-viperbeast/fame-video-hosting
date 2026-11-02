import test from "node:test";
import assert from "node:assert/strict";
import { libraryQuery } from "../src/services/libraryQuery.js";

test("overview always requests the latest videos across the full library", () => {
  assert.deepEqual(
    libraryQuery("/", "?filter=favorites&page=3", "old search", "name"),
    {
      filter: "all",
      page: 1,
      search: "",
      sort: "newest",
    },
  );
});

test("returning from upload keeps the requested library filter, page and sort", () => {
  assert.deepEqual(
    libraryQuery("/videos", "?filter=favorites&page=2", "trip", "size"),
    {
      filter: "favorites",
      page: 2,
      search: "trip",
      sort: "size",
    },
  );
  assert.deepEqual(libraryQuery("/videos", "?filter=recent", "", "newest"), {
    filter: "all",
    page: 1,
    search: "",
    sort: "newest",
  });
});

test("malformed pagination and unknown filters cannot produce invalid API requests", () => {
  for (const page of [
    "",
    "-1",
    "0",
    "1.5",
    "NaN",
    "Infinity",
    "100001",
    "9007199254740992",
  ]) {
    const query = libraryQuery("/videos", `?page=${page}&filter=unknown`);
    assert.equal(query.page, 1);
    assert.equal(query.filter, "all");
  }
});
