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

const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8, border: "none",
  background: "var(--brand-navy-800)", color: "var(--paper-0)",
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer",
  transition: "background 140ms var(--ease-out)",
};

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
      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.012em", margin: 0 }}>Your Outline</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {outline.sections.map((section, i) => (
            <li key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", boxShadow: "var(--shadow-xs)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground-muted)", minWidth: 24 }}>{i + 1}.</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>{section.title}</p>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.55, color: "var(--foreground-muted)", margin: 0 }}>{section.description}</p>
                  {section.subsections.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                      {section.subsections.map((sub, j) => (
                        <li key={j} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
                          <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{sub.title}</span>
                          {sub.description && <span style={{ color: "var(--foreground-muted)" }}> — {sub.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={primaryBtn} onClick={onComplete}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--signal-danger)", margin: 0 }}>{error}</p>
      )}
      <button
        style={{ ...primaryBtn, opacity: isGenerating ? 0.6 : 1, cursor: isGenerating ? "default" : "pointer", alignSelf: "flex-start" }}
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? "Generating…" : "Generate Outline"}
      </button>
    </div>
  );
}
