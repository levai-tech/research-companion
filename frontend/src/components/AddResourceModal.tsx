import { useState } from "react";
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

function BookFields({
  meta,
  setMeta,
}: {
  meta: Record<string, string>;
  setMeta: (k: string, v: string) => void;
}) {
  return (
    <>
      <Field label="Author(s)" id="author" value={meta.author ?? ""} onChange={(v) => setMeta("author", v)} />
      <Field label="Title" id="title" value={meta.title ?? ""} onChange={(v) => setMeta("title", v)} />
      <Field label="Edition" id="edition" value={meta.edition ?? ""} onChange={(v) => setMeta("edition", v)} />
      <Field label="Publisher" id="publisher" value={meta.publisher ?? ""} onChange={(v) => setMeta("publisher", v)} />
      <Field label="Publication Date" id="publication_date" value={meta.publication_date ?? ""} onChange={(v) => setMeta("publication_date", v)} />
      <Field label="ISBN (optional)" id="isbn" value={meta.isbn ?? ""} onChange={(v) => setMeta("isbn", v)} />
    </>
  );
}

function ArticleFields({
  meta,
  setMeta,
}: {
  meta: Record<string, string>;
  setMeta: (k: string, v: string) => void;
}) {
  return (
    <>
      <Field label="Author(s)" id="author" value={meta.author ?? ""} onChange={(v) => setMeta("author", v)} />
      <Field label="Article Title" id="article_title" value={meta.article_title ?? ""} onChange={(v) => setMeta("article_title", v)} />
      <Field label="Journal / Outlet name" id="journal" value={meta.journal ?? ""} onChange={(v) => setMeta("journal", v)} />
      <Field label="Volume" id="volume" value={meta.volume ?? ""} onChange={(v) => setMeta("volume", v)} />
      <Field label="Issue" id="issue" value={meta.issue ?? ""} onChange={(v) => setMeta("issue", v)} />
      <Field label="Publication Date" id="publication_date" value={meta.publication_date ?? ""} onChange={(v) => setMeta("publication_date", v)} />
      <Field label="Page Range" id="page_range" value={meta.page_range ?? ""} onChange={(v) => setMeta("page_range", v)} />
    </>
  );
}

function WebpageFields({
  meta,
  setMeta,
}: {
  meta: Record<string, string>;
  setMeta: (k: string, v: string) => void;
}) {
  return (
    <>
      <Field label="Author or Organisation" id="author" value={meta.author ?? ""} onChange={(v) => setMeta("author", v)} />
      <Field label="Page Title" id="page_title" value={meta.page_title ?? ""} onChange={(v) => setMeta("page_title", v)} />
      <Field label="Site Name" id="site_name" value={meta.site_name ?? ""} onChange={(v) => setMeta("site_name", v)} />
      <Field label="Publication Date" id="publication_date" value={meta.publication_date ?? ""} onChange={(v) => setMeta("publication_date", v)} />
    </>
  );
}

function TranscriptFields({
  meta,
  setMeta,
}: {
  meta: Record<string, string>;
  setMeta: (k: string, v: string) => void;
}) {
  return (
    <>
      <Field label="Attendees" id="attendees" value={meta.attendees ?? ""} onChange={(v) => setMeta("attendees", v)} />
      <Field label="Meeting Title" id="meeting_title" value={meta.meeting_title ?? ""} onChange={(v) => setMeta("meeting_title", v)} />
      <Field label="Date" id="date" value={meta.date ?? ""} onChange={(v) => setMeta("date", v)} />
    </>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border px-3 py-2 text-sm"
      />
    </div>
  );
}

export default function AddResourceModal({ projectId, onClose, onResourceAdded }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const [mode, setMode] = useState<InputMode>("file");
  const [fileResourceType, setFileResourceType] = useState<ResourceType>("Book");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [meta, setMetaState] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function setMeta(k: string, v: string) {
    setMetaState((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit() {
    if (!port) return;
    setSubmitting(true);
    try {
      let response: Response;
      if (mode === "file") {
        const form = new FormData();
        if (file) form.append("file", file);
        const cleanMeta = Object.fromEntries(
          Object.entries(meta).filter(([, v]) => v !== ""),
        );
        if (Object.keys(cleanMeta).length > 0) {
          form.append("citation_metadata", JSON.stringify(cleanMeta));
        }
        response = await fetch(
          `http://127.0.0.1:${port}/resources/file?resource_type=${encodeURIComponent(fileResourceType)}`,
          { method: "POST", body: form },
        );
      } else {
        const cleanMeta = Object.fromEntries(
          Object.entries(meta).filter(([, v]) => v !== ""),
        );
        response = await fetch(
          `http://127.0.0.1:${port}/resources/url`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, citation_metadata: cleanMeta }),
          },
        );
      }
      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }
      const resource = await response.json();
      onResourceAdded(resource);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center bg-black/40 z-50"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Add Resource</h2>
          <button
            aria-label="Close modal"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* File | URL toggle */}
        <div className="flex gap-4" role="radiogroup" aria-label="Input mode">
          {(["file", "url"] as InputMode[]).map((m) => (
            <label key={m} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="input-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span className="text-sm capitalize">{m}</span>
            </label>
          ))}
        </div>

        {/* File path */}
        {mode === "file" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="file-input" className="text-sm font-medium">File</label>
              <input
                id="file-input"
                data-testid="file-input"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-label="File"
              />
            </div>

            {/* Resource type segmented control */}
            <div className="flex gap-2" role="radiogroup" aria-label="Resource type">
              {FILE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="resource-type"
                    value={t}
                    checked={fileResourceType === t}
                    onChange={() => setFileResourceType(t)}
                  />
                  <span className="text-sm">{t}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* URL path */}
        {mode === "url" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="url-input" className="text-sm font-medium">URL</label>
            <input
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="rounded border px-3 py-2 text-sm"
              aria-label="URL"
            />
            <p className="text-xs text-muted-foreground">
              Resource Type: <span className="font-medium">Webpage</span>
            </p>
          </div>
        )}

        {/* Metadata fields */}
        <div className="flex flex-col gap-3">
          {mode === "file" && fileResourceType === "Book" && (
            <BookFields meta={meta} setMeta={setMeta} />
          )}
          {mode === "file" && fileResourceType === "Press/Journal Article" && (
            <ArticleFields meta={meta} setMeta={setMeta} />
          )}
          {mode === "url" && (
            <WebpageFields meta={meta} setMeta={setMeta} />
          )}
          {mode === "file" && fileResourceType === "Source Transcript" && (
            <TranscriptFields meta={meta} setMeta={setMeta} />
          )}
        </div>

        {/* Submit */}
        <button
          className="mt-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          onClick={handleSubmit}
          disabled={submitting}
        >
          Add Resource
        </button>
      </div>
    </div>
  );
}
