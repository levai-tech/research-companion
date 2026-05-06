import { useEffect, useState } from "react";
import { useAppStore } from "../store";

interface Structure {
  id: string;
  title: string;
  rationale: string;
  tradeoff: string;
}

interface Section {
  title: string;
  description: string;
  subsections: { title: string; description: string }[];
}

interface SavedOutline {
  structure: object;
  sections: Section[];
}

interface OutlineGeneratorProps {
  projectId: string;
  onComplete: () => void;
}

export default function OutlineGenerator({ projectId, onComplete }: OutlineGeneratorProps) {
  const port = useAppStore((s) => s.backendPort);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outline, setOutline] = useState<SavedOutline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchStructures() {
    if (!port) return;
    setIsLoading(true);
    setError(null);
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/outline/structures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b.detail ?? `Error ${r.status}`))))
      .then((data: Structure[]) => setStructures(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { fetchStructures(); }, [port, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    const structure = structures.find((s) => s.id === selectedId);
    if (!structure) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/projects/${projectId}/outline/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structure }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail ?? `Error ${res.status}`);
      }
      const data: SavedOutline = await res.json();
      setOutline(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) return <div className="p-6">Loading structural options…</div>;

  if (error && structures.length === 0) return (
    <div className="p-6 flex flex-col gap-3">
      <p className="text-destructive text-sm">{error}</p>
      <button className="self-start rounded border px-3 py-1.5 text-sm" onClick={fetchStructures}>Try again</button>
    </div>
  );

  if (outline) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Your Outline</h2>
        <ol className="flex flex-col gap-3">
          {outline.sections.map((section, i) => (
            <li key={i} className="rounded border p-4">
              <p className="font-semibold">{section.title}</p>
              <p className="text-sm">{section.description}</p>
              {section.subsections.length > 0 && (
                <ul className="ml-4 mt-2 flex flex-col gap-1">
                  {section.subsections.map((sub, j) => (
                    <li key={j}>
                      <span className="font-medium">{sub.title}</span>
                      {sub.description && <span className="text-sm"> — {sub.description}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <button onClick={onComplete}>Done</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">Choose a Structure</h2>
      <div className="flex flex-col gap-3">
        {structures.map((s) => (
          <button
            key={s.id}
            aria-pressed={selectedId === s.id}
            onClick={() => setSelectedId(s.id)}
            className="rounded border p-4 text-left"
          >
            <p className="font-semibold">{s.title}</p>
            <p className="text-sm">{s.rationale}</p>
            <p className="text-sm text-gray-500">{s.tradeoff}</p>
          </button>
        ))}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={!selectedId || isGenerating}
      >
        {isGenerating ? "Generating…" : "Generate Outline"}
      </button>
    </div>
  );
}
