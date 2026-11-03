import { useCallback, useEffect, useRef, useState } from "react";

import {
  createBrowserRouter,
  Navigate,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { api } from "./services/api";
import { libraryQuery } from "./services/libraryQuery";
import { Brand, Header, Sidebar } from "./components/Navbar";
import VideoUpload from "./components/VideoUpload";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import ChangePassword from "./pages/ChangePassword";

const initialStats = {
  total: 0,
  size: 0,
  recent: 0,
  favorites: 0,
};

function Workspace({ dark, onTheme, onSignedOut, onLogout }) {
  const location = useLocation();
  const [data, setData] = useState(null),
    [stats, setStats] = useState(initialStats),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [sort, setSort] = useState("newest"),
    [mobileNav, setMobileNav] = useState(false),
    [dropFiles, setDropFiles] = useState(null);
  const navigate = useNavigate(),
    params = useRef(libraryQuery(location.pathname, location.search)),
    requestId = useRef(0),
    // Set by the uploader while uploads are unfinished, so signing out asks first.
    leaveGuard = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 220);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    const key = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        if (document.querySelector('[aria-modal="true"]')) return;
        const input = document.querySelector(
          ".library-search input, .overview-search input",
        );
        // Pages without a search box keep the browser's native shortcut.
        if (!input) return;
        event.preventDefault();
        input.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const refresh = useCallback(
    async (next, { silent = false } = {}) => {
      if (next) params.current = next;
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      setError("");
      try {
        const result = await api.list(params.current);
        if (id !== requestId.current) return;
        setData(result);
        setStats(result.stats);
      } catch (err) {
        if (id !== requestId.current) return;
        if (err.status === 401) {
          onSignedOut();
          return;
        }
        setError(err.message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [onSignedOut],
  );

  useEffect(() => {
    refresh(libraryQuery(location.pathname, location.search, debounced, sort));
  }, [refresh, location.pathname, location.search, debounced, sort]);

  useEffect(() => {
    if (loading || location.pathname !== "/videos" || !data?.pagination) return;
    const { page, pages } = data.pagination;
    if (
      page <= pages ||
      page !== libraryQuery(location.pathname, location.search).page
    )
      return;
    const query = new URLSearchParams(location.search);
    query.set("page", String(pages));
    navigate(`/videos?${query}`, { replace: true });
  }, [data, loading, location.pathname, location.search, navigate]);

  function globalSearch(value) {
    setSearch(value);
    if (location.pathname !== "/videos") navigate("/videos");
    else if (new URLSearchParams(location.search).has("page")) {
      const query = new URLSearchParams(location.search);
      query.delete("page");
      navigate(`${location.pathname}?${query.toString()}`, { replace: true });
    }
  }

  function globalSort(value) {
    setSort(value);
    if (new URLSearchParams(location.search).has("page")) {
      const query = new URLSearchParams(location.search);
      query.delete("page");
      navigate(`${location.pathname}?${query.toString()}`, { replace: true });
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        stats={stats}
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        onLogout={() =>
          leaveGuard.current ? leaveGuard.current(onLogout) : onLogout()
        }
        dark={dark}
        onTheme={onTheme}
      />
      <div className="main-shell">
        <Header onMenu={() => setMobileNav(true)} menuOpen={mobileNav} />
        <main className="main-content" id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/upload" element={<Upload />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route
              path="/storage"
              element={<Navigate to="/videos" replace />}
            />
            <Route
              path="/settings"
              element={<Navigate to="/videos" replace />}
            />
            <Route
              path="/favorites"
              element={<Navigate to="/videos?filter=favorites" replace />}
            />
            <Route path="/shared" element={<Navigate to="/videos" replace />} />
            <Route
              path="/uploads"
              element={<Navigate to="/upload" replace />}
            />
            <Route
              path="*"
              element={
                <Dashboard
                  search={search}
                  sort={sort}
                  onSort={globalSort}
                  onSearch={globalSearch}
                  data={data}
                  stats={stats}
                  loading={loading}
                  error={error}
                  onRefresh={refresh}
                  onUpload={() => navigate("/upload")}
                  onDrop={(files) => {
                    setDropFiles(Array.from(files));
                    navigate("/upload");
                  }}
                />
              }
            />
          </Routes>
          <VideoUpload
            open={location.pathname === "/upload"}
            onUploaded={() => refresh()}
            maxSize={
              data?.maxUploadBytes ||
              Number(import.meta.env.VITE_MAX_UPLOAD_BYTES) ||
              2 * 1024 ** 3
            }
            droppedFiles={dropFiles}
            onDropConsumed={() => setDropFiles(null)}
            leaveGuard={leaveGuard}
          />
        </main>
      </div>
    </div>
  );
}

function Root() {
  const [dark, setDark] = useState(
      () => document.documentElement.dataset.theme === "dark",
    ),
    [auth, setAuth] = useState("checking"),
    [authError, setAuthError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }, [dark]);

  useEffect(() => {
    let live = true;
    api
      .me()
      .then(() => {
        if (live) setAuth("in");
      })
      .catch((err) => {
        if (!live) return;
        setAuth("out");
        if (err.status !== 401) setAuthError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);

  const signedOut = useCallback(() => {
    api.logout();
    setAuth("out");
  }, []);

  return (
    <>
      {auth === "checking" ? (
        <div className="app-loading">
          <Brand />
          <LoaderCircle className="spin" size={24} />
          <p>Opening your workspace…</p>
        </div>
      ) : (
        <Routes>
          <Route
            path="/login"
            element={
              auth === "in" ? (
                <Navigate to="/" replace />
              ) : (
                <Login
                  initialError={authError}
                  onSuccess={() => {
                    setAuthError("");
                    setAuth("in");
                  }}
                />
              )
            }
          />
          <Route
            path="*"
            element={
              auth === "in" ? (
                <Workspace
                  dark={dark}
                  onTheme={() => setDark(!dark)}
                  onSignedOut={signedOut}
                  onLogout={signedOut}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      )}
      <ToastContainer
        position="top-right"
        autoClose={3500}
        hideProgressBar
        theme={dark ? "dark" : "light"}
        toastClassName="frame-toast"
        newestOnTop
        closeOnClick
      />
    </>
  );
}

// The upload page blocks navigation with useBlocker, which needs a data router.
// One splat route keeps the existing <Routes> tree unchanged.
const router = createBrowserRouter([{ path: "*", element: <Root /> }]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
