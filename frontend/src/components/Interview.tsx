import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import type { Project } from "../hooks/useProjects";

interface Layout {
  id: string;
  name: string;
  description: string;
}

interface ProjectMetadata {
  topic: string;
  theme: string;
  angle: string;
  document_type: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface InterviewProps {
  onProjectCreated: (project: Project) => void;
}

export default function Interview({ onProjectCreated }: InterviewProps) {
  const port = useAppStore((s) => s.backendPort);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [layouts, setLayouts] = useState<Layout[] | null>(null);
  const [metadata, setMetadata] = useState<ProjectMetadata | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  async function sendMessages(history: ChatMessage[]) {
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        const detail = err.detail ?? response.statusText;
        if (response.status === 429) {
          setError("The AI model is rate-limited. Go to Settings and switch Project Advisor to Paid, or try again in a moment.");
        } else {
          setError(`Error ${response.status}: ${detail}`);
        }
        return;
      }
      const data = await response.json();
      if (data.phase === "suggest") {
        setLayouts(data.layouts);
        setMetadata(data.project_metadata);
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch (e) {
      setError("Could not reach the backend. Is it running?");
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    if (!port || initialized.current) return;
    initialized.current = true;
    sendMessages([]);
  }, [port]);

  async function handleSend() {
    if (!input.trim() || isSending) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    await sendMessages(next);
  }

  async function handleSelectLayout(layout: Layout) {
    if (!metadata) return;
    const response = await fetch(`http://127.0.0.1:${port}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: metadata.topic,
        ...metadata,
        layout_id: layout.id,
      }),
    });
    const project = await response.json();
    onProjectCreated(project);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span className="inline-block rounded px-3 py-2 text-sm">
              {m.content}
            </span>
          </div>
        ))}
      </div>

      {layouts ? (
        <div className="grid gap-3">
          {layouts.map((layout) => (
            <button
              key={layout.id}
              className="rounded border p-4 text-left"
              onClick={() => handleSelectLayout(layout)}
            >
              <p className="font-semibold">{layout.name}</p>
              <p className="text-sm">{layout.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={handleSend}
            disabled={isSending}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
