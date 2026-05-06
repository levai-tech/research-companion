import { useEffect, useState } from "react";
import { useAppStore } from "../store";

interface Angle {
  title: string;
  description: string;
  status: "pending" | "accepted" | "rejected";
}

interface AngleExplorerProps {
  projectId: string;
  topic: string;
  documentType: string;
  onComplete: () => void;
}

export default function AngleExplorer({ projectId, topic, documentType, onComplete }: AngleExplorerProps) {
  const port = useAppStore((s) => s.backendPort);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/projects/${projectId}/angles/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, document_type: documentType }),
    })
      .then((r) => r.json())
      .then((data: { title: string; description: string }[]) =>
        setAngles(data.map((a) => ({ ...a, status: "pending" })))
      )
      .finally(() => setIsLoading(false));
  }, [port, projectId, topic, documentType]);

  function setStatus(index: number, status: Angle["status"]) {
    setAngles((prev) => prev.map((a, i) => (i === index ? { ...a, status } : a)));
  }

  function setTitle(index: number, title: string) {
    setAngles((prev) => prev.map((a, i) => (i === index ? { ...a, title } : a)));
  }

  async function handleConfirm() {
    await fetch(`http://127.0.0.1:${port}/projects/${projectId}/angles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angles }),
    });
    onComplete();
  }

  if (isLoading) return <div>Loading angles…</div>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-3">
        {angles.map((angle, i) => (
          <div key={i} className="rounded border p-4">
            {editingIndex === i ? (
              <input
                className="w-full rounded border px-2 py-1 font-semibold"
                value={angle.title}
                onChange={(e) => setTitle(i, e.target.value)}
                onBlur={() => setEditingIndex(null)}
                autoFocus
              />
            ) : (
              <p className="font-semibold">{angle.title}</p>
            )}
            <p className="text-sm">{angle.description}</p>
            <div className="mt-2 flex gap-2">
              <button
                aria-pressed={angle.status === "accepted"}
                onClick={() => setStatus(i, angle.status === "accepted" ? "pending" : "accepted")}
              >
                Accept
              </button>
              <button
                aria-pressed={angle.status === "rejected"}
                onClick={() => setStatus(i, angle.status === "rejected" ? "pending" : "rejected")}
              >
                Reject
              </button>
              <button onClick={() => setEditingIndex(i)}>Edit</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleConfirm}>Confirm</button>
    </div>
  );
}
