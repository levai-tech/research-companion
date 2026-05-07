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

const SAVED_OUTLINE = { sections: SECTIONS };

// ── Behavior 1: shows Generate Outline button on mount, no structure picker ───

describe("OutlineGenerator", () => {
  it("shows Generate Outline button immediately on mount with no structure picker", () => {
    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    expect(screen.getByRole("button", { name: /generate outline/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /chronological|thematic|problem/i })).toBeNull();
  });

  // ── Behavior 2: clicking Generate Outline calls POST /outline/generate ───────

  it("calls POST /outline/generate with no structure body when Generate Outline is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SAVED_OUTLINE),
    } as Response);

    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/outline/generate",
      expect.objectContaining({ method: "POST" }),
    );

    const callBody = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
    expect(callBody).toBeUndefined();
  });

  // ── Behavior 3: shows sections and subsections after generation ───────────────

  it("shows outline sections with subsections after generate", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SAVED_OUTLINE),
    } as Response);

    render(<OutlineGenerator projectId="proj-1" onComplete={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));

    await screen.findByText("The Ticking Clock");
    expect(screen.getByText("What Quantum Computers Can Do Today")).toBeInTheDocument();
    expect(screen.getByText("Ordinary People at Risk")).toBeInTheDocument();
    expect(screen.getByText("Your Bank Account")).toBeInTheDocument();
  });

  // ── Behavior 4: Done button calls onComplete ──────────────────────────────────

  it("calls onComplete when user clicks Done after outline is displayed", async () => {
    const onComplete = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SAVED_OUTLINE),
    } as Response);

    render(<OutlineGenerator projectId="proj-1" onComplete={onComplete} />);

    await userEvent.click(screen.getByRole("button", { name: /generate outline/i }));
    await screen.findByText("The Ticking Clock");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
