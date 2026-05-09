import { create } from "zustand";

export interface JobEntry {
  resourceId: string;
  projectId: string;
  title: string;
  status: "queued" | "indexing" | "ready" | "failed";
  chunksDone: number;
  chunksTotal: number;
  errorMessage: string | null;
  completedAt: number | null;
  currentStep: string | null;
}

interface JobTrayStore {
  jobs: Record<string, JobEntry>;
  registerJob: (projectId: string, resourceId: string, title: string) => void;
  updateJob: (resourceId: string, update: Partial<JobEntry>) => void;
  dismissJob: (resourceId: string) => void;
}

export const useJobTrayStore = create<JobTrayStore>((set) => ({
  jobs: {},
  registerJob: (projectId, resourceId, title) =>
    set((state) => {
      if (state.jobs[resourceId]) return state;
      return {
        jobs: {
          ...state.jobs,
          [resourceId]: {
            resourceId,
            projectId,
            title,
            status: "queued",
            chunksDone: 0,
            chunksTotal: 0,
            errorMessage: null,
            completedAt: null,
            currentStep: null,
          },
        },
      };
    }),
  updateJob: (resourceId, update) =>
    set((state) => ({
      jobs: {
        ...state.jobs,
        [resourceId]: { ...state.jobs[resourceId], ...update },
      },
    })),
  dismissJob: (resourceId) =>
    set((state) => {
      const { [resourceId]: _removed, ...rest } = state.jobs;
      return { jobs: rest };
    }),
}));
