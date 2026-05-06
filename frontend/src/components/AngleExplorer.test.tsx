import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AngleExplorer from "./AngleExplorer";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

const PROPOSED_ANGLES = [
  { title: "The Clock Is Ticking", description: "How quantum computers will crack today's encryption." },
  { title: "Ordinary People, Extraordinary Risk", description: "What average users stand to lose." },
  { title: "The Quantum Arms Race", description: "Nation-state competition for quantum supremacy." },
];

function mockPropose(angles = PROPOSED_ANGLES) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(angles),
  } as Response);
}

// ── Behavior 5: renders proposed angles ───────────────────────────────────────

describe("AngleExplorer", () => {
  it("shows proposed angles with title and description on mount", async () => {
    global.fetch = mockPropose();

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={vi.fn()}
      />,
    );

    await screen.findByText("The Clock Is Ticking");
    expect(screen.getByText("Ordinary People, Extraordinary Risk")).toBeInTheDocument();
    expect(screen.getByText("The Quantum Arms Race")).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/angles/propose",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // ── Behavior 6: accept an angle ───────────────────────────────────────────────

  it("marks an angle accepted when user clicks Accept", async () => {
    global.fetch = mockPropose();

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={vi.fn()}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    await userEvent.click(acceptButtons[0]);

    expect(acceptButtons[0]).toHaveAttribute("aria-pressed", "true");
  });

  // ── Behavior 7: reject an angle ───────────────────────────────────────────────

  it("marks an angle rejected when user clicks Reject", async () => {
    global.fetch = mockPropose();

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={vi.fn()}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    const rejectButtons = screen.getAllByRole("button", { name: /reject/i });
    await userEvent.click(rejectButtons[0]);

    expect(rejectButtons[0]).toHaveAttribute("aria-pressed", "true");
  });

  // ── Behavior 8: edit an angle title inline ────────────────────────────────────

  it("lets user edit an angle title inline", async () => {
    global.fetch = mockPropose();

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={vi.fn()}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const titleInput = screen.getByDisplayValue("The Clock Is Ticking");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Time Is Running Out");

    expect(screen.getByDisplayValue("Time Is Running Out")).toBeInTheDocument();
  });

  // ── Behavior 9: confirm calls PATCH and fires onComplete ──────────────────────

  it("calls PATCH with accepted angles and fires onComplete on confirm", async () => {
    const onComplete = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PROPOSED_ANGLES) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: "a1", project_id: "proj-1", title: "The Clock Is Ticking", description: "...", status: "accepted" },
        ]),
      } as Response);

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={onComplete}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    // Accept the first angle
    await userEvent.click(screen.getAllByRole("button", { name: /accept/i })[0]);

    // Confirm
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/angles",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("accepted"),
      }),
    );
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
