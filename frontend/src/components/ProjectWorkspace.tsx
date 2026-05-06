import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import type { Project } from "../hooks/useProjects";
import AngleExplorer from "./AngleExplorer";
import OutlineGenerator from "./OutlineGenerator";
import BlockEditor from "./BlockEditor";

interface Angle {
  id: string;
  title: string;
  description: string;
  status: string;
}

interface OutlineSection {
  title: string;
  description: string;
  subsections: { title: string; description: string }[];
}

interface Outline {
  structure: { title: string; rationale: string; tradeoff: string } | null;
  sections: OutlineSection[];
}

type Tab = "angles" | "outline" | "editor";

interface Props {
  project: Project;
  onBack: () => void;
}

export default function ProjectWorkspace({ project, onBack }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const [angles, setAngles] = useState<Angle[] | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [tab, setTab] = useState<Tab>("angles");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!port) return;
    Promise.all([
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/angles`).then((r) => r.json()),
      fetch(`http://127.0.0.1:${port}/projects/${project.id}/outline`).then((r) => r.json()),
    ]).then(([anglesData, outlineData]: [Angle[], Outline]) => {
      setAngles(anglesData);
      setOutline(outlineData);
      if (anglesData.length > 0) setTab("outline");
    }).finally(() => setIsLoading(false));
  }, [port, project.id]);

  function refetchAngles() {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${project.id}/angles`)
      .then((r) => r.json())
      .then((data: Angle[]) => {
        setAngles(data);
        setTab("outline");
      });
  }

  function refetchOutline() {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${project.id}/outline`)
      .then((r) => r.json())
      .then((data: Outline) => setOutline(data));
  }

  if (isLoading) return <div className="p-6">Loading project…</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="font-semibold">{project.title}</h1>
          <p className="text-xs text-muted-foreground capitalize">{project.document_type} · {project.topic}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b px-6 pt-2">
        {(["angles", "outline", "editor"] as Tab[]).map((t) => (
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
            {t === "angles" && angles && angles.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs">{angles.length}</span>
            )}
            {t === "outline" && outline?.structure && (
              <span className="ml-1.5 text-xs text-green-600">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "angles" && (
          angles && angles.length > 0 ? (
            <div className="p-6 flex flex-col gap-3">
              {angles.map((a) => (
                <div key={a.id} className="rounded border p-4">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{a.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <AngleExplorer
              projectId={project.id}
              topic={project.topic}
              documentType={project.document_type}
              onComplete={refetchAngles}
            />
          )
        )}

        {tab === "editor" && (
          <BlockEditor projectId={project.id} />
        )}

        {tab === "outline" && (
          outline?.structure ? (
            <div className="p-6 flex flex-col gap-4">
              <div className="rounded border bg-muted/30 p-3 text-sm">
                <span className="font-medium">Structure: </span>{outline.structure.title}
                <span className="text-muted-foreground"> — {outline.structure.rationale}</span>
              </div>
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
            angles && angles.length > 0 ? (
              <OutlineGenerator
                projectId={project.id}
                onComplete={refetchOutline}
              />
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                Set up your research angles first — switch to the Angles tab.
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
