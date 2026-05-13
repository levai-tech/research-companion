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

const SUGGEST_TITLE_RESPONSE = { title: "Quantum Computing and Security" };
const PROJECT_RESPONSE = {
  id: "proj-99",
  title: "Quantum Computing and Security",
  topic: "Quantum computing",
  document_type: "book",
  last_modified: "2026-05-07T10:00:00+00:00",
};

// ── Behavior 10: Skip escape hatch ───────────────────────────────────────────

describe("Skip escape hatch", () => {
  it("does NOT show 'Skip to approach' before user sends any message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CHAT_RESPONSE),
    } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    expect(screen.queryByRole("button", { name: /skip to approach/i })).toBeNull();
    expect(screen.queryByText(/skip to approach/i)).toBeNull();
  });

  it("shows 'Skip to approach' after user sends first message", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Tell me more." }) } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Tell me more.");
    expect(screen.getByText(/skip to approach/i)).toBeInTheDocument();
  });

  it("clicking Skip shows naming prompt, does NOT immediately create a project", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Tell me more." }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.type(screen.getByRole("textbox"), "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Tell me more.");

    await userEvent.click(screen.getByText(/skip to approach/i));

    await screen.findByDisplayValue("Quantum Computing and Security");

    const postToProjcts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url === "http://127.0.0.1:8000/projects",
    );
    expect(postToProjcts).toHaveLength(0);
  });

  it("confirming naming prompt creates project and fires onProjectCreated", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Tell me more." }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PROJECT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.type(screen.getByRole("textbox"), "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Tell me more.");

    await userEvent.click(screen.getByText(/skip to approach/i));
    await screen.findByDisplayValue("Quantum Computing and Security");

    await userEvent.click(screen.getByRole("button", { name: /create project/i }));

    await vi.waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1));
    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "proj-99" }));
  });

  it("user can edit the pre-filled title before confirming", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ phase: "chat", message: "Tell me more." }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...PROJECT_RESPONSE, title: "My Custom Title" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.type(screen.getByRole("textbox"), "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Tell me more.");

    await userEvent.click(screen.getByText(/skip to approach/i));
    const titleInput = await screen.findByDisplayValue("Quantum Computing and Security");

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "My Custom Title");
    await userEvent.click(screen.getByRole("button", { name: /create project/i }));

    await vi.waitFor(() => {
      const projectPost = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]: [string]) => url === "http://127.0.0.1:8000/projects",
      );
      expect(projectPost).toBeDefined();
      const body = JSON.parse(projectPost[1].body);
      expect(body.title).toBe("My Custom Title");
    });
  });
});

// ── Behavior 11: Done button triggers naming prompt ───────────────────────────

describe("Done button → naming prompt", () => {
  it("clicking Done shows naming prompt instead of immediately creating a project", async () => {
    const readyResponse = {
      phase: "ready",
      message: "I think I have enough — continue or click Done.",
      project_metadata: { topic: "Quantum computing", document_type: "book" },
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(readyResponse) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response);

    render(<Interview onProjectCreated={vi.fn()} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.type(screen.getByRole("textbox"), "Quantum computing");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("I think I have enough — continue or click Done.");

    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    await screen.findByDisplayValue("Quantum Computing and Security");

    const projectPosts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url === "http://127.0.0.1:8000/projects",
    );
    expect(projectPosts).toHaveLength(0);
  });
});

// ── Behavior 12: initialMessage prop — pre-seeds the first user message ───────

describe("Interview — initialMessage prop", () => {
  it("pre-loads the initial message and sends it immediately on mount", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phase: "chat", message: "Interesting! What angle?" }),
      } as Response);

    render(<Interview onProjectCreated={vi.fn()} initialMessage="A feature on quantum computing" />);

    await screen.findByText("A feature on quantum computing");
    await screen.findByText("Interesting! What angle?");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/interview",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("A feature on quantum computing"),
      }),
    );
  });

  it("shows the 'Skip to approach' link immediately when initialMessage is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phase: "chat", message: "Interesting!" }),
    } as Response);

    render(<Interview onProjectCreated={vi.fn()} initialMessage="A feature on quantum computing" />);

    await screen.findByText("A feature on quantum computing");
    expect(screen.getByText(/skip to approach/i)).toBeInTheDocument();
  });
});

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

it("Done → naming prompt → Create project fires onProjectCreated", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PROJECT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    await screen.findByDisplayValue("Quantum Computing and Security");
    await userEvent.click(screen.getByRole("button", { name: /create project/i }));

    await vi.waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1));
    expect(onProjectCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "proj-99" }));
  });

  // ── Behavior: Create project is idempotent — double-click creates only one ───

  it("clicking Create project twice only creates one project", async () => {
    const onProjectCreated = vi.fn();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CHAT_RESPONSE) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUGGEST_TITLE_RESPONSE) } as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(PROJECT_RESPONSE),
      } as Response);

    render(<Interview onProjectCreated={onProjectCreated} />);

    await screen.findByText("What topic are you writing about?");
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    await screen.findByDisplayValue("Quantum Computing and Security");

    const confirm = screen.getByRole("button", { name: /create project/i });
    await userEvent.click(confirm);
    await userEvent.click(confirm);

    await vi.waitFor(() => {
      const projectPostCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]: [string]) => url === "http://127.0.0.1:8000/projects",
      );
      expect(projectPostCalls).toHaveLength(1);
    });
  });
});
