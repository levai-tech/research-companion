import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HealthCheck from "./HealthCheck";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useAppStore.setState({ backendPort: null });
  vi.clearAllMocks();
});

describe("HealthCheck", () => {
  it("renders a loading state when port is not yet available", () => {
    render(<HealthCheck />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders backend status and port after health check resolves", async () => {
    useAppStore.setState({ backendPort: 3456 });

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: "ok" }),
    } as Response);

    render(<HealthCheck />);

    await screen.findByText("Backend status: ok (port 3456)");
    expect(global.fetch).toHaveBeenCalledWith("http://127.0.0.1:3456/health");
  });
});
