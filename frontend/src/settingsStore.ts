import { create } from "zustand";
import { useAppStore } from "./store";

export interface RoleConfig {
  model: string;
}

export interface OllamaConfig {
  endpoint: string;
  embedding_model: string;
}

export interface AppSettings {
  display_name?: string;
  roles: Record<string, RoleConfig>;
  search_provider: string;
  ollama: OllamaConfig;
}

interface SettingsState {
  settings: AppSettings | null;
  keysMask: Record<string, boolean>;
  loadSettings: () => Promise<string | null>;
  updateRoleModel: (role: string, model: string) => Promise<void>;
  updateSettings: (patch: object) => Promise<void>;
  saveApiKey: (name: string, value: string) => Promise<void>;
  loadKeysMask: () => Promise<void>;
}

function baseUrl(): string {
  const port = useAppStore.getState().backendPort;
  return `http://127.0.0.1:${port}`;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  keysMask: {},

  loadSettings: async (): Promise<string | null> => {
    try {
      const data: AppSettings = await fetch(`${baseUrl()}/settings`).then((r) => r.json());
      set({ settings: data });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  updateRoleModel: async (role, model) => {
    const data: AppSettings = await fetch(`${baseUrl()}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: { [role]: { model } } }),
    }).then((r) => r.json());
    set({ settings: data });
  },

  updateSettings: async (patch) => {
    const data: AppSettings = await fetch(`${baseUrl()}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => r.json());
    set({ settings: data });
  },

  saveApiKey: async (name, value) => {
    await fetch(`${baseUrl()}/settings/keys`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [name]: value }),
    });
  },

  loadKeysMask: async () => {
    const mask: Record<string, boolean> = await fetch(
      `${baseUrl()}/settings/keys`
    ).then((r) => r.json());
    set({ keysMask: mask });
  },
}));
