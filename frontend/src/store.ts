import { create } from "zustand";

interface AppStore {
  backendPort: number | null;
  setBackendPort: (port: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  backendPort: null,
  setBackendPort: (port) => set({ backendPort: port }),
}));
