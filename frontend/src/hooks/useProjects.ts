import { useEffect, useState } from "react";
import { useAppStore } from "../store";

export interface Project {
  id: string;
  title: string;
  topic: string;
  theme: string;
  angle: string;
  document_type: string;
  layout_id: string;
  last_modified: string;
}

export function useProjects(): { projects: Project[]; isLoading: boolean; refetch: () => void } {
  const port = useAppStore((s) => s.backendPort);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!port) return;
    setIsLoading(true);
    fetch(`http://127.0.0.1:${port}/projects`)
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .finally(() => setIsLoading(false));
  }, [port, tick]);

  return { projects, isLoading, refetch: () => setTick((n) => n + 1) };
}
