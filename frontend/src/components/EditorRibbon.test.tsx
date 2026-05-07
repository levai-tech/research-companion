import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock useEditorState to return all-inactive by default.
// Tests that need active state override selector results directly.
vi.mock("@tiptap/react", () => ({
  useEditorState: vi.fn(({ selector, editor }) => selector({ editor })),
}));

import EditorRibbon from "./EditorRibbon";

function makeEditor(isActiveImpl: (name: string, attrs?: Record<string, unknown>) => boolean = () => false) {
  return {
    isActive: vi.fn(isActiveImpl),
    commands: {
      setParagraph: vi.fn(),
      toggleHeading: vi.fn(),
      toggleBold: vi.fn(),
      toggleItalic: vi.fn(),
      toggleBulletList: vi.fn(),
      toggleOrderedList: vi.fn(),
    },
  };
}

describe("EditorRibbon", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Behavior 1: renders all formatting buttons ────────────────────────────

  it("renders Normal, H1, H2, H3, Bold, Italic, Bullet List, and Numbered List buttons", () => {
    render(<EditorRibbon editor={makeEditor() as never} />);

    expect(screen.getByRole("button", { name: "Normal text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "H1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "H2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "H3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Italic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bullet List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Numbered List" })).toBeInTheDocument();
  });

  // ── Behavior 2: bold/italic/paragraph direct commands ────────────────────

  it("clicking Bold calls editor.commands.toggleBold()", async () => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(editor.commands.toggleBold).toHaveBeenCalled();
  });

  it("clicking Italic calls editor.commands.toggleItalic()", async () => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(editor.commands.toggleItalic).toHaveBeenCalled();
  });

  it("clicking Normal text calls editor.commands.setParagraph()", async () => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Normal text" }));
    expect(editor.commands.setParagraph).toHaveBeenCalled();
  });

  // ── Behavior 3: heading commands ──────────────────────────────────────────

  it.each([
    ["H1", 1],
    ["H2", 2],
    ["H3", 3],
  ] as const)("clicking %s calls editor.commands.toggleHeading({ level: %i })", async (label, level) => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(editor.commands.toggleHeading).toHaveBeenCalledWith({ level });
  });

  // ── Behavior 4: list commands ─────────────────────────────────────────────

  it("clicking Bullet List calls editor.commands.toggleBulletList()", async () => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Bullet List" }));
    expect(editor.commands.toggleBulletList).toHaveBeenCalled();
  });

  it("clicking Numbered List calls editor.commands.toggleOrderedList()", async () => {
    const editor = makeEditor();
    render(<EditorRibbon editor={editor as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Numbered List" }));
    expect(editor.commands.toggleOrderedList).toHaveBeenCalled();
  });

  // ── Behavior 5: active state via useEditorState ───────────────────────────

  it("Bold button has aria-pressed=true when isActive('bold') returns true", () => {
    const editor = makeEditor((name) => name === "bold");
    render(<EditorRibbon editor={editor as never} />);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("H2 button has aria-pressed=true when isActive('heading', {level:2}) returns true", () => {
    const editor = makeEditor((name, attrs) => name === "heading" && attrs?.level === 2);
    render(<EditorRibbon editor={editor as never} />);
    expect(screen.getByRole("button", { name: "H2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "H1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "H3" })).toHaveAttribute("aria-pressed", "false");
  });

  // ── Behavior 6: null editor renders nothing ───────────────────────────────

  it("renders nothing when editor is null", () => {
    const { container } = render(<EditorRibbon editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
