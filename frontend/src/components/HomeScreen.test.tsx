import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomeScreen from "./HomeScreen";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

function mockResources(resources: object[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(resources),
  } as Response);
}

function renderHomeScreen(overrides: Partial<React.ComponentProps<typeof HomeScreen>> = {}) {
  const defaults = {
    projectCount: 0,
    onSendMessage: vi.fn(),
    onOpenSearch: vi.fn(),
  };
  return render(<HomeScreen {...defaults} {...overrides} />);
}

// ── Behavior 1: hero heading (tracer bullet) ──────────────────────────────────

describe("HomeScreen — hero", () => {
  it("renders the 'What are you working on?' heading", () => {
    mockResources([]);
    renderHomeScreen();
    expect(screen.getByRole("heading", { name: /what are you working on\?/i })).toBeInTheDocument();
  });
});

// ── Behavior 2: suggestion pills ─────────────────────────────────────────────

describe("HomeScreen — suggestion pills", () => {
  it("renders four suggestion pills", () => {
    mockResources([]);
    renderHomeScreen();
    expect(screen.getByText(/4,000-word feature for a magazine/i)).toBeInTheDocument();
    expect(screen.getByText(/literature review for my dissertation/i)).toBeInTheDocument();
    expect(screen.getByText(/op-ed pitching a contrarian take/i)).toBeInTheDocument();
    expect(screen.getByText(/reported essay with on-the-record sources/i)).toBeInTheDocument();
  });
});

// ── Behavior 3: clicking a pill calls onSendMessage ───────────────────────────

describe("HomeScreen — pill click", () => {
  it("calls onSendMessage with the pill text when a suggestion is clicked", async () => {
    const onSendMessage = vi.fn();
    const user = userEvent.setup();
    mockResources([]);
    renderHomeScreen({ onSendMessage });
    await user.click(screen.getByText(/4,000-word feature for a magazine/i));
    expect(onSendMessage).toHaveBeenCalledWith("A 4,000-word feature for a magazine");
  });
});

// ── Behavior 4: library chip — live resource count ────────────────────────────

describe("HomeScreen — library chip", () => {
  it("shows resource count live from GET /resources", async () => {
    mockResources([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);
    renderHomeScreen({ projectCount: 2 });
    await screen.findByText(/3 resources across 2 projects/i);
  });

  // ── Behavior 5: clicking chip calls onOpenSearch ──────────────────────────

  it("calls onOpenSearch when the library chip is clicked", async () => {
    const onOpenSearch = vi.fn();
    const user = userEvent.setup();
    mockResources([]);
    renderHomeScreen({ onOpenSearch });
    const chip = await screen.findByRole("button", { name: /search your library/i });
    await user.click(chip);
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });
});

// ── Behavior 6: Composer placeholder ─────────────────────────────────────────

describe("HomeScreen — Composer placeholder", () => {
  it("shows the pre-interview placeholder in the Composer", () => {
    mockResources([]);
    renderHomeScreen();
    expect(screen.getByPlaceholderText(/describe the piece — a magazine feature on…/i)).toBeInTheDocument();
  });
});

// ── Behavior 7: Composer sends on Enter ──────────────────────────────────────

describe("HomeScreen — Composer send", () => {
  it("calls onSendMessage when user types and presses Enter", async () => {
    const onSendMessage = vi.fn();
    const user = userEvent.setup();
    mockResources([]);
    renderHomeScreen({ onSendMessage });
    const textarea = screen.getByPlaceholderText(/describe the piece/i);
    await user.click(textarea);
    await user.type(textarea, "My feature on AI");
    await user.keyboard("{Enter}");
    expect(onSendMessage).toHaveBeenCalledWith("My feature on AI");
  });
});

// ── Behavior 8: hint text ─────────────────────────────────────────────────────

describe("HomeScreen — hint text", () => {
  it("shows hint text below the Composer", () => {
    mockResources([]);
    renderHomeScreen();
    expect(screen.getByText(/buddy will ask 3–5 follow-ups before suggesting an approach/i)).toBeInTheDocument();
  });
});
