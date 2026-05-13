import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Composer from "./Composer";

function renderComposer(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const defaults = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
  };
  return render(<Composer {...defaults} {...overrides} />);
}

// ── Behavior 1: renders (tracer bullet) ──────────────────────────────────────

describe("Composer — renders", () => {
  it("renders a textarea with the given placeholder", () => {
    renderComposer({ placeholder: "Say something…" });
    expect(screen.getByPlaceholderText("Say something…")).toBeInTheDocument();
  });
});

// ── Behavior 2: Enter sends ──────────────────────────────────────────────────

describe("Composer — Enter key", () => {
  it("calls onSend when Enter is pressed with non-empty content", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderComposer({ value: "Hello", onSend });
    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("does not call onSend when Shift+Enter is pressed", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderComposer({ value: "Hello", onSend });
    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
  });
});

// ── Behavior 3: empty input guard ────────────────────────────────────────────

describe("Composer — empty input", () => {
  it("does not call onSend when value is empty and Enter is pressed", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderComposer({ value: "", onSend });
    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
