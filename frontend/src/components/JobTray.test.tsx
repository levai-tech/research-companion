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
    currentStep: null,
    batchesTotal: 0,
    batchesFallback: 0,
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

// ── Behavior 9: step label absent when currentStep is null ───────────────────

it("does not render a step label when currentStep is null", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: null }) },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("My Book");
  expect(screen.queryByTestId("step-label")).not.toBeInTheDocument();
});

// ── Behavior 10: step label shows Extracting… ────────────────────────────────

it("shows Extracting… label when currentStep is extracting", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "extracting", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent("Extracting…");
});

// ── Behavior 11: step label shows Chunking… ──────────────────────────────────

it("shows Chunking… label when currentStep is bare chunking", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "chunking", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent("Chunking…");
});

it("shows Chunking N / M… label when currentStep includes batch progress", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "chunking:2/5", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent("Chunking 2 / 5…");
});

// ── Behavior 12: step label shows Embedding… when no chunks yet ──────────────

it("shows Embedding… label when currentStep is embedding but no chunks yet", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "embedding", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent("Embedding…");
});

// ── Behavior 13: step label shows Embedding N / M when chunks available ───────

it("shows Embedding N / M label when currentStep is embedding and chunks are available", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "embedding", chunksDone: 3, chunksTotal: 12 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent("Embedding 3 / 12");
});

// ── Behavior 14: rate-limited step label ─────────────────────────────────────

it("shows countdown when currentStep is rate_limited:N", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "rate_limited:45", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent(
    "API limit reached — retrying in 45s…",
  );
});

it("shows generic wait message when rate_limited has no countdown", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: { "res-1": makeJob({ currentStep: "rate_limited", chunksDone: 0, chunksTotal: 0 }) },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByTestId("step-label")).toHaveTextContent(
    "API limit reached — waiting to retry…",
  );
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
    "http://127.0.0.1:8000/resources",
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

// ── Behavior 15: fallback ratio warning ──────────────────────────────────────

it("shows fallback warning when more than 25% of batches fell back", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({
        status: "ready",
        completedAt: null,
        batchesTotal: 4,
        batchesFallback: 2,
      }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  expect(await screen.findByText(/2 of 4 batches used recursive fallback/i)).toBeInTheDocument();
});

it("does not show fallback warning when batchesTotal is 0", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({ status: "ready", completedAt: null, batchesTotal: 0, batchesFallback: 0 }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("My Book");
  expect(screen.queryByText(/batches used recursive fallback/i)).not.toBeInTheDocument();
});

it("does not show fallback warning when ratio is at or below 25%", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({ status: "ready", completedAt: null, batchesTotal: 4, batchesFallback: 1 }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  await screen.findByText("My Book");
  expect(screen.queryByText(/batches used recursive fallback/i)).not.toBeInTheDocument();
});

it("shows Re-ingest button alongside fallback warning", async () => {
  global.fetch = mockEmptyList();
  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({
        status: "ready",
        completedAt: null,
        batchesTotal: 4,
        batchesFallback: 2,
      }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  expect(
    await screen.findByRole("button", { name: /re-ingest with recursive chunker/i }),
  ).toBeInTheDocument();
});

it("clicking Re-ingest button POSTs to the reingest endpoint", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
  global.fetch = fetchMock;

  useJobTrayStore.setState({
    jobs: {
      "res-1": makeJob({
        status: "ready",
        completedAt: null,
        batchesTotal: 4,
        batchesFallback: 2,
      }),
    },
  });

  render(<JobTray projectId="proj-1" />);

  await userEvent.click(
    await screen.findByRole("button", { name: /re-ingest with recursive chunker/i }),
  );

  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/resources/res-1/reingest",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "recursive" }),
    }),
  );
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
      "http://127.0.0.1:8000/resources/res-1/status",
    );
  });

  it("propagates current_step from status response to step label", async () => {
    vi.useFakeTimers();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            indexing_status: "indexing",
            chunks_done: 0,
            chunks_total: 0,
            error_message: null,
            current_step: "extracting",
          }),
      } as Response);

    useJobTrayStore.setState({
      jobs: { "res-1": makeJob({ currentStep: null }) },
    });

    render(<JobTray projectId="proj-1" />);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("step-label")).toHaveTextContent("Extracting…");
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
