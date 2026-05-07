import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Interview from "./Interview";
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

// ── Behavior 9: interview conversation ───────────────────────────────────────

describe("Interview", () => {
  it("shows the first AI question on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CHAT_RESPONSE),
    } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/interview",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends user message and displays next AI reply", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Interesting! What angle?" }) } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Interesting! What angle?");
  });

it("calls POST /projects and POST /transcript, then fires onProjectCreated when Done is clicked", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "proj-99", title: "Quantum computing", topic: "Quantum computing", document_type: "book", last_modified: "2026-05-07T10:00:00+00:00" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects",
      expect.objectContaining({ method: "POST" }),
    );
    await vi.waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1));
  });

  // ── Behavior: Done is idempotent — double-click creates only one project ─────

  it("clicking Done twice only creates one project", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "proj-99", title: "Quantum computing", topic: "Quantum computing", document_type: "book", last_modified: "2026-05-07T10:00:00+00:00" }),
      } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");

    const done = screen.getByRole("button", { name: /done/i });
    await userEvent.click(done);
    await userEvent.click(done);

    const projectPostCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url === "http://127.0.0.1:8000/projects",
    );
    await vi.waitFor(() => expect(projectPostCalls).toHaveLength(1));
  });
});
