import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import { useAppStore } from "./store";
import { useJobTrayStore } from "./jobTrayStore";
import type { JobEntry } from "./jobTrayStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(0) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

const EMPTY_SETTINGS = {
  roles: {},
  search_provider: "tavily",
  ollama: { endpoint: "http://localhost:11434", embedding_model: "nomic-embed-text" },
};

function mockFetch(projects: object[] = []) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const body =
      typeof url === "string" && url.includes("/settings")
        ? EMPTY_SETTINGS
        : typeof url === "string" && url.includes("/keys")
        ? {}
        : projects;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as Response);
  });
}

function seedJob(overrides: Partial<JobEntry> = {}) {
  useJobTrayStore.setState({
    jobs: {
      "res-1": {
        resourceId: "res-1",
        projectId: "proj-1",
        title: "Some PDF",
        status: "indexing",
        chunksDone: 1,
        chunksTotal: 5,
        errorMessage: null,
        completedAt: null,
        currentStep: null,
        batchesTotal: 0,
        batchesFallback: 0,
        ...overrides,
      },
    },
  });
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  useJobTrayStore.setState({ jobs: {} });
  vi.clearAllMocks();
});

// ── Behavior 9: no top header ─────────────────────────────────────────────────

describe("App — layout", () => {
  it("renders no top-header element", async () => {
    mockFetch([]);
    render(<App />);
    expect(document.querySelector("header")).toBeNull();
  });

  it("renders the sidebar alongside the main content", async () => {
    mockFetch([]);
    render(<App />);
    expect(screen.getByText("Levai")).toBeInTheDocument();
  });
});

// ── Behavior 10: ⌘N resets to home view ──────────────────────────────────────

describe("App — ⌘N shortcut", () => {
  it("navigates to the home view when ⌘N is pressed", async () => {
    mockFetch([
      { id: "p1", title: "My Book", topic: "AI", document_type: "book", last_modified: "2026-05-01T00:00:00Z" },
    ]);
    render(<App />);

    // Navigate to settings first
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));

    // Press ⌘N
    fireEvent.keyDown(document, { key: "n", metaKey: true });

    // Home view should now be visible (HomeScreen)
    expect(screen.queryByRole("heading", { name: /settings/i })).toBeNull();
  });
});

// ── Behavior 11: JobTray globally visible ─────────────────────────────────────

describe("App — JobTray", () => {
  it("shows the JobTray region when a job is active, regardless of current view", async () => {
    mockFetch([]);
    seedJob();
    render(<App />);

    // Navigate to settings
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));

    // JobTray region should still be visible
    expect(screen.getByRole("region", { name: /indexing jobs/i })).toBeInTheDocument();
  });
});
