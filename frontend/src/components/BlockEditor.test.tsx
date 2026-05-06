import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TipTapDoc } from "../types/editor";

// Capture the onUpdate callback that BlockEditor passes to useEditor so tests can trigger it.
let capturedOnUpdate: ((args: { editor: { getJSON: () => TipTapDoc } }) => void) | undefined;

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn((options: { onUpdate?: (args: { editor: { getJSON: () => TipTapDoc } }) => void }) => {
    capturedOnUpdate = options?.onUpdate;
    return {
      getJSON: () => ({ type: "doc" as const, content: [] }),
      commands: { setContent: vi.fn() },
    };
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { useAppStore } from "../store";
import BlockEditor from "./BlockEditor";

const DEFAULT_DOC: TipTapDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "My Project" }] },
    { type: "paragraph" },
  ],
};

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  capturedOnUpdate = undefined;
  vi.clearAllMocks();
});

// ── Behavior 1: fetches document from backend on mount ─────────────────────────

describe("BlockEditor", () => {
  it("fetches document from GET /projects/{id}/document on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DEFAULT_DOC),
    } as Response);

    render(<BlockEditor projectId="proj-1" />);

    await screen.findByTestId("editor-content");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/projects/proj-1/document",
    );
  });

  // ── Behavior 2: debounced auto-save PUT on content change ──────────────────

  it("PUTs updated content after onUpdate fires", async () => {
    const savedDoc: TipTapDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(DEFAULT_DOC) } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    vi.useFakeTimers();
    render(<BlockEditor projectId="proj-1" />);
    // EditorContent renders synchronously via the mock
    screen.getByTestId("editor-content");

    act(() => {
      capturedOnUpdate?.({ editor: { getJSON: () => savedDoc } });
      vi.runAllTimers();
    });

    // Flush microtasks (the fetch promise) with real timers
    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8000/projects/proj-1/document",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(savedDoc),
        }),
      );
    });
  });
});
