import { useState } from "react";
import { useProjects, type Project } from "../hooks/useProjects";
import Interview from "./Interview";
import ProjectWorkspace from "./ProjectWorkspace";

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button
      className="w-full rounded border p-4 text-left hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <h3 className="font-semibold">{project.title}</h3>
      <p className="text-sm text-muted-foreground capitalize">{project.document_type}</p>
      <p className="text-xs text-muted-foreground">
        {new Date(project.last_modified).toLocaleDateString()}
      </p>
    </button>
  );
}

type View = "home" | "new-project" | "workspace";

export default function HomeScreen() {
  const { projects, isLoading, refetch } = useProjects();
  const [view, setView] = useState<View>("home");
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  function handleProjectCreated() {
    refetch();
    setView("home");
  }

  function openProject(project: Project) {
    setActiveProject(project);
    setView("workspace");
  }

  if (view === "new-project") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-6 py-3">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setView("home")}
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

  if (view === "workspace" && activeProject) {
    return <ProjectWorkspace project={activeProject} onBack={() => setView("home")} />;
  }

  if (isLoading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setView("new-project")}
        >
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <p>No projects yet — start one with the button above.</p>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => openProject(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
