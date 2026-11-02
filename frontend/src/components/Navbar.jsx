import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Cloud,
  CloudUpload,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { formatBytes } from "../services/api";
import useDialogFocus from "../hooks/useDialogFocus";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return mobile;
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      frame<span className="brand-dot">.</span>
    </span>
  );
}

export function Sidebar({ stats, open, onClose, onLogout, dark, onTheme }) {
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const sidebar = useRef(null);
  useDialogFocus(sidebar, mobile && open, onClose);

  const links = [
    {
      to: "/",
      icon: LayoutGrid,
      label: "Overview",
      active: pathname === "/",
    },
    {
      to: "/videos",
      icon: FolderOpen,
      label: "All videos",
      count: stats.total,
      active: pathname === "/videos",
    },
    {
      to: "/upload",
      icon: CloudUpload,
      label: "Upload videos",
      active: pathname === "/upload",
    },
  ];

  return (
    <>
      {open && (
        <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        ref={sidebar}
        tabIndex={-1}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Workspace navigation"
        id="primary-sidebar"
        className={`sidebar simplified-sidebar ${open ? "is-open" : ""}`}
        inert={mobile && !open ? true : undefined}
        aria-hidden={mobile && !open ? "true" : undefined}
      >
        <div className="sidebar-brand">
          <Link to="/" onClick={onClose} aria-label="Frame home">
            <Brand />
          </Link>
          <button
            className="icon-btn mobile-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {links.map(({ to, icon: Icon, label, count, active }) => (
            <Link
              to={to}
              key={label}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`nav-link ${active ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {count > 0 && <span className="nav-count">{count}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-widget simple-storage-widget">
            <div className="storage-widget-heading">
              <span>
                <Cloud size={17} />
                Your storage
              </span>
              <span className="plan-tag">Unlimited</span>
            </div>
            <p>
              <strong>{formatBytes(stats.size, 2)}</strong> used
            </p>
          </div>
          <button
            className="help-link"
            aria-pressed={dark}
            onClick={onTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            <span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button className="help-link signout-link" onClick={onLogout}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
          <div className="sidebar-footer">
            <ShieldCheck size={13} />
            <span>Private by default</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Header({ onMenu, menuOpen }) {
  const { pathname, search: routeSearch } = useLocation();
  const favorites =
    pathname === "/videos" &&
    new URLSearchParams(routeSearch).get("filter") === "favorites";
  const title = favorites
    ? "Favorites"
    : pathname === "/upload"
      ? "Upload videos"
      : pathname === "/videos"
        ? "All videos"
        : "Overview";
  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <button
          className="icon-btn mobile-menu"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
          onClick={onMenu}
        >
          <Menu size={21} />
        </button>
        <strong>{title}</strong>
      </div>
    </header>
  );
}
