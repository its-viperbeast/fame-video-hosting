import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { getToken, setToken, clearToken } from "../src/services/authToken.js";

const key = "frame.auth.token";

function installStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  clearToken();
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  return storage;
}

test("clearing storage from another tab does not restore the in-memory token", (t) => {
  const storage = installStorage(t);
  setToken("signed-in-token");
  storage.removeItem(key);
  assert.equal(getToken(), "");
});

test("a token can be replaced and cleared when storage is unavailable", (t) => {
  const storage = installStorage(t);
  for (const method of ["getItem", "setItem", "removeItem"])
    t.mock.method(storage, method, () => {
      throw new Error("Storage is unavailable");
    });
  setToken("first-token");
  assert.equal(getToken(), "first-token");
  setToken("new-token");
  assert.equal(getToken(), "new-token");
  clearToken();
  assert.equal(getToken(), "");
});

test("a failed storage write does not reuse a previous stored token", (t) => {
  const storage = installStorage(t);
  setToken("old-token");
  t.mock.method(storage, "setItem", () => {
    throw new Error("Storage is full");
  });
  setToken("new-token");
  assert.equal(getToken(), "new-token");
  clearToken();
  assert.equal(storage.getItem(key), null);
  assert.equal(getToken(), "");
});

test("logout clears the token immediately without waiting for the backend", async (t) => {
  installStorage(t);
  const previous = axios.defaults.adapter;
  let requests = 0;
  axios.defaults.adapter = () => {
    requests++;
    return new Promise(() => {});
  };
  t.after(() => {
    axios.defaults.adapter = previous;
  });
  const { api } = await import("../src/services/api.js");
  setToken("signed-in-token");
  api.logout();
  assert.equal(getToken(), "");
  await Promise.resolve();
  assert.equal(requests, 0);
});
