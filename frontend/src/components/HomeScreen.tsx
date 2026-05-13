import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import Composer from "./Composer";

const SUGGESTIONS = [
  "A 4,000-word feature for a magazine",
  "A literature review for my dissertation",
  "An op-ed pitching a contrarian take",
  "A reported essay with on-the-record sources",
];

interface Props {
  projectCount: number;
  onSendMessage: (text: string) => void;
  onOpenSearch: () => void;
}

export default function HomeScreen({ projectCount, onSendMessage, onOpenSearch }: Props) {
  const port = useAppStore((s) => s.backendPort);
  const [input, setInput] = useState("");
  const [resourceCount, setResourceCount] = useState(0);

  useEffect(() => {
    if (!port) return;
    fetch(`http://127.0.0.1:${port}/resources`)
      .then((r) => r.json())
      .then((data: unknown[]) => setResourceCount(data.length))
      .catch(() => {});
  }, [port]);

  function send(text: string) {
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setInput("");
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "var(--background)",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "32px 24px 140px" }}>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "100%",
          }}
        >
          <div style={{ textAlign: "center", padding: "40px 16px 32px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src="../../assets/logo-mark-square.png"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>

            <h1
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 32,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                fontWeight: 600,
                color: "var(--foreground)",
                margin: "0 0 8px",
              }}
            >
              What are you working on?
            </h1>

            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 16,
                lineHeight: 1.5,
                color: "var(--foreground-muted)",
                margin: "0 auto",
                maxWidth: 480,
              }}
            >
              Tell me about the piece in a couple of sentences and I'll ask follow-ups. Buddy turns
              the conversation into an outline grounded in your sources.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "center",
                marginTop: 28,
                marginBottom: 8,
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    color: "var(--foreground)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              aria-label="Search your library"
              onClick={onOpenSearch}
              style={{
                marginTop: 36,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                border: "1px solid transparent",
                background: "transparent",
                borderRadius: 999,
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                color: "var(--foreground-muted)",
                cursor: "pointer",
              }}
            >
              Search your library — {resourceCount} resources across {projectCount} projects
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>⌘K</span>
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "16px 24px 22px",
          background: "linear-gradient(to top, var(--background) 60%, transparent)",
          pointerEvents: "none",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", pointerEvents: "auto" }}>
          <Composer
            placeholder="Describe the piece — a magazine feature on…"
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
          />
          <p
            style={{
              textAlign: "center",
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              color: "var(--foreground-muted)",
              marginTop: 8,
            }}
          >
            Buddy will ask 3–5 follow-ups before suggesting an approach.
          </p>
        </div>
      </div>
    </div>
  );
}
