import { useEffect, useCallback, useState } from "react";
import { useBackendPort } from "./hooks/useBackendPort";
import { useProjects } from "./hooks/useProjects";
import { useAppStore } from "./store";
import Sidebar, { type AppView } from "./components/Sidebar";
import HomeScreen from "./components/HomeScreen";
import Interview from "./components/Interview";
import ProjectWorkspace from "./components/ProjectWorkspace";
import ResourcesTab from "./components/ResourcesTab";
import SettingsPage from "./components/SettingsPage";
import JobTray from "./components/JobTray";
import { useViewStore } from "./viewStore";
import type { Project } from "./hooks/useProjects";

export default function App() {
  useBackendPort();
  const port = useAppStore((s) => s.backendPort);
  const { view, activeProjectId, navigate, selectProject } = useViewStore();
  const { projects, refetch } = useProjects();
  const [resourcesPanelOpen, setResourcesPanelOpen] = useState(false);
  const [interviewMessage, setInterviewMessage] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        navigate("home", null);
      }
    },
    [navigate],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleStartInterview(text: string) {
    setInterviewMessage(text);
  }

  function handleProjectCreated(project: Project) {
    setInterviewMessage(null);
    refetch();
    selectProject(project.id);
  }

  function handleDeleteProject(projectId: string) {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}`, { method: "DELETE" }).then(
      () => refetch(),
    );
    if (activeProjectId === projectId) {
      navigate("home", null);
    }
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="h-screen flex flex-row overflow-hidden">
      <Sidebar
        view={view}
        activeProjectId={activeProjectId}
        projects={projects}
        onNavigate={(v: AppView) => navigate(v, v === "home" ? null : activeProjectId)}
        onSelectProject={(id) => selectProject(id)}
        onDeleteProject={handleDeleteProject}
      />

      <div className="flex-1 flex flex-col min-h-0">
        <main className="flex-1 min-h-0 overflow-y-auto">
          {view === "home" && interviewMessage === null && (
            <HomeScreen
              projectCount={projects.length}
              onSendMessage={handleStartInterview}
              onOpenSearch={() => setResourcesPanelOpen(true)}
            />
          )}
          {view === "home" && interviewMessage !== null && (
            <Interview
              initialMessage={interviewMessage}
              onProjectCreated={handleProjectCreated}
            />
          )}
          {view === "workspace" && activeProject && (
            <ProjectWorkspace project={activeProject} />
          )}
          {view === "resources" && <ResourcesTab projectId={activeProjectId ?? ""} />}
          {view === "settings" && <SettingsPage />}
          {view === "account" && (
            <div className="p-8">
              <h1 className="text-2xl font-semibold">Account</h1>
            </div>
          )}
        </main>
        <JobTray projectId={activeProjectId ?? ""} />
      </div>
    </div>
  );
}
