import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ResourcesPage from "./ResourcesPage";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(0) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

vi.mock("./AddResourceModal", () => ({
  default: ({
    onResourceAdded,
  }: {
    projectId: string;
    onClose: () => void;
    onResourceAdded: (r: unknown) => void;
  }) => (
    <div role="dialog" aria-label="Add Resource Modal">
      <button
        onClick={() =>
          onResourceAdded({
            id: "new-res",
            resource_type: "Book",
            indexing_status: "queued",
            citation_metadata: { title: "New Book" },
            content_hash: "h99",
            created_at: "2026-01-01T00:00:00Z",
            project_ids: [],
          })
        }
      >
        Confirm Add
      </button>
    </div>
  ),
}));

const PROJECTS = [
  { id: "proj-1", title: "My Book", topic: "AI", document_type: "book", last_modified: "2026-05-01T00:00:00Z" },
  { id: "proj-2", title: "Tech Article", topic: "tech", document_type: "article", last_modified: "2026-05-02T00:00:00Z" },
];

const RESOURCES = [
  {
    id: "res-1",
    resource_type: "Book",
    indexing_status: "ready",
    citation_metadata: { title: "The Art of War" },
    content_hash: "h1",
    created_at: "2026-01-01T00:00:00Z",
    project_ids: ["proj-1"],
  },
  {
    id: "res-2",
    resource_type: "Webpage",
    indexing_status: "indexing",
    citation_metadata: { title: "BBC News" },
    content_hash: "h2",
    created_at: "2026-01-02T00:00:00Z",
    project_ids: ["proj-2"],
  },
  {
    id: "res-3",
    resource_type: "Book",
    indexing_status: "queued",
    citation_metadata: { title: "Multi-Project Book" },
    content_hash: "h3",
    created_at: "2026-01-03T00:00:00Z",
    project_ids: ["proj-1", "proj-2"],
  },
];

function mockFetch(resources = RESOURCES, projects = PROJECTS) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/projects")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(projects) } as Response);
    }
    if (url.includes("/resources")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(resources) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
  });
}

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

// ── Cycle 1: tracer bullet ────────────────────────────────────────────────────

it("renders an h1 with 'Resources'", async () => {
  mockFetch();
  render(<ResourcesPage />);
  expect(await screen.findByRole("heading", { name: /^Resources/i })).toBeInTheDocument();
});

// ── Cycle 2: count in header ──────────────────────────────────────────────────

it("shows total resource count in the header", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  expect(screen.getByText(/3 indexed/i)).toBeInTheDocument();
});

// ── Cycle 3: subtitle copy ────────────────────────────────────────────────────

it("shows the subtitle copy about Buddy and ⌘K", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  expect(screen.getByText(/indexed semantically/i)).toBeInTheDocument();
});

// ── Cycle 4: All filter chip ──────────────────────────────────────────────────

it("shows an 'All' filter chip that is active by default", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  const allChip = screen.getByRole("button", { name: /^All/i });
  expect(allChip).toBeInTheDocument();
  expect(allChip).toHaveAttribute("aria-pressed", "true");
});

// ── Cycle 5: per-project chips ────────────────────────────────────────────────

it("shows a chip for each project that has at least one resource", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  expect(screen.getByRole("button", { name: /My Book/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Tech Article/i })).toBeInTheDocument();
});

it("does not show a chip for a project with no resources", async () => {
  const resourcesForProj1Only = RESOURCES.map((r) => ({
    ...r,
    project_ids: ["proj-1"],
  }));
  mockFetch(resourcesForProj1Only);
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  expect(screen.queryByRole("button", { name: /Tech Article/i })).not.toBeInTheDocument();
});

// ── Cycle 6: initialFilterId pre-selects chip ────────────────────────────────

it("pre-selects the project chip matching initialFilterId", async () => {
  mockFetch();
  render(<ResourcesPage initialFilterId="proj-2" />);
  await screen.findByRole("heading", { name: /^Resources/i });
  const chip = await screen.findByRole("button", { name: /Tech Article/i });
  expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "false");
});

// ── Cycle 7: resource rows ────────────────────────────────────────────────────

it("shows each resource title in the list", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByText("The Art of War");
  expect(screen.getByText("BBC News")).toBeInTheDocument();
  expect(screen.getByText("Multi-Project Book")).toBeInTheDocument();
});

it("shows a StatusPill for each resource", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByText("The Art of War");
  expect(screen.getByText("ready")).toBeInTheDocument();
  expect(screen.getByText("indexing")).toBeInTheDocument();
  expect(screen.getByText("queued")).toBeInTheDocument();
});

it("shows project chips for each project a resource belongs to", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByText("Multi-Project Book");
  const multiRow = screen.getByText("Multi-Project Book").closest("div[class]")!.parentElement!;
  expect(multiRow).toHaveTextContent("My Book");
  expect(multiRow).toHaveTextContent("Tech Article");
});

