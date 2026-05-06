import { useEffect, useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { useAppStore } from "../store";

interface Angle {
  title: string;
  description: string;
  status: "pending" | "accepted";
}

interface UndoEntry {
  angle: Angle;
  index: number;
}

interface AngleExplorerProps {
  projectId: string;
  topic: string;
  documentType: string;
  onComplete: () => void;
}

export default function AngleExplorer({ projectId, topic, documentType, onComplete }: AngleExplorerProps) {
  const port = useAppStore((s) => s.backendPort);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function propose() {
    if (!port) return;
    setIsLoading(true);
    setError(null);
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/angles/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, document_type: documentType }),
    })
      .then((r) => r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b.detail ?? `Error ${r.status}`))))
      .then((data: { title: string; description: string }[]) =>
        setAngles(data.map((a) => ({ ...a, status: "pending" })))
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { propose(); }, [port, projectId, topic, documentType]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAccepted(index: number) {
    setAngles((prev) =>
      prev.map((a, i) => i === index ? { ...a, status: a.status === "accepted" ? "pending" : "accepted" } : a)
    );
  }

  function removeAngle(index: number) {
    const removed = angles[index];
    setAngles((prev) => prev.filter((_, i) => i !== index));
    setUndoEntry({ angle: removed, index });
    setTimeout(() => setUndoEntry(null), 5000);
  }

  function undoRemove() {
    if (!undoEntry) return;
    setAngles((prev) => {
      const next = [...prev];
      next.splice(undoEntry.index, 0, undoEntry.angle);
      return next;
    });
    setUndoEntry(null);
  }

  function setField(index: number, field: "title" | "description", value: string) {
    setAngles((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  async function handleConfirm() {
    await fetch(`http://127.0.0.1:${port}/projects/${projectId}/angles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angles }),
    });
    onComplete();
  }

  if (isLoading) return <div className="p-6">Loading angles…</div>;

  if (error) return (
    <div className="p-6 flex flex-col gap-3">
      <p className="text-destructive text-sm">{error}</p>
      <button className="self-start rounded border px-3 py-1.5 text-sm" onClick={propose}>Try again</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      {undoEntry && (
        <div role="status" className="flex items-center gap-2 rounded border bg-muted/30 px-3 py-2 text-sm">
          <span>Angle removed.</span>
          <button className="underline" onClick={undoRemove}>Undo</button>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {angles.map((angle, i) => (
          <div
            key={i}
            className={`rounded border p-4 transition-colors ${angle.status === "accepted" ? "bg-green-50 border-green-200" : ""}`}
          >
            {editingIndex === i ? (
              <>
                <input
                  className="mb-1 w-full rounded border px-2 py-1 font-semibold"
                  value={angle.title}
                  onChange={(e) => setField(i, "title", e.target.value)}
                  autoFocus
                />
                <textarea
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={angle.description}
                  onChange={(e) => setField(i, "description", e.target.value)}
                  onBlur={() => setEditingIndex(null)}
                  rows={2}
                />
              </>
            ) : (
              <>
                <p className="font-semibold">{angle.title}</p>
                <p className="text-sm">{angle.description}</p>
              </>
            )}
            <div className="mt-2 flex gap-1">
              <button
                aria-label="Accept"
                aria-pressed={angle.status === "accepted"}
                onClick={() => toggleAccepted(i)}
                className="rounded p-1 hover:bg-green-100"
              >
                <Check size={16} />
              </button>
              <button
                aria-label="Remove"
                onClick={() => removeAngle(i)}
                className="rounded p-1 hover:bg-red-100"
              >
                <X size={16} />
              </button>
              <button
                aria-label="Edit"
                onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                className="rounded p-1 hover:bg-muted"
              >
                <Pencil size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleConfirm}>Confirm</button>
    </div>
  );
}
