import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProjectWorkspace from "./ProjectWorkspace";
import { useAppStore } from "../store";
import { useJobTrayStore } from "../jobTrayStore";
import { useViewStore } from "../viewStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./JobTray", () => ({
  default: () => null,
}));

vi.mock("./ApproachExplorer", () => ({
  default: () => <div data-testid="approach-explorer">ApproachExplorer</div>,
}));

vi.mock("./OutlineGenerator", () => ({
  default: () => <div data-testid="outline-generator">OutlineGenerator</div>,
}));

vi.mock("./BlockEditor", () => ({
  default: () => <div data-testid="block-editor">BlockEditor</div>,
}));

const PROJECT = {
  id: "proj-1",
  title: "Quantum Future",
  topic: "Quantum computing",
  document_type: "book",
  last_modified: "2026-05-07T10:00:00+00:00",
};

const TRANSCRIPT = {
  id: "tr-1",
  project_id: "proj-1",
  summary: "The author wants to write about quantum threats to encryption.",
  messages: [
    { role: "assistant", content: "What would you like to write about?" },
    { role: "user", content: "Quantum computing and encryption." },
    { role: "assistant", content: "Great topic! Who is your audience?" },
  ],
  created_at: "2026-05-07T10:00:00+00:00",
};

function mockFetch({
  approach = null,
  transcript = TRANSCRIPT,
  outline = { sections: [] },
  resourceCount = 0,
}: {
  approach?: object | null;
  transcript?: object | null;
  outline?: object;
  resourceCount?: number;
} = {}) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/approach")) {
      return Promise.resolve({
        ok: approach !== null,
        status: approach !== null ? 200 : 404,
        json: () => Promise.resolve(approach),
      } as Response);
    }
    if (url.endsWith("/transcript")) {
      return Promise.resolve({
        ok: transcript !== null,
        status: transcript !== null ? 200 : 404,
        json: () => Promise.resolve(transcript),
      } as Response);
    }
    if (url.endsWith("/outline")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(outline),
      } as Response);
    }
    if (url.endsWith("/resources")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(Array.from({ length: resourceCount }, (_, i) => ({ id: `r-${i}` }))),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  useJobTrayStore.setState({ jobs: {} });
  vi.clearAllMocks();
});

// ── Behavior 2: default tab is Transcript ────────────────────────────────────

describe("ProjectWorkspace — default tab", () => {
  it("shows Transcript tab content immediately after load", async () => {
    mockFetch();
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    // Transcript content should be visible without clicking anything
    await screen.findByText("The author wants to write about quantum threats to encryption.");
  });
});

// ── Behavior 3: transcript tab shows summary then messages, read-only ────────

describe("ProjectWorkspace — transcript content", () => {
  it("shows summary above chat messages", async () => {
    mockFetch();
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findByText("The author wants to write about quantum threats to encryption.");

    // All 3 messages visible
    expect(screen.getByText("What would you like to write about?")).toBeInTheDocument();
    expect(screen.getByText("Quantum computing and encryption.")).toBeInTheDocument();
    expect(screen.getByText("Great topic! Who is your audience?")).toBeInTheDocument();

    // Summary appears before (above) the first message in the DOM
    const summary = screen.getByText("The author wants to write about quantum threats to encryption.");
    const firstMsg = screen.getByText("What would you like to write about?");
    expect(summary.compareDocumentPosition(firstMsg)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("has no text input or send button in transcript tab", async () => {
    mockFetch();
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findByText("The author wants to write about quantum threats to encryption.");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });
});

// ── Behavior 4: navigating to Approach tab shows ApproachExplorer ────────────

describe("ProjectWorkspace — approach tab navigation", () => {
  it("shows ApproachExplorer when user switches to Approach tab and no approach is confirmed", async () => {
    mockFetch({ approach: null });
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    // Start on transcript tab
    await screen.findByText("The author wants to write about quantum threats to encryption.");
    expect(screen.queryByTestId("approach-explorer")).toBeNull();

    // Navigate to approach tab
    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.click(screen.getByRole("button", { name: /^approach$/i }))
    );

    expect(screen.getByTestId("approach-explorer")).toBeInTheDocument();
  });
});

// ── Behavior 5: completion badges ────────────────────────────────────────────

describe("ProjectWorkspace — tab badges", () => {
  it("shows ✓ badge on Transcript tab when transcript exists", async () => {
    mockFetch({ transcript: TRANSCRIPT });
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findByText("The author wants to write about quantum threats to encryption.");

    const transcriptTab = screen.getByRole("button", { name: /^transcript/i });
    expect(transcriptTab).toHaveTextContent("✓");
  });

  it("does not show ✓ badge on Transcript tab when no transcript", async () => {
    mockFetch({ transcript: null });
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findAllByRole("button", { name: /transcript/i });

    const transcriptTab = screen.getByRole("button", { name: /^transcript/i });
    expect(transcriptTab).not.toHaveTextContent("✓");
  });
});

// ── Behavior 6: Resources chip in header ─────────────────────────────────────

describe("ProjectWorkspace — Resources chip", () => {
  it("shows 'Resources · N' chip with the project's resource count", async () => {
    mockFetch({ resourceCount: 3 });
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findByText(/resources\s*·\s*3/i);
  });

  it("clicking Resources chip navigates to resources view with the project id", async () => {
    mockFetch({ resourceCount: 2 });
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    const chip = await screen.findByText(/resources\s*·\s*2/i);
    await userEvent.click(chip);

    const { view, activeProjectId } = useViewStore.getState();
    expect(view).toBe("resources");
    expect(activeProjectId).toBe(PROJECT.id);
  });
});

// ── Behavior 1: 4 tabs render in order, no Resources tab ─────────────────────

describe("ProjectWorkspace — tab structure", () => {
  it("renders 4 tabs in order: Transcript, Approach, Outline, Editor", async () => {
    mockFetch();
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    const tabs = await screen.findAllByRole("button", {
      name: /transcript|approach|outline|editor/i,
    });

    const tabLabels = tabs.map((t) => t.textContent?.replace("✓", "").trim().toLowerCase());
    expect(tabLabels).toContain("transcript");
    expect(tabLabels).toContain("approach");
    expect(tabLabels).toContain("outline");
    expect(tabLabels).toContain("editor");

    const transcriptIdx = tabLabels.indexOf("transcript");
    const approachIdx = tabLabels.indexOf("approach");
    const outlineIdx = tabLabels.indexOf("outline");
    const editorIdx = tabLabels.indexOf("editor");

    expect(transcriptIdx).toBeLessThan(approachIdx);
    expect(approachIdx).toBeLessThan(outlineIdx);
    expect(outlineIdx).toBeLessThan(editorIdx);
  });

  it("does not render a Resources tab", async () => {
    mockFetch();
    render(<ProjectWorkspace project={PROJECT} onBack={vi.fn()} />);

    await screen.findAllByRole("button", { name: /transcript/i });

    expect(screen.queryByRole("button", { name: /^resources$/i })).toBeNull();
  });
});