// ── Cycle 8: project filter ───────────────────────────────────────────────────

it("clicking a project chip filters resources to that project only", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByText("The Art of War");

  await userEvent.click(screen.getByRole("button", { name: /^My Book/i }));

  expect(screen.getByText("The Art of War")).toBeInTheDocument();
  expect(screen.getByText("Multi-Project Book")).toBeInTheDocument();
  expect(screen.queryByText("BBC News")).not.toBeInTheDocument();
});

it("clicking All after a project filter restores the full list", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByText("The Art of War");

  await userEvent.click(screen.getByRole("button", { name: /^My Book/i }));
  await userEvent.click(screen.getByRole("button", { name: /^All/i }));

  expect(screen.getByText("BBC News")).toBeInTheDocument();
});

// ── Cycle 9: empty state ──────────────────────────────────────────────────────

it("shows empty state when no resources exist", async () => {
  mockFetch([]);
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });
  expect(screen.getByText(/no resources in this scope/i)).toBeInTheDocument();
});

it("shows empty state when active project filter has no resources", async () => {
  const proj3Resources = RESOURCES.filter((r) => !r.project_ids.includes("proj-1"));
  const resourcesOnlyProj2 = proj3Resources;
  // proj-1 has resources but proj-2 only has some; use a fresh project with no resources
  const extraProject = [
    ...PROJECTS,
    { id: "proj-3", title: "Empty Project", topic: "none", document_type: "book", last_modified: "2026-05-03T00:00:00Z" },
  ];
  // put all resources under proj-1, leave proj-3 empty
  const allUnderProj1 = RESOURCES.map((r) => ({ ...r, project_ids: ["proj-1"] }));
  mockFetch(allUnderProj1, extraProject);
  render(<ResourcesPage initialFilterId="proj-3" />);
  await screen.findByRole("heading", { name: /^Resources/i });
  // proj-3 chip won't appear (no resources), so All chip is shown; but filtered result is empty because
  // initialFilterId="proj-3" means filter is set to proj-3 which has no resources.
  await waitFor(() => {
    expect(screen.getByText(/no resources in this scope/i)).toBeInTheDocument();
  });
});

// ── Cycle 10: delete ──────────────────────────────────────────────────────────

describe("ResourcesPage — delete", () => {
  it("clicking delete calls DELETE endpoint and removes row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      if (url.includes("/projects")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(PROJECTS) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RESOURCES) } as Response);
    });

    render(<ResourcesPage />);
    await screen.findByText("The Art of War");

    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/resources/res-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.queryByText("The Art of War")).not.toBeInTheDocument();
  });

  it("does not delete when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/projects")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(PROJECTS) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RESOURCES) } as Response);
    });

    render(<ResourcesPage />);
    await screen.findByText("The Art of War");

    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(screen.getByText("The Art of War")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/resources/res-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

// ── Cycle 11: re-index ────────────────────────────────────────────────────────

it("clicking re-index calls POST /resources/{id}/reingest", async () => {
  global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === "POST" && url.includes("/reingest")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (url.includes("/projects")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PROJECTS) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(RESOURCES) } as Response);
  });

  render(<ResourcesPage />);
  await screen.findByText("The Art of War");

  await userEvent.click(screen.getAllByRole("button", { name: /re-index/i })[0]);

  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/resources/res-1/reingest",
    expect.objectContaining({ method: "POST" }),
  );
});

it("optimistically updates the status pill to 'indexing' after re-index", async () => {
  global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === "POST" && url.includes("/reingest")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (url.includes("/projects")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PROJECTS) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(RESOURCES) } as Response);
  });

  render(<ResourcesPage />);
  await screen.findByText("The Art of War");

  // res-1 starts as "ready"
  const reIndexButtons = screen.getAllByRole("button", { name: /re-index/i });
  await userEvent.click(reIndexButtons[0]);

  await waitFor(() => {
    // now there should be 2 "indexing" pills (res-2 was already indexing, res-1 now becomes indexing)
    expect(screen.getAllByText("indexing")).toHaveLength(2);
  });
});

// ── Cycle 12: Add resource modal ──────────────────────────────────────────────

it("clicking Add resource opens the AddResourceModal", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });

  await userEvent.click(screen.getByRole("button", { name: /add resource/i }));

  expect(screen.getByRole("dialog", { name: /add resource modal/i })).toBeInTheDocument();
});

it("adds the resource to the list when modal confirms", async () => {
  mockFetch();
  render(<ResourcesPage />);
  await screen.findByRole("heading", { name: /^Resources/i });

  await userEvent.click(screen.getByRole("button", { name: /add resource/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm add/i }));

  expect(screen.getByText("New Book")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
