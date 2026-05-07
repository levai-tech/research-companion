import { useState } from "react";
import { useAppStore } from "../store";

interface Section {
  title: string;
  description: string;
  subsections: { title: string; description: string }[];
}

interface SavedOutline {
  sections: Section[];
}

interface OutlineGeneratorProps {
  projectId: string;
  onComplete: () => void;
}

export default function OutlineGenerator({ projectId, onComplete }: OutlineGeneratorProps) {
  const port = useAppStore((s) => s.backendPort);
  const [outline, setOutline] = useState<SavedOutline | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/projects/${projectId}/outline/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? "Generating…" : "Generate Outline"}
      </button>
    </div>
  );
}
