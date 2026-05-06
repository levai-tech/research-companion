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
  // ── Behavior 10: icon controls render on each card ───────────────────────────

  it("shows tick, cross, and pencil icon controls on each angle card", async () => {
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

    expect(screen.getAllByRole("button", { name: /^accept$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^remove$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^edit$/i })).toHaveLength(3);
  });

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

  // ── Behavior 11: cross removes card from list ─────────────────────────────────

  it("removes an angle card when user clicks Remove", async () => {
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

    const removeButtons = screen.getAllByRole("button", { name: /^remove$/i });
    await userEvent.click(removeButtons[0]);

    expect(screen.queryByText("The Clock Is Ticking")).not.toBeInTheDocument();
    expect(screen.getByText("Ordinary People, Extraordinary Risk")).toBeInTheDocument();
  });

  // ── Behavior 12: undo toast restores removed card ─────────────────────────────

  it("shows undo toast after remove and restores card on undo click", async () => {
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

    await userEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]);

    expect(screen.queryByText("The Clock Is Ticking")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /undo/i }));

    expect(screen.getByText("The Clock Is Ticking")).toBeInTheDocument();
  });

  // ── Behavior 8: edit an angle title and description inline ───────────────────

  it("lets user edit title and description inline via pencil", async () => {
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

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await userEvent.click(editButtons[0]);

    const titleInput = screen.getByDisplayValue("The Clock Is Ticking");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Time Is Running Out");

    const descInput = screen.getByDisplayValue("How quantum computers will crack today's encryption.");
    await userEvent.clear(descInput);
    await userEvent.type(descInput, "The countdown has begun.");

    expect(screen.getByDisplayValue("Time Is Running Out")).toBeInTheDocument();
    expect(screen.getByDisplayValue("The countdown has begun.")).toBeInTheDocument();
  });

  // ── Behavior 9: confirm PATCH sends remaining cards, fires onComplete ─────────

  it("calls PATCH with remaining angles (excluding removed) and fires onComplete", async () => {
    const onComplete = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PROPOSED_ANGLES) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    render(
      <AngleExplorer
        projectId="proj-1"
        topic="Quantum computing"
        documentType="book"
        onComplete={onComplete}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    // Accept first angle, remove second
    await userEvent.click(screen.getAllByRole("button", { name: /^accept$/i })[0]);
    await userEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]);

    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]: [string]) => url.endsWith("/angles") && !url.endsWith("/propose"),
    );
    const body = JSON.parse(patchCall[1].body);
    expect(body.angles).toHaveLength(2);
    expect(body.angles.some((a: { title: string }) => a.title === "The Clock Is Ticking")).toBe(false);

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
