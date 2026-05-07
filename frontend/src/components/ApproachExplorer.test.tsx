import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ApproachExplorer from "./ApproachExplorer";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

const PROPOSED_APPROACHES = [
  { title: "The Clock Is Ticking", description: "How quantum computers will crack today's encryption." },
  { title: "Ordinary People, Extraordinary Risk", description: "What average users stand to lose." },
  { title: "The Quantum Arms Race", description: "Nation-state competition for quantum supremacy." },
];

function mockPropose(approaches = PROPOSED_APPROACHES) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(approaches),
  } as Response);
}

// ── Behavior 1: renders 3 proposed approaches on mount ────────────────────────

it("shows 3 proposed approaches with title and description on mount", async () => {
  global.fetch = mockPropose();

  render(
    <ApproachExplorer
      projectId="proj-1"
      transcriptSummary="Quantum computing threatens encryption."
      onComplete={vi.fn()}
    />,
  );

  await screen.findByText("The Clock Is Ticking");
  expect(screen.getByText("Ordinary People, Extraordinary Risk")).toBeInTheDocument();
  expect(screen.getByText("The Quantum Arms Race")).toBeInTheDocument();

  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/projects/proj-1/approaches/propose",
    expect.objectContaining({ method: "POST" }),
  );
});

// ── Behavior 2: radio single-select ───────────────────────────────────────────

describe("ApproachExplorer — radio selection", () => {
  it("selecting a card marks it selected and deselects others", async () => {
    global.fetch = mockPropose();

    render(
      <ApproachExplorer
        projectId="proj-1"
        transcriptSummary="Quantum computing threatens encryption."
        onComplete={vi.fn()}
      />,
    );

    await screen.findByText("The Clock Is Ticking");

    const radioButtons = screen.getAllByRole("radio");
    expect(radioButtons).toHaveLength(3);

    await userEvent.click(radioButtons[0]);
    expect(radioButtons[0]).toBeChecked();
    expect(radioButtons[1]).not.toBeChecked();
    expect(radioButtons[2]).not.toBeChecked();

    await userEvent.click(radioButtons[2]);
    expect(radioButtons[0]).not.toBeChecked();
    expect(radioButtons[2]).toBeChecked();
  });
});

// ── Behavior 4: show me more options fires a fresh propose ───────────────────

it("clicking 'Show me more options' requests a fresh batch", async () => {
  global.fetch = mockPropose();

  render(
    <ApproachExplorer
      projectId="proj-1"
      transcriptSummary="Quantum computing threatens encryption."
      onComplete={vi.fn()}
    />,
  );

  await screen.findByText("The Clock Is Ticking");

  await userEvent.click(screen.getByRole("button", { name: /show me more options/i }));

  expect(global.fetch).toHaveBeenCalledTimes(2);
  const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
  expect(url).toContain("/approaches/propose");
});

// ── Behavior 5: Confirm Approach calls PATCH with selected approach ───────────

it("Confirm Approach calls PATCH /approach with the selected approach and fires onComplete", async () => {
  const onComplete = vi.fn();

  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PROPOSED_APPROACHES) } as Response)
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as Response);

  render(
    <ApproachExplorer
      projectId="proj-1"
      transcriptSummary="Quantum computing threatens encryption."
      onComplete={onComplete}
    />,
  );

  await screen.findByText("The Clock Is Ticking");

  await userEvent.click(screen.getAllByRole("radio")[1]);

  await userEvent.click(screen.getByRole("button", { name: /confirm approach/i }));

  const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
    ([url]: [string]) => url.endsWith("/approach"),
  );
  expect(patchCall).toBeDefined();
  expect(patchCall[1].method).toBe("PATCH");
  const body = JSON.parse(patchCall[1].body);
  expect(body.approach.title).toBe("Ordinary People, Extraordinary Risk");

  await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
});

// ── Behavior 3: inline edit via pencil ────────────────────────────────────────

it("lets user edit title and description inline via pencil", async () => {
  global.fetch = mockPropose();

  render(
    <ApproachExplorer
      projectId="proj-1"
      transcriptSummary="Quantum computing threatens encryption."
      onComplete={vi.fn()}
    />,
  );

  await screen.findByText("The Clock Is Ticking");

  const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
  await userEvent.click(editButtons[0]);

  const titleInput = screen.getByDisplayValue("The Clock Is Ticking");
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, "Time Is Running Out");

  const descInput = screen.getByDisplayValue("How quantum computers will crack today's encryption.");
  await userEvent.clear(descInput);
  await userEvent.type(descInput, "The countdown has begun.");

  expect(screen.getByDisplayValue("Time Is Running Out")).toBeInTheDocument();
  expect(screen.getByDisplayValue("The countdown has begun.")).toBeInTheDocument();
});
