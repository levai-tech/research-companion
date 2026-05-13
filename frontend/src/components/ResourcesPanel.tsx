import { useState, useEffect, useRef, FormEvent, Fragment } from "react";
import { useAppStore } from "../store";
import { useProjects } from "../hooks/useProjects";

interface Resource {
  id: string;
  content_hash: string;
  resource_type: string;
  indexing_status: "ready" | "indexing" | "queued" | "failed" | string;
  citation_metadata: { title?: string; [key: string]: unknown };
  created_at: string;
  project_ids: string[];
  chunks_done: number;
  chunks_total: number;
  batches_total: number;
  batches_fallback: number;
  error_message: string | null;
  current_step: string | null;
  chunker_id: string | null;
  embedder_id: string | null;
  source_ref: string | null;
}

interface ChunkHit {
  chunk_text: string;
  score: number;
  resource_type: string;
  citation_metadata: { title?: string; [key: string]: unknown };
  location?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  ready:    { bg: "rgba(31, 138, 91, 0.12)",  fg: "var(--signal-success, #1f8a5b)" },
  indexing: { bg: "rgba(11, 158, 209, 0.12)", fg: "var(--brand-cyan-600, #0b9ed1)" },
  failed:   { bg: "rgba(192, 57, 43, 0.10)",  fg: "var(--signal-danger, #c0392b)" },
  queued:   { bg: "var(--surface-sunken, #f4f3ef)", fg: "var(--foreground-muted, #888)" },
};

function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.queued;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 999,
        background: colors.bg,
        color: colors.fg,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: "currentColor" }} />
      {status}
    </span>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i < 0) return text;
  return (
    <Fragment>
      {text.slice(0, i)}
      <mark style={{ background: "rgba(11, 158, 209, 0.20)", padding: "0 2px", borderRadius: 2 }}>
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </Fragment>
  );
}

export default function ResourcesPanel({ open, onClose }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const { projects } = useProjects();
  const [resources, setResources] = useState<Resource[]>([]);
  const [query, setQuery] = useState("");
  const [chunkHits, setChunkHits] = useState<ChunkHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all resources when opened
  useEffect(() => {
    if (!open || !port) return;
    fetch(`http://127.0.0.1:${port}/resources`)
      .then((r) => r.json())
      .then(setResources);
  }, [open, port]);

  // Reset query + chunk hits, autofocus on each open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setChunkHits([]);
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!port || !query.trim()) return;
    const params = new URLSearchParams({ q: query.trim(), top_k: "10" });
    fetch(`http://127.0.0.1:${port}/resources/search?${params}`)
      .then((r) => r.json())
      .then((data) => setChunkHits(data.results ?? []));
  }

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filteredResources = resources.filter((r) => {
    if (!q) return true;
    const title = r.citation_metadata?.title ?? "";
    return (title + " " + r.resource_type).toLowerCase().includes(q);
  });

  const projectMap = new Map(projects.map((p) => [p.id, p.title]));

  function projectChips(projectIds: string[]) {
    return projectIds
      .map((id) => projectMap.get(id))
      .filter(Boolean)
      .join(", ");
  }

  const hasResults = filteredResources.length > 0 || chunkHits.length > 0;

  return (
    <Fragment>
      {/* Scrim */}
      <div
        data-testid="resources-panel-scrim"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(6, 31, 55, 0.18)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          zIndex: 30,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          background: "rgba(250, 250, 248, 0.94)",
          backdropFilter: "blur(14px) saturate(130%)",
          WebkitBackdropFilter: "blur(14px) saturate(130%)",
          borderLeft: "1px solid var(--border, #e5e5e5)",
          display: "flex",
          flexDirection: "column",
          zIndex: 31,
        }}
      >
        {/* Search header */}
        <header style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
          <form role="search" onSubmit={handleSearch} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={inputRef}
              role="searchbox"
              aria-label="Search resources"
              style={{
                flex: 1,
                height: 38,
                padding: "0 36px 0 12px",
                borderRadius: 999,
                border: "1px solid var(--border-strong, #ccc)",
                background: "var(--surface, #fff)",
                fontSize: 14,
                outline: "none",
              }}
              placeholder="Search across all resources…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </form>
          <p style={{ fontSize: 11, color: "var(--foreground-muted, #888)", margin: "8px 0 0", paddingLeft: 4 }}>
            Searching across <strong>your entire library</strong> — every project, every resource.
          </p>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 16px" }}>
          {/* Chunk hits section */}
          {q && chunkHits.length > 0 && (
            <Fragment>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--foreground-muted, #888)", padding: "12px 12px 6px", display: "flex", justifyContent: "space-between" }}>
                <span>Matching passages · {chunkHits.length}</span>
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>semantic + keyword</span>
              </div>
              {chunkHits.map((hit, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {hit.citation_metadata?.title ?? "(untitled)"}
                    </p>
                    {hit.location && (
                      <p style={{ fontSize: 11, color: "var(--foreground-muted, #888)", margin: "2px 0 0" }}>{hit.location}</p>
                    )}
                    <p style={{ fontSize: 12, lineHeight: 1.5, margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {highlight(hit.chunk_text, query)}
                    </p>
                  </div>
                </div>
              ))}
            </Fragment>
          )}

          {/* Resources section */}
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--foreground-muted, #888)", padding: "12px 12px 6px" }}>
            {q ? `Resources · ${filteredResources.length}` : `All resources · ${filteredResources.length}`}
          </div>

          {!hasResults ? (
            <p style={{ fontSize: 13, color: "var(--foreground-muted, #888)", padding: "24px 16px", textAlign: "center", lineHeight: 1.6 }}>
              {q
                ? <>No matches for <strong>"{query}"</strong>.</>
                : <>Your library is empty. Open <strong>Resources</strong> from the sidebar to add files and URLs.</>}
            </p>
          ) : (
            filteredResources.map((r) => {
              const title = r.citation_metadata?.title ?? "(untitled)";
              const chips = projectChips(r.project_ids);
              return (
                <div key={r.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {highlight(title, query)}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--foreground-muted, #888)", margin: "2px 0 0" }}>
                      {chips && (
                        <span style={{ fontSize: 10, fontWeight: 500, background: "var(--surface-sunken, #f4f3ef)", padding: "1px 6px", borderRadius: 999, marginRight: 6 }}>
                          {chips}
                        </span>
                      )}
                      {r.resource_type}
                    </p>
                  </div>
                  <StatusPill status={r.indexing_status} />
                </div>
              );
            })
          )}
        </div>
      </aside>
    </Fragment>
  );
}
