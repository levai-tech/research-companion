import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ResourcesTab from "./ResourcesTab";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
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
