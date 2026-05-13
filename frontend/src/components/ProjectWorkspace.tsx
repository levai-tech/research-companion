import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import { useViewStore } from "../viewStore";
import { BookOpen } from "lucide-react";
import type { Project } from "../hooks/useProjects";
import ApproachExplorer from "./ApproachExplorer";
import OutlineGenerator from "./OutlineGenerator";
import BlockEditor from "./BlockEditor";
import { outlineToDoc } from "../utils/outlineToDoc";

interface Approach {
  id: string;
  title: string;
  description: string;
}

interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

interface Transcript {
  summary: string;
  messages: TranscriptMessage[];
}

interface OutlineSection {
  title: string;
  description: string;
  subsections: { title: string; description: string }[];
}

interface Outline {
  sections: OutlineSection[];
}

type Tab = "transcript" | "approach" | "outline" | "editor";

interface Props {
  project: Project;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "9px 12px",
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
  color: active ? "var(--foreground)" : "var(--foreground-muted)",
  background: "transparent", border: "none",
  borderBottom: `2px solid ${active ? "var(--brand-cyan-500)" : "transparent"}`,
  marginBottom: -1, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
  transition: "color 140ms var(--ease-out)",
});

export default function ProjectWorkspace({ project }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const navigate = useViewStore((s) => s.navigate);
  const [approach, setApproach] = useState<Approach | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [resourceCount, setResourceCount] = useState(0);
  const [tab, setTab] = useState<Tab>("transcript");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!port) return;
    Promise.all([
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/approach`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/transcript`).then((r) => r.status === 404 ? null : r.json()),
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/outline`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/resources`).then((r) => r.json()),
    ]).then(([approachData, transcriptData, outlineData, resourcesData]: [Approach | null, Transcript | null, Outline, unknown[]]) => {
      setApproach(approachData);
      setTranscript(transcriptData);
      setOutline(outlineData);
      setResourceCount(Array.isArray(resourcesData) ? resourcesData.length : 0);
    }).finally(() => setIsLoading(false));
  }, [port, project.id]);

  function refetchApproach() {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${project.id}/approach`)
      .then((r) => r.json())
      .then((data: Approach) => { setApproach(data); setTab("outline"); });
  }

  function refetchOutline() {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${project.id}/outline`)
      .then((r) => r.json())
      .then((data: Outline) => {
        setOutline(data);
        const doc = outlineToDoc(project.title, data.sections);
        return fetch(`http://127.0.0.1:${port}/projects/${project.id}/document`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc),
        });
      })
      .then(() => setTab("editor"));
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)" }}>
        Loading project…
      </div>
    );
  }

  const tabs: { id: Tab; label: string; done: boolean }[] = [
    { id: "transcript", label: "Transcript", done: !!transcript },
    { id: "approach", label: "Approach", done: !!approach },
    { id: "outline", label: "Outline", done: (outline?.sections.length ?? 0) > 0 },
    { id: "editor", label: "Editor", done: false },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      {/* Header */}
      <header style={{ padding: "14px 24px 0", background: "var(--background)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.012em", color: "var(--foreground)", margin: 0 }}>
              {project.title}
            </h1>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)", margin: "2px 0 14px" }}>
              {project.document_type} · {project.topic}
            </p>
          </div>
          <button
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", transition: "background 140ms var(--ease-out)" }}
            onClick={() => navigate("resources", project.id)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
          >
            <BookOpen size={14} />
            Resources · {resourceCount}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", padding: "0 0" }}>
          {tabs.map((t) => (
            <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
              {t.done && <span style={{ color: "var(--signal-success)", fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
      </header>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {tab === "transcript" && (
          transcript ? (
            <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
              <div style={{ background: "var(--surface-sunken)", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Summary</div>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.55, margin: 0, color: "var(--foreground)" }}>{transcript.summary}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {transcript.messages.map((m, i) => (
                  <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left" }}>
                    <span style={{ display: "inline-block", background: m.role === "user" ? "var(--brand-navy-800)" : "var(--surface)", color: m.role === "user" ? "var(--paper-0)" : "var(--foreground)", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "8px 14px", fontSize: 13, fontFamily: "var(--font-sans)", lineHeight: 1.5, maxWidth: "80%", border: m.role === "user" ? "none" : "1px solid var(--border)" }}>
                      {m.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)" }}>No transcript yet.</div>
          )
        )}

        {tab === "approach" && (
          approach ? (
            <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 22px", boxShadow: "var(--shadow-xs)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, background: "var(--brand-navy-800)", color: "var(--paper-0)", padding: "3px 8px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase" }}>Selected</span>
                  <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, margin: 0 }}>{approach.title}</h3>
                </div>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.6, color: "var(--foreground-muted)", margin: 0 }}>{approach.description}</p>
              </div>
            </div>
          ) : (
            <ApproachExplorer projectId={project.id} transcriptSummary={transcript?.summary ?? project.topic} onComplete={refetchApproach} />
          )
        )}

        {tab === "outline" && (
          outline && outline.sections.length > 0 ? (
            <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {outline.sections.map((section, i) => (
                  <li key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", boxShadow: "var(--shadow-xs)" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground-muted)", minWidth: 24 }}>{i + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>{section.title}</h3>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.55, color: "var(--foreground-muted)", margin: 0 }}>{section.description}</p>
                        {section.subsections.length > 0 && (
                          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                            {section.subsections.map((sub, j) => (
                              <li key={j} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
                                <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{i + 1}.{j + 1} {sub.title}</span>
                                {" "}<span style={{ color: "var(--foreground-muted)" }}>— {sub.description}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            approach ? (
              <OutlineGenerator projectId={project.id} onComplete={refetchOutline} />
            ) : (
              <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)" }}>
                Confirm your Approach first — switch to the Approach tab.
              </div>
            )
          )
        )}

        {tab === "editor" && <BlockEditor projectId={project.id} />}
      </div>
    </div>
  );
}
