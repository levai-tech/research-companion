import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useProjects } from "../hooks/useProjects";
import { useJobTrayStore } from "../jobTrayStore";
import { FileText, Plus } from "lucide-react";
import StatusPill from "./StatusPill";
import AddResourceModal from "./AddResourceModal";

interface Resource {
  id: string;
  resource_type: string;
  indexing_status: string;
  citation_metadata: { title?: string; [key: string]: unknown };
  created_at: string;
  project_ids: string[];
}

interface Props {
  initialFilterId?: string;
}

export default function ResourcesPage({ initialFilterId }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const { projects } = useProjects();
  const registerJob = useJobTrayStore((s) => s.registerJob);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filterId, setFilterId] = useState<string>(initialFilterId ?? "all");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (initialFilterId) setFilterId(initialFilterId);
  }, [initialFilterId]);

  useEffect(() => {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/resources`)
      .then((r) => r.json())
      .then(setResources);
  }, [port]);

  const projectsWithResources = projects.filter((p) =>
    resources.some((r) => r.project_ids.includes(p.id)),
  );

  const filtered =
    filterId === "all"
      ? resources
      : resources.filter((r) => r.project_ids.includes(filterId));

  function handleDelete(resourceId: string) {
    if (!port) return;
    if (!window.confirm("Delete this resource?")) return;
    fetch(`http://127.0.0.1:${port}/resources/${resourceId}`, { method: "DELETE" }).then(() => {
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
    });
  }

  function handleReindex(resourceId: string) {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/resources/${resourceId}/reingest`, { method: "POST" }).then(() => {
      setResources((prev) =>
        prev.map((r) => (r.id === resourceId ? { ...r, indexing_status: "indexing" } : r)),
      );
    });
  }

  function handleResourceAdded(resource: Resource) {
    setResources((prev) => [...prev, resource]);
    if (resource.indexing_status !== "ready") {
      registerJob(
        resource.project_ids[0] ?? "",
        resource.id,
        resource.citation_metadata?.title ?? "(untitled)",
      );
    }
    setModalOpen(false);
  }

  const filterChipStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
    padding: "4px 10px", borderRadius: 999,
    border: active ? "1px solid var(--brand-navy-800)" : "1px solid var(--border-strong)",
    background: active ? "var(--brand-navy-800)" : "var(--surface)",
    color: active ? "var(--paper-0)" : "var(--foreground)",
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
    transition: "background 140ms var(--ease-out), border-color 140ms var(--ease-out)",
  });

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--background)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 32px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 6 }}>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.012em", margin: 0 }}>Resources</h1>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground-muted)", paddingBottom: 6 }}>
            {resources.length} indexed across {projectsWithResources.length} projects
          </span>
        </div>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.55, color: "var(--foreground-muted)", margin: "0 0 24px", maxWidth: 580 }}>
          Everything Buddy can cite. Add a file or URL and it&apos;s indexed semantically — searchable from anywhere via ⌘K.
        </p>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--foreground-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginRight: 4 }}>Project</span>
          <button style={filterChipStyle(filterId === "all")} onClick={() => setFilterId("all")}>
            All · <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>{resources.length}</span>
          </button>
          {projectsWithResources.map((p) => {
            const count = resources.filter((r) => r.project_ids.includes(p.id)).length;
            return (
              <button key={p.id} style={filterChipStyle(filterId === p.id)} onClick={() => setFilterId(p.id)}>
                {p.title} · <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
          <div style={{ marginLeft: "auto" }}>
            <button
              style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--brand-navy-800)", color: "var(--paper-0)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, transition: "background 140ms var(--ease-out)" }}
              onClick={() => setModalOpen(true)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-navy-700)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--brand-navy-800)"; }}
            >
              <Plus size={14} />
              Add resource
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--foreground-muted)" }}>
              No resources in this scope yet.
            </div>
          ) : (
            filtered.map((r, i) => {
              const title = r.citation_metadata?.title ?? "(untitled)";
              const rowProjects = projects.filter((p) => r.project_ids.includes(p.id));
              return (
                <div
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: i === filtered.length - 1 ? "none" : "1px solid var(--border)", transition: "background 140ms var(--ease-out)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.025)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--surface-sunken)", color: "var(--foreground-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2, alignItems: "center" }}>
                      {rowProjects.map((p) => (
                        <span key={p.id} style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 500, color: "var(--foreground-muted)", background: "var(--surface-sunken)", padding: "1px 7px", borderRadius: 999 }}>
                          {p.title}
                        </span>
                      ))}
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground-muted)" }}>{r.resource_type}</span>
                    </div>
                  </div>
                  <StatusPill status={r.indexing_status} />
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    <button
                      aria-label="Re-index"
                      style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 6, color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "background 140ms var(--ease-out), color 140ms var(--ease-out)" }}
                      onClick={() => handleReindex(r.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.05)"; e.currentTarget.style.color = "var(--foreground)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--foreground-muted)"; }}
                    >
                      ↻
                    </button>
                    <button
                      aria-label="Delete"
                      style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 6, color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "background 140ms var(--ease-out), color 140ms var(--ease-out)" }}
                      onClick={() => handleDelete(r.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(192,57,43,0.10)"; e.currentTarget.style.color = "var(--signal-danger)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--foreground-muted)"; }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {modalOpen && (
        <AddResourceModal
          projectId={filterId !== "all" ? filterId : ""}
          onClose={() => setModalOpen(false)}
          onResourceAdded={(resource) => handleResourceAdded(resource as unknown as Resource)}
        />
      )}
    </div>
  );
}
