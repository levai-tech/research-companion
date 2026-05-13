import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useProjects } from "../hooks/useProjects";
import { useJobTrayStore } from "../jobTrayStore";
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 pb-16">
        <div className="flex items-end gap-3 mb-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
          <span className="text-xs font-mono text-muted-foreground pb-1.5">
            {resources.length} indexed across {projectsWithResources.length} projects
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-6 max-w-lg">
          Everything Buddy can cite. Add a file or URL and it&apos;s indexed semantically — searchable from anywhere via ⌘K.
        </p>

        <div className="flex flex-wrap gap-2 items-center mb-5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Project
          </span>
          <button
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filterId === "all"
                ? "bg-navy-800 text-white border-navy-800 font-medium"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
            aria-pressed={filterId === "all"}
            onClick={() => setFilterId("all")}
          >
            All · <span className="font-mono opacity-70">{resources.length}</span>
          </button>
          {projectsWithResources.map((p) => {
            const count = resources.filter((r) => r.project_ids.includes(p.id)).length;
            return (
              <button
                key={p.id}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterId === p.id
                    ? "bg-navy-800 text-white border-navy-800 font-medium"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
                aria-pressed={filterId === p.id}
                onClick={() => setFilterId(p.id)}
              >
                {p.title} · <span className="font-mono opacity-70">{count}</span>
              </button>
            );
          })}
          <div className="ml-auto">
            <button
              className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground"
              onClick={() => setModalOpen(true)}
            >
              Add resource
            </button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No resources in this scope yet.</p>
          ) : (
            filtered.map((r) => {
              const title = r.citation_metadata?.title ?? "(untitled)";
              const rowProjects = projects.filter((p) => r.project_ids.includes(p.id));
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{title}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5 items-center">
                      {rowProjects.map((p) => (
                        <span
                          key={p.id}
                          className="text-xs px-1.5 py-0 rounded bg-muted text-muted-foreground"
                        >
                          {p.title}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">{r.resource_type}</span>
                    </div>
                  </div>
                  <StatusPill status={r.indexing_status} />
                  <button
                    aria-label="Re-index"
                    className="text-sm text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                    onClick={() => handleReindex(r.id)}
                  >
                    ↻
                  </button>
                  <button
                    aria-label="Delete"
                    className="text-sm text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10"
                    onClick={() => handleDelete(r.id)}
                  >
                    ✕
                  </button>
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
          onResourceAdded={(resource) => handleResourceAdded(resource as Resource)}
        />
      )}
    </div>
  );
}
