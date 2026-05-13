import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import { useViewStore } from "../viewStore";
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
      .then((data: Approach) => {
        setApproach(data);
        setTab("outline");
      });
  }

  function refetchOutline() {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${project.id}/outline`)
      .then((r) => r.json())
      .then((data: Outline) => {
        setOutline(data);
        const doc = outlineToDoc(project.title, data.sections);
        return fetch(`http://127.0.0.1:${port}/projects/${project.id}/document`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc),
        });
      })
      .then(() => setTab("editor"));
  }

  if (isLoading) return <div className="p-6">Loading project…</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <div className="flex-1">
          <h1 className="font-semibold">{project.title}</h1>
          <p className="text-xs text-muted-foreground capitalize">{project.document_type} · {project.topic}</p>
        </div>
        <button
          className="h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-muted transition-colors"
          onClick={() => navigate("resources", project.id)}
        >
          Resources · {resourceCount}
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b px-6 pt-2">
        {(["transcript", "approach", "outline", "editor"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {t === "transcript" && transcript && (
              <span className="ml-1.5 text-xs text-green-600">✓</span>
            )}
            {t === "approach" && approach && (
              <span className="ml-1.5 text-xs text-green-600">✓</span>
            )}
            {t === "outline" && (outline?.sections.length ?? 0) > 0 && (
              <span className="ml-1.5 text-xs text-green-600">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "transcript" && (
          transcript ? (
            <div className="p-6 flex flex-col gap-4">
              <div className="rounded border bg-muted/30 p-4">
                <p className="text-sm font-medium text-muted-foreground mb-1">Summary</p>
                <p className="text-sm">{transcript.summary}</p>
              </div>
              <div className="flex flex-col gap-2">
                {transcript.messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                    <span className="inline-block rounded px-3 py-2 text-sm bg-muted">
                      {m.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">No transcript yet.</div>
          )
        )}

        {tab === "approach" && (
          approach ? (
            <div className="p-6 flex flex-col gap-3">
              <div className="rounded border p-4">
                <p className="font-semibold">{approach.title}</p>
                <p className="text-sm text-muted-foreground">{approach.description}</p>
              </div>
            </div>
          ) : (
            <ApproachExplorer
              projectId={project.id}
              transcriptSummary={transcript?.summary ?? project.topic}
              onComplete={refetchApproach}
            />
          )
        )}

        {tab === "editor" && (
          <BlockEditor projectId={project.id} />
        )}

        {tab === "outline" && (
          outline && outline.sections.length > 0 ? (
            <div className="p-6 flex flex-col gap-4">
              <ol className="flex flex-col gap-3">
                {outline.sections.map((section, i) => (
                  <li key={i} className="rounded border p-4">
                    <p className="font-semibold">{i + 1}. {section.title}</p>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                    {section.subsections.length > 0 && (
                      <ul className="ml-4 mt-2 flex flex-col gap-1">
                        {section.subsections.map((sub, j) => (
                          <li key={j} className="text-sm">
                            <span className="font-medium">{i + 1}.{j + 1} {sub.title}</span>
                            {sub.description && (
                              <span className="text-muted-foreground"> — {sub.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            approach ? (
              <OutlineGenerator
                projectId={project.id}
                onComplete={refetchOutline}
              />
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                Confirm your Approach first — switch to the Approach tab.
              </div>
            )
          )
        )}
      </div>

    </div>
  );
}
