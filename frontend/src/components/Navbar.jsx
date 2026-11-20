import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Cloud,
  CloudUpload,
  KeyRound,
  FolderOpen,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  Tags,
  X,
} from "lucide-react";
import { formatBytes } from "../services/api";
import useDialogFocus from "../hooks/useDialogFocus";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 720px)").matches);
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
    <span className="font-display inline-flex items-center text-3xl leading-none font-extrabold tracking-tighter text-heading">
      <span className="relative mr-2.5 inline-block h-8 w-8 -rotate-7">
        <span className="absolute top-1 left-0 block h-6 w-4 -skew-y-6 rounded bg-[#2b7eeb]" />
        <span className="absolute top-0.5 left-2 block h-6 w-4 -skew-y-6 rounded bg-[#5a9bf2]" />
        <span className="absolute top-0 left-4 block h-6 w-4 -skew-y-6 rounded bg-[#90bbf7]" />
      </span>
      frame<span className="text-brand">.</span>
    </span>
  );
}

export function Sidebar({ stats, open, onClose, onLogout, onLock, dark, onTheme }) {
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const sidebar = useRef(null);
  useDialogFocus(sidebar, mobile && open, onClose);

  const links = [
    { to: "/", icon: LayoutGrid, label: "Overview" },
    { to: "/videos", icon: FolderOpen, label: "All videos", count: stats.total },
    { to: "/tags", icon: Tags, label: "Tags" },
    { to: "/upload", icon: CloudUpload, label: "Upload videos" },
    { to: "/change-password", icon: KeyRound, label: "Change password" },
  ];

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[#091c3455] backdrop-blur-[3px] md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sidebar}
        tabIndex={-1}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Workspace navigation"
        id="primary-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-40 flex w-57 flex-col border-r border-line bg-surface px-5 pt-8 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        inert={mobile && !open ? true : undefined}
        aria-hidden={mobile && !open ? "true" : undefined}
      >
        <div className="flex items-center justify-between px-3 pb-8">
          <Link to="/" onClick={onClose} aria-label="Frame home">
            <Brand />
          </Link>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand md:hidden"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="grid gap-1.5" aria-label="Main navigation">
          {links.map(({ to, icon: Icon, label, count }) => {
            const active = pathname === to;
            return (
              <Link
                to={to}
                key={label}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brandlight font-semibold text-brand"
                    : "text-muted hover:bg-surfacehover hover:text-brand"
                }`}
              >
                {active && (
                  <span
                    className="absolute top-1/2 -left-5 h-5 w-[3px] -translate-y-1/2 rounded bg-brand"
                    aria-hidden="true"
                  />
                )}
                <Icon size={19} />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span
                    className={`rounded px-1.5 py-px text-xs leading-4 tabular-nums ${
                      active ? "bg-[#dceaff] text-brand" : "bg-[#f0f3f7] text-muted dark:bg-line"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-8">
          <div className="mb-4 overflow-hidden rounded-lg border border-line bg-gradient-to-br from-surface to-surfacehover p-3.5 pb-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                <Cloud size={17} className="text-[#7b8da5]" />
                Your storage
              </span>
              <span className="inline-flex items-center rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted">
                Unlimited
              </span>
            </div>
            <p className="mt-2.5 mb-3 text-xs text-muted">
              <strong className="font-medium text-[#67768d] dark:text-muted">
                {formatBytes(stats.size, 2)}
              </strong>{" "}
              used
            </p>
          </div>
          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surfacehover hover:text-brand"
            aria-pressed={dark}
            onClick={onTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            <span className="flex-1 text-left">{dark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surfacehover hover:text-brand"
            onClick={() => {
              onClose();
              onLock();
            }}
          >
            <Lock size={17} />
            <span className="flex-1 text-left">Lock</span>
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surfacehover hover:text-brand"
            onClick={onLogout}
          >
            <LogOut size={17} />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

const pageTitles = {
  "/videos": "All videos",
  "/tags": "Tags",
  "/upload": "Upload videos",
  "/change-password": "Change password",
};

export function Header({ onMenu, menuOpen, onLock }) {
  const { pathname, search } = useLocation();
  const favorites =
    pathname === "/videos" && new URLSearchParams(search).get("filter") === "favorites";
  const title = favorites ? "Favorites" : pageTitles[pathname] || "Overview";
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Frame`;
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-5 sm:px-8">
      <div className="flex items-center gap-3.5 text-xs text-muted">
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand md:hidden"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
          onClick={onMenu}
        >
          <Menu size={21} />
        </button>
        <strong className="font-semibold text-[#33415a] dark:text-muted">{title}</strong>
      </div>
      <button
        className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-surfacehover hover:text-brand"
        type="button"
        aria-label="Lock"
        onClick={onLock}
      >
        <Lock size={18} />
        <span className="hidden sm:inline">Lock</span>
      </button>
    </header>
  );
}
