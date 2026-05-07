import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useJobTrayStore } from "../jobTrayStore";
import AddResourceModal from "./AddResourceModal";

interface Resource {
  id: string;
  resource_type: string;
  indexing_status: string;
  citation_metadata: { title?: string; [key: string]: unknown };
  content_hash: string;
  created_at: string;
}

interface Props {
  projectId: string;
}

const STATUS_CLASS: Record<string, string> = {
  ready: "bg-green-100 text-green-800",
  indexing: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-muted text-muted-foreground",
};

export default function ResourcesTab({ projectId }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const registerJob = useJobTrayStore((s) => s.registerJob);
  const [resources, setResources] = useState<Resource[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/resources`)
      .then((r) => r.json())
      .then(setResources);
  }, [port, projectId]);

  function handleDelete(resourceId: string) {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/resources/${resourceId}`, {
      method: "DELETE",
    }).then(() => {
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
    });
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Resources</h2>
        <button
          className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground"
          onClick={() => setShowModal(true)}
        >
          Add Resource
        </button>
      </div>

      {resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No resources yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center gap-3 rounded border p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {resource.citation_metadata?.title ?? "(untitled)"}
                </p>
                <p className="text-xs text-muted-foreground">{resource.resource_type}</p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[resource.indexing_status] ?? STATUS_CLASS.queued}`}
              >
                {resource.indexing_status}
              </span>
              <button
                className="text-sm text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(resource.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddResourceModal
          projectId={projectId}
          onClose={() => setShowModal(false)}
          onResourceAdded={(resource) => {
            const r = resource as Resource;
            setResources((prev) => [...prev, r]);
            if (r.indexing_status !== "ready") {
              registerJob(
                projectId,
                r.id,
                r.citation_metadata?.title ?? "(untitled)",
              );
            }
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
