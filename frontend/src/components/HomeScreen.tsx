import { useState } from "react";
import { useProjects, type Project } from "../hooks/useProjects";
import SetupChat from "./SetupChat";

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="rounded border p-4">
      <h3 className="font-semibold">{project.title}</h3>
      <p className="text-sm text-muted-foreground capitalize">{project.document_type}</p>
      <p className="text-xs text-muted-foreground">
        {new Date(project.last_modified).toLocaleDateString()}
      </p>
    </div>
  );
}

export default function HomeScreen() {
  const { projects, isLoading, refetch } = useProjects();
  const [showSetupChat, setShowSetupChat] = useState(false);

  function handleProjectCreated() {
    setShowSetupChat(false);
    refetch();
  }

  if (showSetupChat) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-6 py-3">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowSetupChat(false)}
          >
            ← Back
          </button>
          <span className="font-medium">New Project</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SetupChat onProjectCreated={handleProjectCreated} />
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
          onClick={() => setShowSetupChat(true)}
        >
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <p>No projects yet — start one with the button above.</p>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
