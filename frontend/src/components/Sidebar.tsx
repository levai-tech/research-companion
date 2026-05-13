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

  return (
    <>
      <aside
        className="flex flex-col h-full border-r"
        style={{ width: 260, flexShrink: 0 }}
        onClick={() => footerOpen && setFooterOpen(false)}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 py-3">
          <img src="/assets/logo-mark.png" alt="" style={{ width: 28, height: 28 }} />
          <span className="font-light text-xl tracking-wide">Levai</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          <button
            aria-current={view === "settings" ? "page" : undefined}
            className="flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium text-left transition-colors hover:bg-muted data-[current]:bg-muted"
            data-current={view === "settings" ? "" : undefined}
            onClick={() => onNavigate("settings")}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            aria-current={view === "resources" ? "page" : undefined}
            className="flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium text-left transition-colors hover:bg-muted"
            onClick={() => onNavigate("resources")}
          >
            <BookOpen className="h-4 w-4" />
            Resources
          </button>
          <button
            className="flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium text-left transition-colors hover:bg-muted"
            onClick={() => onOpenSearch?.()}
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Search resources</span>
            <span className="text-xs text-muted-foreground font-mono">⌘K</span>
          </button>
        </nav>

        {/* New project CTA */}
        <button
          className="mx-3 mb-2 flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors hover:bg-muted"
          onClick={() => onNavigate("home")}
        >
          <FilePlus className="h-4 w-4" />
          <span className="flex-1 text-left">New project</span>
          <span className="text-xs text-muted-foreground font-mono">⌘N</span>
        </button>

        {/* Project list */}
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 pt-2 pb-1">
          Projects
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-px px-2">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId && view === "workspace";
            return (
              <button
                key={p.id}
                aria-current={isActive ? "page" : undefined}
                className="flex items-center h-8 px-2.5 rounded-md text-sm text-left transition-colors hover:bg-muted truncate aria-[current=page]:bg-muted aria-[current=page]:font-medium"
                title={p.title}
                onClick={() => onSelectProject(p.id)}
                onContextMenu={(e) => handleContextMenu(e, p.id)}
              >
                <span className="truncate">{p.title}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <footer
          role="contentinfo"
          className="border-t px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-muted transition-colors"
          onClick={() => setFooterOpen((o) => !o)}
        >
          <span
            aria-label="avatar"
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #22d3ee, #1e3a5f)" }}
          >
            {displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
          </span>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-xs font-semibold truncate">{displayName}</span>
            <span className="text-[11px] text-muted-foreground">Free · Bring your own key</span>
          </div>
        </footer>

        {/* Footer dropdown */}
        {footerOpen && (
          <div className="absolute bottom-12 left-2 w-48 rounded-lg border bg-popover shadow-lg py-1 z-10">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
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
            className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted"
            onClick={() => openDeleteDialog(contextMenu.projectId)}
          >
            Delete project…
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" className="bg-background rounded-xl border shadow-xl p-6 w-80 space-y-4">
            <h2 className="text-sm font-semibold">Delete project?</h2>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-md text-sm border hover:bg-muted"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground hover:opacity-90"
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
