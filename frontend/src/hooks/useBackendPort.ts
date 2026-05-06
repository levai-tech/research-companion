import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";

export function useBackendPort(): number | null {
  const backendPort = useAppStore((s) => s.backendPort);
  const setBackendPort = useAppStore((s) => s.setBackendPort);

  useEffect(() => {
    let cancelled = false;

    function poll() {
      invoke<number>("backend_port")
        .then((port) => {
          if (cancelled) return;
          if (port > 0) {
            setBackendPort(port);
          } else {
            // backend_port returned 0 — backend not ready yet, retry
            setTimeout(poll, 500);
          }
        })
        .catch(() => {
          // invoke failed (IPC error), retry
          if (!cancelled) setTimeout(poll, 500);
        });
    }

    poll();
    return () => { cancelled = true; };
  }, [setBackendPort]);

  return backendPort;
}
