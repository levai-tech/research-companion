import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import type { Project } from "../hooks/useProjects";
import Composer from "./Composer";

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

const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8, border: "none",
  background: "var(--brand-navy-800)", color: "var(--paper-0)",
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer",
  transition: "background 140ms var(--ease-out)",
};

const outlineBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8,
  border: "1px solid var(--border-strong)", background: "var(--surface)",
  color: "var(--foreground)", fontFamily: "var(--font-sans)",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
  transition: "background 140ms var(--ease-out)",
};

function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div style={{ textAlign: isUser ? "right" : "left" }}>
      <span style={{
        display: "inline-block",
        background: isUser ? "var(--brand-navy-800)" : "var(--surface)",
        color: isUser ? "var(--paper-0)" : "var(--foreground)",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "8px 14px", fontSize: 13, fontFamily: "var(--font-sans)",
        lineHeight: 1.5, maxWidth: "80%",
        border: isUser ? "none" : "1px solid var(--border)",
      }}>
        {content}
      </span>
    </div>
  );
}

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
        if (data.project_metadata) setReadyMetadata(data.project_metadata);
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
    sendMessages(initialMessage ? [{ role: "user", content: initialMessage }] : []);
  }, [port]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setSuggestedTitle(readyMetadata?.topic ?? currentMessages.find((m) => m.role === "user")?.content ?? "Untitled");
      }
    } catch {
      setSuggestedTitle(readyMetadata?.topic ?? currentMessages.find((m) => m.role === "user")?.content ?? "Untitled");
    } finally {
      setIsFetchingTitle(false);
      setPhase("naming");
    }
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
    if (!projectRes.ok) { setError("Failed to create project."); setIsFinishing(false); return; }
    const project = await projectRes.json();

    await fetch(`http://127.0.0.1:${port}/projects/${project.id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    onProjectCreated(project);
  }

  const hasStarted = messages.some((m) => m.role === "assistant");
  const hasUserMessageSent = messages.some((m) => m.role === "user");

  if (phase === "naming") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 24px 16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)}
            <div ref={bottomRef} />
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px", maxWidth: 720, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)", margin: 0 }}>Give your project a name:</p>
          <input
            style={{ height: 34, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none" }}
            value={suggestedTitle}
            onChange={(e) => setSuggestedTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirmName()}
            disabled={isFetchingTitle || isFinishing}
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              style={{ ...primaryBtn, opacity: isFetchingTitle || isFinishing || !suggestedTitle.trim() ? 0.5 : 1 }}
              onClick={handleConfirmName}
              disabled={isFetchingTitle || isFinishing || !suggestedTitle.trim()}
            >
              Create project
            </button>
          </div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(192,57,43,0.3)", background: "rgba(192,57,43,0.08)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--signal-danger)" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 24px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(192,57,43,0.3)", background: "rgba(192,57,43,0.08)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--signal-danger)" }}>
              {error}
            </div>
          )}
          {messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)}
          {isSending && (
            <div style={{ textAlign: "left" }}>
              <span style={{ display: "inline-block", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px 18px 18px 4px", padding: "8px 14px", fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--foreground-muted)" }}>
                …
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ padding: "16px 24px 22px", background: "linear-gradient(to top, var(--background) 60%, transparent)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Composer
            placeholder="Reply to Buddy…"
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={isSending}
          />
          {(isReady || hasStarted) && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              {hasUserMessageSent && (
                <button
                  style={{ background: "transparent", border: "none", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground-muted)", cursor: "pointer", padding: "4px 8px", textDecoration: "underline", textUnderlineOffset: 2 }}
                  onClick={() => enterNamingPhase(messages)}
                  disabled={isSending || isFetchingTitle}
                >
                  Skip to approach →
                </button>
              )}
              {isReady && (
                <button
                  style={{ ...outlineBtn, height: 30, fontSize: 12 }}
                  onClick={() => enterNamingPhase(messages)}
                  disabled={isSending || isFetchingTitle}
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
