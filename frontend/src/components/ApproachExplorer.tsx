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

const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8, border: "none",
  background: "var(--brand-navy-800)", color: "var(--paper-0)",
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer",
  transition: "background 140ms var(--ease-out)",
};

const outlineBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8,
  border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--foreground)", fontFamily: "var(--font-sans)",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
  transition: "background 140ms var(--ease-out)",
};

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

  if (isLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)" }}>
        Loading approaches…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--signal-danger)", margin: 0 }}>{error}</p>
        <button style={{ ...outlineBtn, alignSelf: "flex-start" }} onClick={propose}>Try again</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {approaches.map((approach, i) => {
          const isSelected = selectedIndex === i;
          return (
            <div
              key={i}
              style={{ background: "var(--surface)", border: `1px solid ${isSelected ? "var(--brand-navy-800)" : "var(--border)"}`, borderRadius: 12, padding: "14px 18px", boxShadow: "var(--shadow-xs)", cursor: "pointer", transition: "border-color 140ms var(--ease-out)" }}
              onClick={() => setSelectedIndex(i)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ marginTop: 2, width: 16, height: 16, borderRadius: 999, border: `2px solid ${isSelected ? "var(--brand-navy-800)" : "var(--border-strong)"}`, background: isSelected ? "var(--brand-navy-800)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSelected && <div style={{ width: 6, height: 6, borderRadius: 999, background: "var(--paper-0)" }} />}
                </div>
                <div style={{ flex: 1 }}>
                  {editingIndex === i ? (
                    <>
                      <input
                        style={{ marginBottom: 6, width: "100%", height: 32, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", outline: "none" }}
                        value={approach.title}
                        onChange={(e) => setField(i, "title", e.target.value)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <textarea
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none", resize: "vertical" }}
                        value={approach.description}
                        onChange={(e) => setField(i, "description", e.target.value)}
                        onBlur={() => setEditingIndex(null)}
                        rows={2}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>{approach.title}</p>
                      <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.55, color: "var(--foreground-muted)", margin: 0 }}>{approach.description}</p>
                    </>
                  )}
                </div>
                <button
                  aria-label="Edit"
                  style={{ width: 28, height: 28, border: "none", background: "transparent", borderRadius: 6, color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 140ms var(--ease-out)" }}
                  onClick={(e) => { e.stopPropagation(); setEditingIndex(editingIndex === i ? null : i); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={outlineBtn} onClick={propose}>Show me more options</button>
        <button
          style={{ ...primaryBtn, opacity: selectedIndex === null ? 0.5 : 1, cursor: selectedIndex === null ? "default" : "pointer" }}
          disabled={selectedIndex === null}
          onClick={handleConfirm}
        >
          Confirm Approach
        </button>
      </div>
    </div>
  );
}
