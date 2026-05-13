import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Sidebar from "./Sidebar";
import type { Project } from "../hooks/useProjects";
import { useSettingsStore } from "../settingsStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const PROJECTS: Project[] = [
  { id: "p1", title: "Quantum Future", topic: "Quantum", document_type: "book", last_modified: "2026-05-01T00:00:00Z" },
  { id: "p2", title: "Ocean Deep", topic: "Ocean", document_type: "article", last_modified: "2026-05-02T00:00:00Z" },
];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const defaults = {
    view: "home" as const,
    activeProjectId: null,
    projects: PROJECTS,
    onNavigate: vi.fn(),
    onSelectProject: vi.fn(),
    onDeleteProject: vi.fn(),
  };
  return render(<Sidebar {...defaults} {...overrides} />);
}

// ── Behavior 1: brand wordmark (tracer bullet) ────────────────────────────────

describe("Sidebar — brand", () => {
  it("renders the Levai wordmark", () => {
    renderSidebar();
    expect(screen.getByText("Levai")).toBeInTheDocument();
  });
});

// ── Behavior 2: nav buttons ───────────────────────────────────────────────────

describe("Sidebar — nav buttons", () => {
  it("renders Settings, Resources, and Search resources buttons", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^resources$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search resources/i })).toBeInTheDocument();
  });

  it("shows ⌘K label on the Search resources button", () => {
    renderSidebar();
    const searchBtn = screen.getByRole("button", { name: /search resources/i });
    expect(searchBtn).toHaveTextContent("⌘K");
  });
});

// ── Behavior 3: active nav state ─────────────────────────────────────────────

describe("Sidebar — active nav state", () => {
  it("marks Settings as active when view is settings", () => {
    renderSidebar({ view: "settings" });
    expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Resources as active when view is resources", () => {
    renderSidebar({ view: "resources" });
    expect(screen.getByRole("button", { name: /^resources$/i })).toHaveAttribute("aria-current", "page");
  });

  it("no nav button is marked active on the home view", () => {
    renderSidebar({ view: "home" });
    const settingsBtn = screen.getByRole("button", { name: /^settings$/i });
    const resourcesBtn = screen.getByRole("button", { name: /^resources$/i });
    expect(settingsBtn).not.toHaveAttribute("aria-current", "page");
    expect(resourcesBtn).not.toHaveAttribute("aria-current", "page");
  });
});

// ── Behavior 4: new project CTA ──────────────────────────────────────────────

describe("Sidebar — new project CTA", () => {
  it("renders a New project button with ⌘N shortcut text", () => {
    renderSidebar();
    const btn = screen.getByRole("button", { name: /new project/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("⌘N");
  });
});

// ── Behavior 5: project list ──────────────────────────────────────────────────

describe("Sidebar — project list", () => {
  it("renders a button for each project", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /quantum future/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ocean deep/i })).toBeInTheDocument();
  });

  it("marks the active project with aria-current when in workspace view", () => {
    renderSidebar({ view: "workspace", activeProjectId: "p1" });
    expect(screen.getByRole("button", { name: /quantum future/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /ocean deep/i })).not.toHaveAttribute("aria-current", "page");
  });

  it("does not mark any project active when in a non-workspace view", () => {
    renderSidebar({ view: "settings", activeProjectId: "p1" });
    expect(screen.getByRole("button", { name: /quantum future/i })).not.toHaveAttribute("aria-current", "page");
  });
});

// ── Behavior 6: right-click context menu ─────────────────────────────────────

describe("Sidebar — project context menu", () => {
  it("shows Delete project option after right-clicking a project", () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole("button", { name: /quantum future/i }));
    expect(screen.getByRole("menuitem", { name: /delete project/i })).toBeInTheDocument();
  });

  it("hides the context menu when clicking elsewhere", async () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole("button", { name: /quantum future/i }));
    fireEvent.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: /delete project/i })).not.toBeInTheDocument();
    });
  });
});

// ── Behavior 7: delete confirmation ──────────────────────────────────────────

describe("Sidebar — delete confirmation", () => {
  it("opens a confirmation dialog when Delete project is clicked", () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole("button", { name: /quantum future/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete project/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onDeleteProject with the project id when confirmed", () => {
    const onDeleteProject = vi.fn();
    renderSidebar({ onDeleteProject });
    fireEvent.contextMenu(screen.getByRole("button", { name: /quantum future/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete project/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDeleteProject).toHaveBeenCalledWith("p1");
  });

  it("does not call onDeleteProject when cancelled", () => {
    const onDeleteProject = vi.fn();
    renderSidebar({ onDeleteProject });
    fireEvent.contextMenu(screen.getByRole("button", { name: /quantum future/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete project/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDeleteProject).not.toHaveBeenCalled();
  });
});

// ── Behavior 12: Search resources button calls onOpenSearch ──────────────────

describe("Sidebar — search resources button", () => {
  it("calls onOpenSearch when Search resources is clicked", () => {
    const onOpenSearch = vi.fn();
    renderSidebar({ onOpenSearch });
    fireEvent.click(screen.getByRole("button", { name: /search resources/i }));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });
});

// ── Behavior 8: footer ────────────────────────────────────────────────────────

describe("Sidebar — footer", () => {
  it("renders a non-empty avatar with initials and a display name", () => {
    renderSidebar();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toBeInTheDocument();
    const avatarEl = footer.querySelector("[aria-label='avatar']");
    expect(avatarEl).toBeTruthy();
    expect(avatarEl!.textContent).toMatch(/[A-Z]{1,3}/);
  });

  it("shows display_name from settings store in the footer", () => {
    useSettingsStore.setState({
      settings: {
        display_name: "Alice Writer",
        roles: {},
        search_provider: "tavily",
        ollama: { endpoint: "http://localhost:11434", embedding_model: "nomic-embed-text" },
      },
      keysMask: {},
    });
    renderSidebar();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Alice Writer");
  });

  it("falls back to a default when display_name is not set", () => {
    useSettingsStore.setState({ settings: null, keysMask: {} });
    renderSidebar();
    const footer = screen.getByRole("contentinfo");
    // Should show something (not crash or be empty)
    expect(footer.textContent).toBeTruthy();
  });
});
