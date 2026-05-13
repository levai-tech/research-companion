import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddResourceModal from "./AddResourceModal";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const noop = vi.fn();

beforeEach(() => {
  useAppStore.setState({ backendPort: 8000 });
  vi.clearAllMocks();
});

const NEW_RESOURCE = {
  id: "res-new",
  resource_type: "Book",
  indexing_status: "queued",
  citation_metadata: { title: "My Book" },
  content_hash: "abc",
  created_at: "2026-01-01T00:00:00Z",
};

function renderModal(overrides = {}) {
  const props = {
    projectId: "proj-1",
    onClose: vi.fn(),
    onResourceAdded: vi.fn(),
    ...overrides,
  };
  render(<AddResourceModal {...props} />);
  return props;
}

// ── Behavior 1: File path is the default ─────────────────────────────────────

it("shows File tab selected by default with file picker and resource type control", () => {
  renderModal();

  const fileTab = screen.getByRole("button", { name: /upload file/i });
  expect(fileTab).toHaveAttribute("aria-pressed", "true");

  expect(screen.getByTestId("file-input")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /book/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /press.+journal article/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /source transcript/i })).toBeInTheDocument();
});

// ── Behavior 2: URL path locks type to Webpage ────────────────────────────────

it("switching to URL path shows URL input and hides resource type control", async () => {
  renderModal();

  await userEvent.click(screen.getByRole("button", { name: /paste url/i }));

  expect(screen.getByRole("textbox", { name: /url/i })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: /book/i })).not.toBeInTheDocument();
  expect(screen.getByText(/webpage/i)).toBeInTheDocument();
});

// ── Behavior 3: metadata fields adapt to resource type ────────────────────────

describe("AddResourceModal — metadata fields", () => {
  it("Book: shows author, title, edition, publisher, publication date, ISBN", () => {
    renderModal();

    expect(screen.getByRole("radio", { name: /book/i })).toBeChecked();

    expect(screen.getByLabelText(/author/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/edition/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publisher/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publication date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/isbn/i)).toBeInTheDocument();
  });

  it("Press/Journal Article: shows author, article title, journal, volume, issue, pub date, page range", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("radio", { name: /press.+journal article/i }));

    expect(screen.getByLabelText(/author/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/article title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/journal.*outlet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/volume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/issue/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publication date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page range/i)).toBeInTheDocument();
  });

  it("Webpage: shows author/org, page title, site name, publication date; URL input contains typed value", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: /paste url/i }));
    const urlInput = screen.getByRole("textbox", { name: /url/i });
    await userEvent.type(urlInput, "https://example.com");

    expect(screen.getByLabelText(/author or org/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/site name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publication date/i)).toBeInTheDocument();
    expect(urlInput).toHaveValue("https://example.com");
  });

  it("Source Transcript: shows attendees, meeting title, date", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("radio", { name: /source transcript/i }));

    expect(screen.getByLabelText(/attendees/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meeting title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });
});

// ── Behavior 4: submit file calls POST .../resources/file, fires onResourceAdded ─

it("submitting a file calls POST /resources/file and fires onResourceAdded with queued resource", async () => {
  const onResourceAdded = vi.fn();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(NEW_RESOURCE),
  } as Response);

  render(
    <AddResourceModal
      projectId="proj-1"
      onClose={noop}
      onResourceAdded={onResourceAdded}
    />,
  );

  const file = new File(["content"], "book.pdf", { type: "application/pdf" });
  const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
  await userEvent.upload(fileInput, file);

  await userEvent.click(screen.getByRole("button", { name: /add to library/i }));

  const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(call[0]).toContain("/resources/file");
  expect(call[1].method).toBe("POST");

  await vi.waitFor(() => expect(onResourceAdded).toHaveBeenCalledWith(
    expect.objectContaining({ id: "res-new", indexing_status: "queued" }),
  ));
});

// ── Behavior 5: submit URL calls POST .../resources/url, fires onResourceAdded ─

it("submitting a URL calls POST /resources/url and fires onResourceAdded with queued resource", async () => {
  const onResourceAdded = vi.fn();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ...NEW_RESOURCE, resource_type: "Webpage" }),
  } as Response);

  render(
    <AddResourceModal
      projectId="proj-1"
      onClose={noop}
      onResourceAdded={onResourceAdded}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /paste url/i }));
  await userEvent.type(
    screen.getByRole("textbox", { name: /url/i }),
    "https://example.com",
  );

  await userEvent.click(screen.getByRole("button", { name: /add to library/i }));

  const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(call[0]).toContain("/resources/url");
  expect(call[1].method).toBe("POST");
  const body = JSON.parse(call[1].body);
  expect(body.url).toBe("https://example.com");

  await vi.waitFor(() => expect(onResourceAdded).toHaveBeenCalledWith(
    expect.objectContaining({ id: "res-new" }),
  ));
});

// ── Behavior 7: file picker accepts multiple files; each file gets a row ─────

it("file picker accepts multiple files and renders one title row per file", async () => {
  renderModal();

  const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
  const files = [
    new File(["a"], "alpha.txt", { type: "text/plain" }),
    new File(["b"], "beta.txt", { type: "text/plain" }),
  ];
  await userEvent.upload(fileInput, files);

  const rows = screen.getAllByTestId("file-row");
  expect(rows).toHaveLength(2);
});

// ── Behavior 8: each file row shows editable title defaulting to filename stem ─

it("each file row has an editable title input defaulting to the filename stem", async () => {
  renderModal();

  const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
  const files = [
    new File(["x"], "paper.pdf", { type: "application/pdf" }),
    new File(["y"], "notes.txt", { type: "text/plain" }),
  ];
  await userEvent.upload(fileInput, files);

  const titleInputs = screen.getAllByTestId("file-title-input");
  expect(titleInputs).toHaveLength(2);
  expect(titleInputs[0]).toHaveValue("paper");
  expect(titleInputs[1]).toHaveValue("notes");
});

// ── Behavior 6: close button fires onClose ────────────────────────────────────

it("clicking the close button fires onClose", async () => {
  const onClose = vi.fn();
  render(
    <AddResourceModal
      projectId="proj-1"
      onClose={onClose}
      onResourceAdded={noop}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /close/i }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
