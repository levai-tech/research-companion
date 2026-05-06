import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";

export function useBackendPort(): number | null {
  const backendPort = useAppStore((s) => s.backendPort);
  const setBackendPort = useAppStore((s) => s.setBackendPort);

  useEffect(() => {
    invoke<number>("backend_port").then(setBackendPort);
  }, [setBackendPort]);

  return backendPort;
}
