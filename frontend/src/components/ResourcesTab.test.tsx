import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ResourcesTab from "./ResourcesTab";
import { useAppStore } from "../store";
import { useJobTrayStore } from "../jobTrayStore";

vi.mock("./AddResourceModal", () => ({
  default: ({
    onResourceAdded,
  }: {
    onResourceAdded: (r: unknown) => void;
    projectId: string;
    onClose: () => void;
  }) => (
    <div role="dialog">
      <button
        onClick={() =>
          onResourceAdded({
            id: "new-res",
            resource_type: "Book",
            indexing_status: "queued",
            citation_metadata: { title: "New Book" },
            content_hash: "h3",
            created_at: "2026-01-01T00:00:00Z",
          })
        }
      >
        Confirm Add
      </button>
    </div>
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  useJobTrayStore.setState({ jobs: {} });
  vi.clearAllMocks();
});

const RESOURCES = [
  {
    id: "res-1",
    resource_type: "Book",
    indexing_status: "ready",
    citation_metadata: { title: "The Art of War" },
    content_hash: "h1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "res-2",
    resource_type: "Webpage",
    indexing_status: "queued",
    citation_metadata: { title: "BBC News Article" },
    content_hash: "h2",
    created_at: "2026-01-02T00:00:00Z",
  },
];

function mockList(resources = RESOURCES) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(resources),
  } as Response);
}

// ── Behavior 1: renders resource list on mount ────────────────────────────────

it("shows each resource's title, type, and indexing status badge", async () => {
  global.fetch = mockList();

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByText("The Art of War");
  expect(screen.getByText("BBC News Article")).toBeInTheDocument();
  expect(screen.getByText("Book")).toBeInTheDocument();
  expect(screen.getByText("Webpage")).toBeInTheDocument();
  expect(screen.getByText("ready")).toBeInTheDocument();
  expect(screen.getByText("queued")).toBeInTheDocument();

  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/projects/proj-1/resources",
  );
});

// ── Behavior 2: empty state ───────────────────────────────────────────────────

it("shows 'No resources yet' when project has no resources", async () => {
  global.fetch = mockList([]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByText(/no resources yet/i);
});

// ── Behavior 3: Add Resource button opens modal ───────────────────────────────

it("clicking Add Resource opens the Add Resource modal", async () => {
  global.fetch = mockList([]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.click(screen.getByRole("button", { name: /add resource/i }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

// ── Behavior 5: registers newly-added resource in job tray store ──────────────

it("registers a newly added queued resource in the job tray store", async () => {
  global.fetch = mockList([]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.click(screen.getByRole("button", { name: /add resource/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm add/i }));

  const jobs = useJobTrayStore.getState().jobs;
  expect(jobs["new-res"]).toBeDefined();
  expect(jobs["new-res"].title).toBe("New Book");
  expect(jobs["new-res"].projectId).toBe("proj-1");
});

// ── Behavior 4: delete button calls DELETE and removes resource from list ─────

describe("ResourcesTab — delete resource", () => {
  it("clicking delete calls DELETE endpoint and removes resource from list", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(RESOURCES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);

    render(<ResourcesTab projectId="proj-1" />);

    await screen.findByText("The Art of War");

    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await userEvent.click(deleteButtons[0]);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/resources/res-1",
      expect.objectContaining({ method: "DELETE" }),
    );

    expect(screen.queryByText("The Art of War")).not.toBeInTheDocument();
  });
});

// ── Behavior 6: search bar renders ───────────────────────────────────────────

it("renders a search input and submit button", async () => {
  global.fetch = mockList([]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });

  expect(screen.getByPlaceholderText(/search resources/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^search$/i })).toBeInTheDocument();
});

// ── Behavior 7: submitting search calls the API ───────────────────────────────

it("submitting the search form calls the search endpoint with the query", async () => {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) } as Response);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "quantum");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/projects/proj-1/resources/search?q=quantum"),
  );
});

// ── Behavior 8: results show chunk excerpt, title, type, and score ────────────

it("displays chunk excerpt, resource title, type, and score for each result", async () => {
  const result = {
    chunk_text: "Quantum entanglement is a phenomenon where particles become correlated.",
    score: 0.87,
    resource_type: "Book",
    citation_metadata: { title: "Quantum Physics" },
  };

  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [result] }) } as Response);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "quantum");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

  await screen.findByText(result.chunk_text);
  expect(screen.getByText(/Quantum Physics/)).toBeInTheDocument();
  expect(screen.getByText(/Book/)).toBeInTheDocument();
  expect(screen.getByText(/0\.87/)).toBeInTheDocument();
});

// ── Behavior 9: no search on keystroke ───────────────────────────────────────

it("does not call the search API on every keystroke", async () => {
  global.fetch = mockList([]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "quantum physics");

  expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
});

