import { useEffect, useState } from "react";
import { useAppStore } from "../store";

export default function HealthCheck() {
  const port = useAppStore((s) => s.backendPort);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (port === null) return;
    fetch(`http://127.0.0.1:${port}/health`)
      .then((r) => r.json())
      .then((data: { status: string }) => setStatus(data.status));
  }, [port]);

  if (port === null) return <p>Loading…</p>;
  if (status === null) return <p>Loading…</p>;

  return <p>Backend status: {status} (port {port})</p>;
}
