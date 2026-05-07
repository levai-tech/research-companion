import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JobTray from "./JobTray";
import { useJobTrayStore, type JobEntry } from "../jobTrayStore";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function makeJob(overrides: Partial<JobEntry> = {}): JobEntry {
  return {
    resourceId: "res-1",
    projectId: "proj-1",
    title: "My Book",
    status: "indexing",
    chunksDone: 2,
    chunksTotal: 10,
    errorMessage: null,
    completedAt: null,
    ...overrides,
  };
}

function mockEmptyList() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  } as Response);
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  useJobTrayStore.setState({ jobs: {} });
  vi.clearAllMocks();
});

// ── Behavior 1: hidden when no active jobs ────────────────────────────────────

it("is hidden when there are no active or recently completed jobs", async () => {
  global.fetch = mockEmptyList();

  const { container } = render(<JobTray projectId="proj-1" />);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalled();
  });

  expect(container).toBeEmptyDOMElement();
});

// ── Behavior 2: active job shows title + progress bar ────────────────────────

it("shows resource title and progress bar for an active job", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob() },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByText("My Book")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
});

// ── Behavior 3: animated spinner for active jobs ──────────────────────────────

it("shows an animated spinner for queued and indexing jobs", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ status: "indexing" }) },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("My Book");
  expect(screen.getByLabelText("indexing")).toBeInTheDocument();
});

// ── Behavior 8: seed from resource list on mount ─────────────────────────────

it("seeds the tray from pre-existing indexing resources on mount", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve([
        {
          id: "res-existing",
          indexing_status: "indexing",
          citation_metadata: { title: "Pre-existing Book" },
        },
        {
          id: "res-ready",
          indexing_status: "ready",
          citation_metadata: { title: "Already Done" },
        },
      ]),
  } as Response);

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("Pre-existing Book");
  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/projects/proj-1/resources",
  );
  // "ready" resources are not seeded — they're already done
  expect(screen.queryByText("Already Done")).not.toBeInTheDocument();
});

// ── Behavior 7: multiple simultaneous jobs ────────────────────────────────────

it("shows all active jobs when multiple are indexing simultaneously", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({ resourceId: "res-1", title: "Book One" }),
      "res-2": makeJob({
        resourceId: "res-2",
        title: "Book Two",
        status: "queued",
        chunksDone: 0,
        chunksTotal: 0,
      }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("Book One");
  expect(screen.getByText("Book Two")).toBeInTheDocument();
});

// ── Behavior 6: completed job auto-dismisses after 5 seconds ─────────────────

describe("auto-dismiss", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("completed job disappears 5 seconds after it finishes", () => {
    vi.useFakeTimers();
    global.fetch = mockEmptyList();
    useJobTrayStore.setState({
      jobs: {
        "res-1": makeJob({ status: "ready", completedAt: Date.now() }),
      },
    });

    render(<JobTray projectId="proj-1" />);

    // Store is pre-seeded — component renders synchronously
    expect(screen.getByText("My Book")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText("My Book")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("My Book")).not.toBeInTheDocument();
  });
});

// ── Behavior 5: failed job shows error + dismiss button ──────────────────────

it("shows error message for a failed job and dismiss button removes it", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({
        status: "failed",
        errorMessage: "Embedding service unavailable",
      }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("My Book");
  expect(
    screen.getByText("Embedding service unavailable"),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));

  expect(screen.queryByText("My Book")).not.toBeInTheDocument();
});

// ── Behavior 4: progress updates from polling ─────────────────────────────────

describe("polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls GET /status every 2 seconds for active jobs", async () => {
    vi.useFakeTimers();
    global.fetch = mockEmptyList();
    useJobTrayStore.setState({
      jobs: { "res-1": makeJob({ status: "indexing" }) },
    });

    render(<JobTray projectId="proj-1" />);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/resources/res-1/status",
    );
  });

  it("progress bar updates when the store job is updated", async () => {
    global.fetch = mockEmptyList();
    useJobTrayStore.setState({
      jobs: { "res-1": makeJob({ chunksDone: 2, chunksTotal: 10 }) },
    });

    render(<JobTray projectId="proj-1" />);

    await screen.findByText("My Book");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );

    act(() => {
      useJobTrayStore.getState().updateJob("res-1", { chunksDone: 7 });
    });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "7",
    );
  });
});
