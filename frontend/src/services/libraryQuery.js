export function libraryQuery(pathname, query, search = "", sort = "newest") {
  if (pathname !== "/videos") {
    return { filter: "all", page: 1, search: "", sort: "newest" };
  }
  const params = new URLSearchParams(query);
  const page = Number(params.get("page"));
  return {
    filter: params.get("filter") === "favorites" ? "favorites" : "all",
    page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
    search,
    sort,
  };
}
