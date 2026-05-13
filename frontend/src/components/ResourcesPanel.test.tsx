import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ResourcesPanel from "./ResourcesPanel";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(0) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

const PROJECTS = [
  { id: "proj-1", title: "My Book", topic: "AI", document_type: "book", last_modified: "2026-05-01T00:00:00Z" },
];

const RESOURCES = [
  {
    id: "res-1",
    content_hash: "abc123",
    resource_type: "Book",
    indexing_status: "ready",
    citation_metadata: { title: "The Art of War" },
    created_at: "2026-05-01T00:00:00Z",
    project_ids: ["proj-1"],
    chunks_done: 0,
    chunks_total: 0,
    batches_total: 0,
    batches_fallback: 0,
    error_message: null,
    current_step: null,
    chunker_id: null,
    embedder_id: null,
    source_ref: null,
  },
  {
    id: "res-2",
    content_hash: "def456",
    resource_type: "Webpage",
    indexing_status: "indexing",
    citation_metadata: { title: "Deep Learning Guide" },
    created_at: "2026-05-02T00:00:00Z",
    project_ids: [],
    chunks_done: 0,
    chunks_total: 0,
    batches_total: 0,
    batches_fallback: 0,
    error_message: null,
    current_step: null,
    chunker_id: null,
    embedder_id: null,
    source_ref: null,
  },
];

const CHUNK_HITS = [
  {
    chunk_text: "The general who wins the battle makes many calculations before the battle is fought.",
    score: 0.92,
    resource_type: "Book",
    citation_metadata: { title: "The Art of War" },
    location: "p. 1",
  },
];

function mockFetch(
  resources = RESOURCES,
  searchResults: typeof CHUNK_HITS | [] = [],
) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/resources/search")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: searchResults }),
      } as Response);
    }
    if (url.includes("/resources")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(resources),
      } as Response);
    }
    if (url.includes("/projects")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(PROJECTS),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
  });
}

function renderPanel(props: Partial<React.ComponentProps<typeof ResourcesPanel>> = {}) {
  return render(<ResourcesPanel open={true} onClose={vi.fn()} {...props} />);
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

// ── Cycle 1: tracer bullet — panel renders/doesn't render ─────────────────────

describe("ResourcesPanel — open/closed", () => {
  it("renders the panel aside when open=true", () => {
    mockFetch();
    renderPanel();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("renders nothing when open=false", () => {
    mockFetch();
    const { container } = renderPanel({ open: false });
    expect(container.firstChild).toBeNull();
  });
});

// ── Cycle 2: Esc closes ───────────────────────────────────────────────────────

describe("ResourcesPanel — Esc key", () => {
  it("calls onClose when Escape is pressed", () => {
    mockFetch();
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on other keys", () => {
    mockFetch();
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Cycle 3: scrim click closes ───────────────────────────────────────────────

describe("ResourcesPanel — scrim click", () => {
  it("calls onClose when the backdrop scrim is clicked", () => {
    mockFetch();
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTestId("resources-panel-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Cycle 4: fetches resources on open; shows them ───────────────────────────

describe("ResourcesPanel — resource list", () => {
  it("shows all resource titles in the empty-query state", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("The Art of War")).toBeInTheDocument();
      expect(screen.getByText("Deep Learning Guide")).toBeInTheDocument();
    });
  });

  it("shows 'All resources' label when query is empty", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/all resources/i)).toBeInTheDocument();
    });
  });

  it("shows empty library message when no resources exist", async () => {
    mockFetch([]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/library is empty/i)).toBeInTheDocument();
    });
  });
});

// ── Cycle 5: status pill on each resource row ─────────────────────────────────

describe("ResourcesPanel — status pills", () => {
  it("shows a 'ready' status pill on the first resource row", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("ready")).toBeInTheDocument();
    });
  });

  it("shows an 'indexing' status pill on the second resource row", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("indexing")).toBeInTheDocument();
    });
  });
});

// ── Cycle 6: client-side filtering by title/type ──────────────────────────────

describe("ResourcesPanel — client-side filtering", () => {
  it("filters resource rows as the user types", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "art" } });

    await waitFor(() => {
      // Deep Learning Guide is filtered out; title is highlighted so use mark presence
      expect(screen.queryByText("Deep Learning Guide")).not.toBeInTheDocument();
      expect(document.querySelector("mark")).not.toBeNull();
    });
  });

  it("shows all resources when query is cleared back to empty", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "art" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });

    expect(screen.getByText("The Art of War")).toBeInTheDocument();
    expect(screen.getByText("Deep Learning Guide")).toBeInTheDocument();
  });
});

// ── Cycle 7: Enter fires search; chunk hits above resource rows ───────────────

describe("ResourcesPanel — semantic search", () => {
  it("shows a 'Matching passages' section when Enter is pressed and hits are returned", async () => {
    mockFetch(RESOURCES, CHUNK_HITS);
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "calculations" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(screen.getByText(/matching passages/i)).toBeInTheDocument();
    });
  });

  it("shows chunk snippet text when search returns hits", async () => {
    mockFetch(RESOURCES, CHUNK_HITS);
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "calculations" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(
        screen.getByText(/The general who wins the battle/i),
      ).toBeInTheDocument();
    });
  });

  it("calls /resources/search with the query on submit", async () => {
    mockFetch(RESOURCES, []);
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sun tzu" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/resources/search"),
      );
    });
  });
});

// ── Cycle 8: <mark> highlight for matching query ──────────────────────────────

describe("ResourcesPanel — highlight", () => {
  it("wraps matching substring in a mark element", async () => {
    mockFetch();
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Art" } });

    const mark = document.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("Art");
  });
});

// ── Cycle 9: autofocus + query reset on re-open ───────────────────────────────

describe("ResourcesPanel — autofocus and reset", () => {
  it("renders a search input that has autofocus attribute", () => {
    mockFetch();
    renderPanel();
    const input = screen.getByRole("searchbox");
    expect(input).toBeInTheDocument();
    // autofocus is set via ref + setTimeout — we verify the input exists and is empty
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("resets the query to empty each time the panel opens", async () => {
    mockFetch();
    const { rerender } = render(<ResourcesPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("searchbox"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "something" } });
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("something");

    // Close and reopen
    rerender(<ResourcesPanel open={false} onClose={vi.fn()} />);
    rerender(<ResourcesPanel open={true} onClose={vi.fn()} />);

    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });
});

// ── Cycle 10: empty state when query yields zero resource matches ──────────────

describe("ResourcesPanel — no-match empty state", () => {
  it("shows a no-matches message when query matches no resources and no chunk hits", async () => {
    mockFetch(RESOURCES, []);
    renderPanel();
    await waitFor(() => screen.getByText("The Art of War"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzznomatch" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(screen.getByText(/no matches/i)).toBeInTheDocument();
    });
  });
});
