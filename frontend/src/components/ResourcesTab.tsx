import { useState, useEffect, FormEvent } from "react";
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

interface SearchResult {
  chunk_text: string;
  score: number;
  resource_type: string;
  citation_metadata: { title?: string; [key: string]: unknown };
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
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());

  const PREVIEW_LEN = 200;

  function toggleExpanded(i: number) {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!port || !query.trim()) return;
    const params = new URLSearchParams({ q: query.trim(), top_k: "10" });
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/resources/search?${params}`)
      .then((r) => r.json())
      .then((data) => setSearchResults(data.results));
  }

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

      <div className="flex flex-col gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resources…"
            className="flex-1 text-sm rounded border px-3 py-1.5 bg-background"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm rounded bg-secondary text-secondary-foreground"
          >
            Search
          </button>
        </form>

        {searchResults !== null && (
          searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {searchResults.map((result, i) => {
                const isLong = result.chunk_text.length > PREVIEW_LEN;
                const isExpanded = expandedResults.has(i);
                const displayText = isLong && !isExpanded
                  ? result.chunk_text.slice(0, PREVIEW_LEN) + "…"
                  : result.chunk_text;
                return (
                  <li
                    key={i}
                    className={`rounded border p-3 flex flex-col gap-1${isLong ? " cursor-pointer select-none" : ""}`}
                    onClick={() => isLong && toggleExpanded(i)}
                  >
                    <p className="text-sm">{displayText}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.citation_metadata?.title ?? "(untitled)"} · {result.resource_type}
                    </p>
                    <p className="text-xs text-muted-foreground">Score: {result.score}</p>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      <div className="border-t pt-2">
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
      </div>

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
