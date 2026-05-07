import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useAppStore } from "../store";

interface Approach {
  title: string;
  description: string;
}

interface ApproachExplorerProps {
  projectId: string;
  transcriptSummary: string;
  onComplete: () => void;
}

export default function ApproachExplorer({ projectId, transcriptSummary, onComplete }: ApproachExplorerProps) {
  const port = useAppStore((s) => s.backendPort);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function propose() {
    if (!port) return;
    setIsLoading(true);
    setError(null);
    setSelectedIndex(null);
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/approaches/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript_summary: transcriptSummary }),
    })
      .then((r) => r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b.detail ?? `Error ${r.status}`))))
      .then((data: Approach[]) => setApproaches(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { propose(); }, [port, projectId, transcriptSummary]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(index: number, field: "title" | "description", value: string) {
    setApproaches((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  async function handleConfirm() {
    if (selectedIndex === null) return;
    await fetch(`http://127.0.0.1:${port}/projects/${projectId}/approach`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approach: approaches[selectedIndex] }),
    });
    onComplete();
  }

  if (isLoading) return <div className="p-6">Loading approaches…</div>;

  if (error) return (
    <div className="p-6 flex flex-col gap-3">
      <p className="text-destructive text-sm">{error}</p>
      <button className="self-start rounded border px-3 py-1.5 text-sm" onClick={propose}>Try again</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-3">
        {approaches.map((approach, i) => (
          <div
            key={i}
            className={`rounded border p-4 transition-colors ${selectedIndex === i ? "bg-blue-50 border-blue-300" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="approach-select"
                checked={selectedIndex === i}
                onChange={() => setSelectedIndex(i)}
                className="mt-1"
              />
              <div className="flex-1">
                {editingIndex === i ? (
                  <>
                    <input
                      className="mb-1 w-full rounded border px-2 py-1 font-semibold"
                      value={approach.title}
                      onChange={(e) => setField(i, "title", e.target.value)}
                      autoFocus
                    />
                    <textarea
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={approach.description}
                      onChange={(e) => setField(i, "description", e.target.value)}
                      onBlur={() => setEditingIndex(null)}
                      rows={2}
                    />
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{approach.title}</p>
                    <p className="text-sm">{approach.description}</p>
                  </>
                )}
              </div>
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
      <div className="flex gap-2">
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={propose}
        >
          Show me more options
        </button>
        <button
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={selectedIndex === null}
          onClick={handleConfirm}
        >
          Confirm Approach
        </button>
      </div>
    </div>
  );
}
