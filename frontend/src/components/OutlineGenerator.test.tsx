import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import OutlineGenerator from "./OutlineGenerator";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

const STRUCTURES = [
  { id: "chronological", title: "Chronological", rationale: "Traces the story from past to present.", tradeoff: "May bury the most urgent point." },
  { id: "thematic", title: "Thematic", rationale: "Groups chapters by theme.", tradeoff: "Can feel disconnected." },
  { id: "problem-solution", title: "Problem → Solution", rationale: "Opens with threat, closes with fix.", tradeoff: "Risks feeling formulaic." },
];

const SECTIONS = [
  {
    title: "The Ticking Clock",
    description: "Introduces the quantum threat timeline.",
    subsections: [
      { title: "What Quantum Computers Can Do Today", description: "Current capabilities." },
      { title: "The 10-Year Horizon", description: "When encryption breaks down." },
    ],
  },
  {
    title: "Ordinary People at Risk",
    description: "Makes the threat personal.",
    subsections: [
      { title: "Your Bank Account", description: "Financial data exposure." },
    ],
  },
];

const SAVED_OUTLINE = {
  structure: { id: "s1", project_id: "proj-1", structure_id: "chronological", title: "Chronological", rationale: "...", tradeoff: "..." },
  sections: SECTIONS,
};

function mockFetch(structures = STRUCTURES, outline = SAVED_OUTLINE) {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(structures) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(outline) } as Response);
}

// ── Behavior 1: renders structural options on mount ───────────────────────────

describe("OutlineGenerator", () => {
  it("shows structural options with title and tradeoff on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(STRUCTURES) } as Response);

    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    await screen.findByText("Chronological");
    expect(screen.getByText("Thematic")).toBeInTheDocument();
    expect(screen.getByText("Problem → Solution")).toBeInTheDocument();
    expect(screen.getByText("May bury the most urgent point.")).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/outline/structures",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // ── Behavior 2: user can select a structural option ───────────────────────────

  it("marks a structure selected when user clicks it", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(STRUCTURES) } as Response);

    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    await screen.findByText("Chronological");

    const cards = screen.getAllByRole("button", { name: /chronological|thematic|problem/i });
    await userEvent.click(cards[0]);

    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
  });

  // ── Behavior 3: generate button calls POST /outline/generate ─────────────────

  it("calls POST /outline/generate with selected structure on confirm", async () => {
    const onComplete = vi.fn();
    global.fetch = mockFetch();

    render(<OutlineGenerator projectId="proj-1" onComplete={onComplete} />);

    await screen.findByText("Chronological");
    await userEvent.click(screen.getAllByRole("button", { name: /chronological/i })[0]);
    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/outline/generate",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("chronological"),
      }),
    );
  });

  // ── Behavior 4: outline sections are displayed after generation ───────────────

  it("shows outline sections with subsections after generate", async () => {
    global.fetch = mockFetch();

    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    await screen.findByText("Chronological");
    await userEvent.click(screen.getAllByRole("button", { name: /chronological/i })[0]);
    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));

    await screen.findByText("The Ticking Clock");
    expect(screen.getByText("What Quantum Computers Can Do Today")).toBeInTheDocument();
    expect(screen.getByText("Ordinary People at Risk")).toBeInTheDocument();
    expect(screen.getByText("Your Bank Account")).toBeInTheDocument();
  });

  // ── Behavior 5: onComplete is called via Done button after outline shown ──────

  it("calls onComplete when user clicks Done after outline is displayed", async () => {
    const onComplete = vi.fn();
    global.fetch = mockFetch();

    render(<OutlineGenerator projectId="proj-1" onComplete={onComplete} />);

    await screen.findByText("Chronological");
    await userEvent.click(screen.getAllByRole("button", { name: /chronological/i })[0]);
    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));

    await screen.findByText("The Ticking Clock");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
