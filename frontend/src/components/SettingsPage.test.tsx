import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPage from "./SettingsPage";
import { useSettingsStore } from "../settingsStore";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const BASE_SETTINGS = {
  display_name: "Jake",
  roles: {
    project_advisor: { model: "" },
    approach_explorer: { model: "mistralai/mistral-7b-instruct:free" },
    research_agent: { model: "" },
    literature_review: { model: "" },
    editor_ai: { model: "google/gemini-flash-1.5" },
    outline_generator: { model: "" },
    semantic_ingester: { model: "" },
  },
  search_provider: "tavily",
  ollama: { endpoint: "http://localhost:11434", embedding_model: "nomic-embed-text" },
};

function mockFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(BASE_SETTINGS),
  } as Response);
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8099 });
  useSettingsStore.setState({
    settings: BASE_SETTINGS,
    keysMask: { openrouter_api_key: true, tavily_api_key: false },
  });
  mockFetch();
  vi.clearAllMocks();
  mockFetch(); // re-set after clearAllMocks
});

// ── Behavior 2: Display Name field renders at top ─────────────────────────────

describe("SettingsPage — display name field", () => {
  it("renders a Display name section heading", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: /display name/i })).toBeInTheDocument();
  });

  it("shows the current display_name value in the read-only chip", () => {
    render(<SettingsPage />);
    // "Jake" appears in the display name chip
    const chip = screen.getByText("Jake");
    expect(chip).toBeInTheDocument();
  });
});

// ── Behavior 3: saving display name ──────────────────────────────────────────

describe("SettingsPage — saving display name", () => {
  it("calls updateSettings with display_name when saved", async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      settings: BASE_SETTINGS,
      keysMask: {},
      updateSettings,
    } as any);

    render(<SettingsPage />);

    // First Edit button in the page belongs to Display Name field
    const editBtns = screen.getAllByRole("button", { name: /^edit$/i });
    fireEvent.click(editBtns[0]);

    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "Alice" } });

    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ display_name: "Alice" });
    });
  });
});

// ── Behavior 4: model row shows Catalogue default as placeholder ──────────────

describe("SettingsPage — Catalogue default placeholder", () => {
  it("shows the Catalogue default for project_advisor when model is empty", () => {
    render(<SettingsPage />);
    // project_advisor has model "" — chip should show the catalogue default
    const chips = screen.getAllByText("mistralai/mistral-7b-instruct:free");
    expect(chips.length).toBeGreaterThan(0);
  });

  it("shows the user-set model ID when a custom model is configured", () => {
    render(<SettingsPage />);
    expect(screen.getByText("google/gemini-flash-1.5")).toBeInTheDocument();
  });
});

// ── Behavior 5: Edit button enters editable mode ──────────────────────────────

describe("SettingsPage — Edit button on model row", () => {
  it("shows a text input after clicking Edit on a role row", () => {
    render(<SettingsPage />);
    const editBtns = screen.getAllByRole("button", { name: /^edit$/i });
    // editBtns[0] = Display Name, editBtns[1] = first role
    fireEvent.click(editBtns[1]);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});

// ── Behavior 6: clearing model calls updateRoleModel with empty string ────────

describe("SettingsPage — clear model reverts to Catalogue default", () => {
  it("calls updateRoleModel with empty string when cleared and saved", async () => {
    const updateRoleModel = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      settings: BASE_SETTINGS,
      keysMask: {},
      updateRoleModel,
    } as any);

    render(<SettingsPage />);

    // editor_ai has "google/gemini-flash-1.5" — find its Edit button
    const chip = screen.getByText("google/gemini-flash-1.5");
    const row = chip.parentElement!;
    fireEvent.click(row.querySelector("button")!); // Edit

    fireEvent.change(row.querySelector("input")!, { target: { value: "" } });
    fireEvent.click(row.querySelector("button")!); // Save (now first button in row)

    await waitFor(() => {
      expect(updateRoleModel).toHaveBeenCalledWith("editor_ai", "");
    });
  });
});

// ── Behavior 8: saving a non-empty model ID ───────────────────────────────────

describe("SettingsPage — saving a custom model ID", () => {
  it("calls updateRoleModel with the typed model ID when saved", async () => {
    const updateRoleModel = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({
      settings: BASE_SETTINGS,
      keysMask: {},
      updateRoleModel,
    } as any);

    render(<SettingsPage />);

    // semantic_ingester has a unique catalogue default — use it to avoid ambiguity
    const chip = screen.getByText("qwen/qwen3-next-80b-a3b-instruct:free");
    const row = chip.parentElement!;
    fireEvent.click(row.querySelector("button")!); // Edit

    fireEvent.change(row.querySelector("input")!, {
      target: { value: "anthropic/claude-opus-4-7" },
    });
    fireEvent.click(row.querySelector("button")!); // Save

    await waitFor(() => {
      expect(updateRoleModel).toHaveBeenCalledWith("semantic_ingester", "anthropic/claude-opus-4-7");
    });
  });
});

// ── Behavior 9: no Tier toggle ────────────────────────────────────────────────

describe("SettingsPage — no Tier toggle", () => {
  it("renders no Free or Paid toggle buttons", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: /^free$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^paid$/i })).toBeNull();
    expect(screen.queryByText(/\btier\b/i)).toBeNull();
  });
});
