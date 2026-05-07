import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSettingsStore } from "./settingsStore";
import { useAppStore } from "./store";

beforeEach(() => {
  useAppStore.setState({ backendPort: 8099 });
  useSettingsStore.setState({ settings: null, keysMask: {} });
  vi.clearAllMocks();
});

const mockSettings = {
  roles: {
    approach_explorer: { model: "mistralai/mistral-7b-instruct:free" },
    research_agent: { model: "mistralai/mistral-7b-instruct:free" },
    literature_review: { model: "mistralai/mistral-7b-instruct:free" },
    editor_ai: { model: "mistralai/mistral-7b-instruct:free" },
    outline_generator: { model: "mistralai/mistral-7b-instruct:free" },
  },
  search_provider: "tavily",
  ollama: { endpoint: "http://localhost:11434", embedding_model: "nomic-embed-text" },
};

describe("useSettingsStore", () => {
  it("loadSettings fetches from backend and stores result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockSettings),
      ok: true,
    } as Response);

    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.loadSettings());

    expect(global.fetch).toHaveBeenCalledWith("http://127.0.0.1:8099/settings");
    expect(result.current.settings?.search_provider).toBe("tavily");
    expect(result.current.settings?.roles.approach_explorer.model).toBe("mistralai/mistral-7b-instruct:free");
  });

  it("updateRoleModel PUTs to backend and updates local state", async () => {
    useSettingsStore.setState({ settings: mockSettings, keysMask: {} });

    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ...mockSettings,
          roles: { ...mockSettings.roles, editor_ai: { model: "anthropic/claude-sonnet-4.6" } },
        }),
      ok: true,
    } as Response);

    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.updateRoleModel("editor_ai", "anthropic/claude-sonnet-4.6"));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8099/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ roles: { editor_ai: { model: "anthropic/claude-sonnet-4.6" } } }),
      })
    );
    expect(result.current.settings?.roles.editor_ai.model).toBe("anthropic/claude-sonnet-4.6");
  });

  it("saveApiKey PUTs to /settings/keys and does not store the value in state", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.saveApiKey("openrouter_api_key", "sk-secret"));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8099/settings/keys",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ openrouter_api_key: "sk-secret" }),
      })
    );
    expect(JSON.stringify(result.current)).not.toContain("sk-secret");
  });

  it("loadKeysMask fetches boolean mask from backend", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ openrouter_api_key: true, tavily_api_key: false }),
      ok: true,
    } as Response);

    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.loadKeysMask());

    expect(result.current.keysMask.openrouter_api_key).toBe(true);
    expect(result.current.keysMask.tavily_api_key).toBe(false);
  });
});
