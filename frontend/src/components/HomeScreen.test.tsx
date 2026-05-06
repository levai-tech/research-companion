import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomeScreen from "./HomeScreen";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

function mockProjects(projects: object[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(projects),
  } as Response);
}

// ── Behavior 7: empty state ───────────────────────────────────────────────────

describe("HomeScreen — empty state", () => {
  it("shows a prompt and New Project button when no projects exist", async () => {
    mockProjects([]);
    render(<HomeScreen />);

    await screen.findByRole("button", { name: /new project/i });
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });
});

// ── Behavior 8: project cards ─────────────────────────────────────────────────

describe("HomeScreen — project list", () => {
  it("renders a card for each project with title and document type", async () => {
    mockProjects([
      {
        id: "abc-123",
        title: "Quantum Future",
        topic: "Quantum computing",
        theme: "Accessibility",
        angle: "Security risks",
        document_type: "book",
        layout_id: "three-act",
        last_modified: "2026-05-06T12:00:00+00:00",
      },
    ]);

    render(<HomeScreen />);

    await screen.findByText("Quantum Future");
    expect(screen.getByText(/book/i)).toBeInTheDocument();
  });

  it("still shows the New Project button alongside existing projects", async () => {
    mockProjects([
      {
        id: "abc-123",
        title: "My Essay",
        topic: "AI",
        theme: "Ethics",
        angle: "Bias",
        document_type: "essay",
        layout_id: "classic",
        last_modified: "2026-05-06T12:00:00+00:00",
      },
    ]);

    render(<HomeScreen />);

    await screen.findByText("My Essay");
    expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
  });
});
