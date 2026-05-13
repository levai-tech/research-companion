import { useState, useRef, useEffect } from "react";
import { Upload, Link, X } from "lucide-react";
import { useAppStore } from "../store";

type InputMode = "file" | "url";
type ResourceType = "Book" | "Press/Journal Article" | "Source Transcript";

interface Resource {
  id: string;
  resource_type: string;
  indexing_status: string;
  citation_metadata: Record<string, unknown>;
  content_hash: string;
  created_at: string;
}

interface Props {
  projectId: string;
  onClose: () => void;
  onResourceAdded: (resource: Resource) => void;
}

const FILE_TYPES: ResourceType[] = ["Book", "Press/Journal Article", "Source Transcript"];

const s = {
  field: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--foreground)" } as React.CSSProperties,
  input: {
    height: 34, padding: "0 12px",
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    borderRadius: 6, fontSize: 13,
    color: "var(--foreground)", outline: "none",
    fontFamily: "var(--font-sans)",
  } as React.CSSProperties,
};

function stemOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 6, border: "none",
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--foreground)" : "var(--foreground-muted)",
        fontSize: 12, fontWeight: 500, cursor: "pointer",
        boxShadow: active ? "var(--shadow-xs)" : "none",
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: "var(--font-sans)",
        transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function AddResourceModal({ projectId, onClose, onResourceAdded }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const [mode, setMode] = useState<InputMode>("file");
  const [fileResourceType, setFileResourceType] = useState<ResourceType>("Book");
  const [files, setFiles] = useState<File[]>([]);
  const [fileTitles, setFileTitles] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleFilesChange(picked: FileList | null) {
    const arr = picked ? Array.from(picked) : [];
    setFiles(arr);
    setFileTitles(arr.map((f) => stemOf(f.name)));
  }

  function setFileTitle(index: number, title: string) {
    setFileTitles((prev) => prev.map((t, i) => (i === index ? title : t)));
  }

  async function handleSubmit() {
    if (!port) return;
    setSubmitting(true);
    try {
      let response: Response;
      if (mode === "file") {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        form.append("resource_type", fileResourceType);
        form.append("titles", JSON.stringify(fileTitles));
        if (projectId) form.append("project_id", projectId);
        response = await fetch(`http://127.0.0.1:${port}/resources/file`, { method: "POST", body: form });
      } else {
        response = await fetch(`http://127.0.0.1:${port}/resources/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      }
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        data.forEach((r) => onResourceAdded(r));
      } else {
        onResourceAdded(data);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(6, 31, 55, 0.30)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: "min(500px, calc(100% - 48px))", maxHeight: "calc(100% - 96px)", background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow-xl)", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header style={{ padding: "18px 22px 14px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1, fontFamily: "var(--font-sans)" }}>Add resource</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 6, color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "var(--surface-sunken)", padding: 3, borderRadius: 8, width: "fit-content" }}>
            <ModeBtn active={mode === "file"} onClick={() => setMode("file")} icon={<Upload size={13} />} label="Upload file" />
            <ModeBtn active={mode === "url"} onClick={() => setMode("url")} icon={<Link size={13} />} label="Paste URL" />
          </div>

          {/* File path */}
          {mode === "file" && (
            <>
              {/* Dropzone */}
              <div style={{ position: "relative", border: "1.5px dashed var(--border-strong)", borderRadius: 10, padding: "26px 14px", textAlign: "center", color: "var(--foreground-muted)", fontSize: 13, background: "var(--surface-sunken)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                <Upload size={22} style={{ color: "var(--foreground-muted)" }} />
                <div>
                  <div style={{ fontWeight: 600, color: "var(--foreground)" }}>Drop files or click to browse</div>
                  <div>PDF, DOCX, or TXT · max 200 MB</div>
                </div>
                <input
                  ref={fileInputRef}
                  id="file-input"
                  data-testid="file-input"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  onChange={(e) => handleFilesChange(e.target.files)}
                  aria-label="File"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                />
              </div>

              {/* Per-file title rows */}
              {files.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {files.map((f, i) => (
                    <div key={i} data-testid="file-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--foreground-muted)", flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <input
                        type="text"
                        data-testid="file-title-input"
                        aria-label={`Title for ${f.name}`}
                        value={fileTitles[i] ?? ""}
                        onChange={(e) => setFileTitle(i, e.target.value)}
                        style={{ ...s.input, flex: 1 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Resource type */}
              <div style={s.field}>
                <span style={s.label}>Resource type</span>
                <div role="radiogroup" aria-label="Resource type" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {FILE_TYPES.map((t) => (
                    <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 13, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
                      <input
                        type="radio"
                        name="resource-type"
                        value={t}
                        checked={fileResourceType === t}
                        onChange={() => setFileResourceType(t)}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* URL path */}
          {mode === "url" && (
            <div style={s.field}>
              <label htmlFor="url-input" style={s.label}>URL</label>
              <input
                id="url-input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                aria-label="URL"
                style={s.input}
              />
              <p style={{ fontSize: 12, color: "var(--foreground-muted)", margin: 0 }}>
                Resource type: <span style={{ fontWeight: 600, color: "var(--foreground)" }}>Webpage</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "var(--surface-sunken)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--brand-navy-800)", color: "#ffffff", fontSize: 13, fontWeight: 500, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.5 : 1, fontFamily: "var(--font-sans)" }}
          >
            Add to library
          </button>
        </footer>
      </div>
    </div>
  );
}
