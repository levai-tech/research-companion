import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  initialMessage?: string;
}

type Phase = "interview" | "naming";

export default function Interview({ onProjectCreated, initialMessage }: InterviewProps) {
  const port = useAppStore((s) => s.backendPort);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessage ? [{ role: "user", content: initialMessage }] : [],
  );
  const [input, setInput] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [readyMetadata, setReadyMetadata] = useState<ProjectMetadata | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("interview");
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const initialized = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (initialMessage) {
      sendMessages([{ role: "user", content: initialMessage }]);
    } else {
      sendMessages([]);
    }
  }, [port]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isSending) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    await sendMessages(next);
  }

  async function enterNamingPhase(currentMessages: ChatMessage[]) {
    if (isFetchingTitle) return;
    setIsFetchingTitle(true);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/interview/suggest-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestedTitle(data.title);
      } else {
        const fallback =
          readyMetadata?.topic ??
          currentMessages.find((m) => m.role === "user")?.content ??
          "Untitled";
        setSuggestedTitle(fallback);
      }
    } catch {
      const fallback =
        readyMetadata?.topic ??
        currentMessages.find((m) => m.role === "user")?.content ??
        "Untitled";
      setSuggestedTitle(fallback);
    } finally {
      setIsFetchingTitle(false);
      setPhase("naming");
    }
  }

  async function handleSkip() {
    await enterNamingPhase(messages);
  }

  async function handleDone() {
    await enterNamingPhase(messages);
  }

  async function handleConfirmName() {
    if (isFinishing || !suggestedTitle.trim()) return;
    setIsFinishing(true);
    const title = suggestedTitle.trim();
    const topic = readyMetadata?.topic ?? messages.find((m) => m.role === "user")?.content ?? title;
    const document_type = readyMetadata?.document_type ?? "article";

    const projectRes = await fetch(`http://127.0.0.1:${port}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, topic, document_type }),
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

  const hasUserMessageSent = messages.some((m) => m.role === "user");
  const hasStarted = messages.some((m) => m.role === "assistant");

  if (phase === "naming") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span className="inline-block rounded px-3 py-2 text-sm">
                {m.content}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Give your project a name:</p>
          <input
            className="rounded border px-3 py-2 w-full"
            value={suggestedTitle}
            onChange={(e) => setSuggestedTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirmName()}
            disabled={isFetchingTitle || isFinishing}
            autoFocus
          />
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground self-end"
            onClick={handleConfirmName}
            disabled={isFetchingTitle || isFinishing || !suggestedTitle.trim()}
          >
            Create project
          </button>
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-2">
        {error && (
          <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span className="inline-block rounded px-3 py-2 text-sm">
              {m.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t px-6 py-4 items-center">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={isSending}
        />
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={handleSend}
          disabled={isSending}
        >
          Send
        </button>
        {hasStarted && (
          <button
            className="rounded border px-4 py-2"
            onClick={handleDone}
            disabled={isSending || isFetchingTitle}
          >
            Done
          </button>
        )}
        {hasUserMessageSent && (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={handleSkip}
            disabled={isSending || isFetchingTitle}
          >
            Skip to approach →
          </button>
        )}
      </div>
    </div>
  );
}
