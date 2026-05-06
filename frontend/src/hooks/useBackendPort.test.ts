import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBackendPort } from "./useBackendPort";
import { useAppStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  useAppStore.setState({ backendPort: null });
  vi.clearAllMocks();
});

describe("useBackendPort", () => {
  it("calls invoke('backend_port') on mount and returns the port", async () => {
    mockInvoke.mockResolvedValue(3456);

    const { result } = renderHook(() => useBackendPort());

    await waitFor(() => expect(result.current).toBe(3456));
    expect(mockInvoke).toHaveBeenCalledWith("backend_port");
  });

  it("returns null before invoke resolves", () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useBackendPort());

    expect(result.current).toBeNull();
  });
});
