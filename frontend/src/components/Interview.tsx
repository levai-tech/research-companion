import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import type { Project } from "../hooks/useProjects";

interface ProjectMetadata {
  topic: string;
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
  const [isReady, setIsReady] = useState(false);
  const [readyMetadata, setReadyMetadata] = useState<ProjectMetadata | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
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
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.phase === "ready") {
        setIsReady(true);
        if (data.project_metadata) {
          setReadyMetadata(data.project_metadata);
        }
      }
    } catch {
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

  async function handleDone() {
    if (isFinishing) return;
    setIsFinishing(true);
    const topic = readyMetadata?.topic ?? messages.find((m) => m.role === "user")?.content ?? "Untitled";
    const document_type = readyMetadata?.document_type ?? "article";

    const projectRes = await fetch(`http://127.0.0.1:${port}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: topic, topic, document_type }),
    });
    if (!projectRes.ok) {
      setError("Failed to create project.");
      setIsFinishing(false);
      return;
    }
    const project = await projectRes.json();

    await fetch(`http://127.0.0.1:${port}/projects/${project.id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    onProjectCreated(project);
  }

  const hasStarted = messages.some((m) => m.role === "assistant");

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

      <div className="flex gap-2">
        {!isReady && (
          <input
            className="flex-1 rounded border px-3 py-2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
        )}
        {!isReady && (
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={handleSend}
            disabled={isSending}
          >
            Send
          </button>
        )}
        {hasStarted && (
          <button
            className="rounded border px-4 py-2"
            onClick={handleDone}
            disabled={isSending || isFinishing}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
