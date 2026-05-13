import { create } from "zustand";
import type { AppView } from "./components/Sidebar";

interface ViewStore {
  view: AppView;
  activeProjectId: string | null;
  navigate: (view: AppView, projectId: string | null) => void;
  selectProject: (id: string) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  view: "home",
  activeProjectId: null,
  navigate: (view, projectId) => set({ view, activeProjectId: projectId }),
  selectProject: (id) => set({ view: "workspace", activeProjectId: id }),
}));
