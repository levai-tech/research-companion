import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useProjects, type Project } from "../hooks/useProjects";
import { useAppStore } from "../store";
import Interview from "./Interview";

function ProjectCard({ project, onClick, onDelete }: { project: Project; onClick: () => void; onDelete: () => void }) {
  return (
    <div className="relative group rounded border hover:bg-muted/50 transition-colors">
      <button className="w-full p-4 text-left" onClick={onClick}>
        <h3 className="font-semibold">{project.title}</h3>
        <p className="text-sm text-muted-foreground capitalize">{project.document_type}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(project.last_modified).toLocaleDateString()}
        </p>
      </button>
      <button
        aria-label="Delete project"
        className="absolute top-2 right-2 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface Props {
  onProjectCreated?: () => void;
}

export default function HomeScreen({ onProjectCreated }: Props) {
  const { projects, isLoading, refetch } = useProjects();
  const port = useAppStore((s) => s.backendPort);
  const [showNewProject, setShowNewProject] = useState(false);

  function handleProjectCreated() {
    refetch();
    onProjectCreated?.();
    setShowNewProject(false);
  }

  function deleteProject(projectId: string) {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}`, { method: "DELETE" })
      .then(() => refetch());
  }

  if (showNewProject) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-6 py-3">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowNewProject(false)}
          >
            ← Back
          </button>
          <span className="font-medium">New Project</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Interview onProjectCreated={handleProjectCreated} />
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setShowNewProject(true)}
        >
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <p>No projects yet — start one with the button above.</p>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => {}} onDelete={() => deleteProject(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
