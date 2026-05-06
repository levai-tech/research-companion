import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SetupChat from "./SetupChat";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

const CHAT_RESPONSE = {
  phase: "chat",
  message: "What topic are you writing about?",
};

const SUGGEST_RESPONSE = {
  phase: "suggest",
  message: "Here are some layouts for your book.",
  layouts: [
    { id: "three-act", name: "Three-Act Structure", description: "Classic narrative arc." },
    { id: "inverted-pyramid", name: "Inverted Pyramid", description: "Lead with conclusions." },
  ],
  project_metadata: {
    topic: "Quantum computing",
    theme: "Accessibility",
    angle: "Security risks",
    document_type: "book",
  },
};

// ── Behavior 9: setup chat conversation ───────────────────────────────────────

describe("SetupChat", () => {
  it("shows the first AI question on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CHAT_RESPONSE),
    } as Response);

    render(<SetupChat onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/setup/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends user message and displays next AI reply", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Interesting! What angle?" }) } as Response);

    render(<SetupChat onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Interesting! What angle?");
  });

  // ── Behavior 10: layout picker ─────────────────────────────────────────────

  it("shows layout options when AI enters suggest phase", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_RESPONSE) } as Response);

    render(<SetupChat onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Quantum computing for everyone");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Three-Act Structure");
    expect(screen.getByText("Inverted Pyramid")).toBeInTheDocument();
  });

  it("calls POST /projects and fires onProjectCreated when user picks a layout", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_RESPONSE) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "new-uuid", title: "My Project", ...SUGGEST_RESPONSE.project_metadata, layout_id: "three-act", last_modified: "2026-05-06T12:00:00+00:00" }),
      } as Response);

    render(<SetupChat onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.type(screen.getByRole("textbox"), "Quantum computing for everyone");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Three-Act Structure");
    await userEvent.click(screen.getByRole("button", { name: /three-act structure/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects",
      expect.objectContaining({ method: "POST" }),
    );
    await vi.waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1));
  });
});
