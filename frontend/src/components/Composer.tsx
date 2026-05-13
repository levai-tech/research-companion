import { useRef, useEffect } from "react";

interface ComposerProps {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export default function Composer({ placeholder, value, onChange, onSend, disabled }: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  }, [value]);

  const enabled = !disabled && value.trim().length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (enabled) onSend();
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 22,
        boxShadow: "var(--shadow-sm), var(--shadow-inset)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "2px 4px" }}>
        <textarea
          ref={taRef}
          rows={1}
          placeholder={placeholder ?? "Reply to Buddy…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--foreground)",
            resize: "none",
            padding: "8px 6px",
            minHeight: 22,
            maxHeight: 160,
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
        <button
          style={{ marginLeft: "auto" }}
          onClick={() => enabled && onSend()}
          aria-label="Send"
          disabled={!enabled}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
