import { useState, useEffect } from "react";
import { Settings, BookOpen, Search, FilePlus } from "lucide-react";
import type { Project } from "../hooks/useProjects";
import { useSettingsStore } from "../settingsStore";

export type AppView = "home" | "workspace" | "resources" | "settings" | "account";

interface Props {
  view: AppView;
  activeProjectId: string | null;
  projects: Project[];
  onNavigate: (view: AppView) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onOpenSearch?: () => void;
}

interface ContextMenu {
  projectId: string;
  x: number;
  y: number;
}

export default function Sidebar({
  view,
  activeProjectId,
  projects,
  onNavigate,
  onSelectProject,
  onDeleteProject,
  onOpenSearch,
}: Props) {
  const displayName = useSettingsStore((s) => s.settings?.display_name ?? "You");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [footerOpen, setFooterOpen] = useState(false);

  function handleContextMenu(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    setContextMenu({ projectId, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  function openDeleteDialog(projectId: string) {
    setDeleteTarget(projectId);
    setContextMenu(null);
  }

  function confirmDelete() {
    if (deleteTarget) {
      onDeleteProject(deleteTarget);
      setDeleteTarget(null);
    }
  }

  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <>
      <aside
        style={{ width: 260, flexShrink: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)", fontFamily: "var(--font-sans)" }}
        className="flex flex-col h-full"
        onClick={() => footerOpen && setFooterOpen(false)}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 10px" }}>
          <img src="/assets/logo-mark.png" alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontWeight: 200, fontSize: 20, letterSpacing: "0.04em", color: "var(--sidebar-fg)" }}>Buddy</span>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 8px 8px" }}>
          <button
            style={{
              height: 34, padding: "0 10px", border: "none",
              background: view === "settings" ? "var(--sidebar-active)" : "transparent",
              color: "var(--sidebar-fg)", borderRadius: 6,
              fontFamily: "inherit", fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", textAlign: "left",
              transition: "background 140ms var(--ease-out)",
            }}
            onClick={() => onNavigate("settings")}
            onMouseEnter={(e) => { if (view !== "settings") e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { if (view !== "settings") e.currentTarget.style.background = "transparent"; }}
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            style={{
              height: 34, padding: "0 10px", border: "none",
              background: view === "resources" ? "var(--sidebar-active)" : "transparent",
              color: "var(--sidebar-fg)", borderRadius: 6,
              fontFamily: "inherit", fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", textAlign: "left",
              transition: "background 140ms var(--ease-out)",
            }}
            onClick={() => onNavigate("resources")}
            onMouseEnter={(e) => { if (view !== "resources") e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { if (view !== "resources") e.currentTarget.style.background = "transparent"; }}
          >
            <BookOpen size={16} />
            Resources
          </button>
          <button
            style={{
              height: 34, padding: "0 10px", border: "none",
              background: "transparent", color: "var(--sidebar-fg)", borderRadius: 6,
              fontFamily: "inherit", fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", textAlign: "left",
              transition: "background 140ms var(--ease-out)",
            }}
            onClick={() => onOpenSearch?.()}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Search size={16} />
            <span style={{ flex: 1, textAlign: "left" }}>Search resources</span>
            <span style={{ fontSize: 11, color: "var(--sidebar-muted)", fontFamily: "var(--font-mono)" }}>⌘K</span>
          </button>
        </nav>

        {/* New project CTA */}
        <button
          style={{
            margin: "4px 12px 10px", height: 36,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)", color: "var(--sidebar-fg)",
            borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer", padding: "0 12px",
            boxShadow: "var(--shadow-xs)",
            transition: "background 140ms var(--ease-out)",
          }}
          onClick={() => onNavigate("home")}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
        >
          <FilePlus size={16} />
          <span style={{ flex: 1, textAlign: "left" }}>New project</span>
          <span style={{ fontSize: 11, color: "var(--sidebar-muted)", fontFamily: "var(--font-mono)" }}>⌘N</span>
        </button>

        {/* Project list */}
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--sidebar-muted)", letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 16px 4px" }}>
          Projects
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px", display: "flex", flexDirection: "column", gap: 1 }}>
          {projects.map((p) => {
            const isActive = p.id === activeProjectId && view === "workspace";
            return (
              <button
                key={p.id}
                title={p.title}
                style={{
                  height: 30, padding: "0 10px", border: "none",
                  background: isActive ? "var(--sidebar-active)" : "transparent",
                  color: isActive ? "var(--sidebar-fg)" : "var(--ink-700)",
                  borderRadius: 6, fontFamily: "inherit", fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  display: "flex", alignItems: "center", gap: 8,
                  cursor: "pointer", textAlign: "left",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  transition: "background 140ms var(--ease-out)",
                }}
                onClick={() => onSelectProject(p.id)}
                onContextMenu={(e) => handleContextMenu(e, p.id)}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--sidebar-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <footer
          style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "background 140ms var(--ease-out)" }}
          onClick={() => setFooterOpen((o) => !o)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <span
            aria-label="avatar"
            style={{ width: 26, height: 26, borderRadius: 999, background: "linear-gradient(135deg, var(--brand-cyan-400), var(--brand-navy-800))", color: "white", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            {initials}
          </span>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sidebar-fg)" }}>{displayName}</span>
            <span style={{ fontSize: 11, color: "var(--sidebar-muted)" }}>Free · Bring your own key</span>
          </div>
        </footer>

        {/* Footer dropdown */}
        {footerOpen && (
          <div className="absolute bottom-12 left-2 w-48 rounded-lg border bg-popover shadow-lg py-1 z-10">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-sunken"
              onClick={() => { setFooterOpen(false); onNavigate("account"); }}
            >
              Account
            </button>
          </div>
        )}
      </aside>

      {/* Context menu */}
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 rounded-lg border bg-popover shadow-lg py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={closeContextMenu}
        >
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-signal-danger hover:bg-surface-sunken"
            onClick={() => openDeleteDialog(contextMenu.projectId)}
          >
            Delete project…
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(6, 31, 55, 0.30)", backdropFilter: "blur(4px)" }}>
          <div role="dialog" style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow-xl)", padding: "24px", width: 320, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "var(--font-sans)" }}>Delete project?</h2>
            <p style={{ fontSize: 13, color: "var(--foreground-muted)", margin: 0, fontFamily: "var(--font-sans)" }}>
              This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--signal-danger)", color: "var(--paper-0)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