// ── Behavior 10: empty state when search returns no results ───────────────────

it("shows 'No results found' when search returns an empty list", async () => {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) } as Response);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "nothing");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

  await screen.findByText(/no results found/i);
});

const LONG_CHUNK = "QuantumPhysics".repeat(30); // 420 chars, no spaces
const LONG_CHUNK_RESULT = {
  chunk_text: LONG_CHUNK,
  score: 0.9,
  resource_type: "Book",
  citation_metadata: { title: "Big Book" },
};

function mockSearch(results = [LONG_CHUNK_RESULT]) {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results }) } as Response);
}

async function renderAndSearch(projectId = "proj-1") {
  render(<ResourcesTab projectId={projectId} />);
  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "quantum");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
}

// ── Behavior 11: long chunk is truncated by default ───────────────────────────

it("shows a truncated preview of a long chunk by default", async () => {
  global.fetch = mockSearch();

  await renderAndSearch();

  const preview = await screen.findByText(/^QuantumPhysics/);
  expect(preview.textContent).toMatch(/…$/);
  expect(screen.queryByText(LONG_CHUNK, { normalizer: (s) => s })).not.toBeInTheDocument();
});

// ── Behavior 12: clicking the result card reveals the full chunk ──────────────

it("clicking a result card reveals the full chunk text", async () => {
  global.fetch = mockSearch();

  await renderAndSearch();

  const preview = await screen.findByText(/^QuantumPhysics/);
  await userEvent.click(preview.closest("li")!);

  await screen.findByText(LONG_CHUNK, { normalizer: (s) => s });
});

// ── Behavior 14: location label shown when result has a location ──────────────

it("shows a location label when the search result has a location", async () => {
  const result = {
    chunk_text: "Some relevant passage.",
    score: 0.75,
    resource_type: "Book",
    citation_metadata: { title: "My Book" },
    location: "p. 12",
  };

  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [result] }) } as Response);

  render(<ResourcesTab projectId="proj-1" />);
  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "passage");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

  await screen.findByText("Some relevant passage.");
  expect(screen.getByText(/p\. 12/)).toBeInTheDocument();
});

// ── Behavior 15: location label absent when location is null ──────────────────

it("does not render a location label when location is null", async () => {
  const result = {
    chunk_text: "Some relevant passage.",
    score: 0.75,
    resource_type: "Book",
    citation_metadata: { title: "My Book" },
    location: null,
  };

  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [result] }) } as Response);

  render(<ResourcesTab projectId="proj-1" />);
  await screen.findByRole("button", { name: /add resource/i });
  await userEvent.type(screen.getByPlaceholderText(/search resources/i), "passage");
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

  await screen.findByText("Some relevant passage.");
  expect(screen.queryByText("null")).not.toBeInTheDocument();
  // score line should not contain a location separator
  expect(screen.getByText(/Score: 0\.75/)).not.toHaveTextContent(/·/);
});

// ── Behavior 13: clicking the expanded card collapses it back ─────────────────

it("clicking an expanded result card collapses back to preview", async () => {
  global.fetch = mockSearch();

  await renderAndSearch();

  const preview = await screen.findByText(/^QuantumPhysics/);
  await userEvent.click(preview.closest("li")!);

  const fullEl = await screen.findByText(LONG_CHUNK, { normalizer: (s) => s });
  await userEvent.click(fullEl.closest("li")!);

  const collapsed = await screen.findByText(/^QuantumPhysics/);
  expect(collapsed.textContent).toMatch(/…$/);
});

// ── Behavior 16: fallback ratio warning on resource list row ──────────────────

it("shows fallback warning on a resource row when ratio > 25%", async () => {
  global.fetch = mockList([
    {
      id: "res-hi-fallback",
      resource_type: "Book",
      indexing_status: "ready",
      citation_metadata: { title: "Batch Heavy Book" },
      content_hash: "hbf",
      created_at: "2026-01-01T00:00:00Z",
      batches_total: 4,
      batches_fallback: 2,
    },
  ]);

  render(<ResourcesTab projectId="proj-1" />);

  expect(
    await screen.findByText(/2 of 4 batches used recursive fallback/i),
  ).toBeInTheDocument();
});

it("does not show fallback warning when batches_total is 0", async () => {
  global.fetch = mockList([
    {
      id: "res-no-batches",
      resource_type: "Book",
      indexing_status: "ready",
      citation_metadata: { title: "Plain Book" },
      content_hash: "hpb",
      created_at: "2026-01-01T00:00:00Z",
      batches_total: 0,
      batches_fallback: 0,
    },
  ]);

  render(<ResourcesTab projectId="proj-1" />);

  await screen.findByText("Plain Book");
  expect(
    screen.queryByText(/batches used recursive fallback/i),
  ).not.toBeInTheDocument();
});
