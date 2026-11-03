// Remove only storage created by previous Frame versions, preserving other apps.
export async function clearLegacyLocalData(browser = window) {
  for (const name of ["localStorage", "sessionStorage"]) {
    const storage = browser[name];
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    );
    for (const key of keys) {
      if (key?.startsWith("frame-")) storage.removeItem(key);
    }
  }
  await new Promise((resolve, reject) => {
    const request = browser.indexedDB.deleteDatabase("frame-workspace-v1");
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error("Could not remove the old local library. Reload to retry."),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other Frame tabs and reload to finish removing the old local library.",
        ),
      );
  });
}
