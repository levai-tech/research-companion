import { useRef, useEffect } from "react";
import { Paperclip, Link, ArrowUp } from "lucide-react";

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

  function iconHoverIn(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }
  function iconHoverOut(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = "transparent"; }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, boxShadow: "var(--shadow-sm), var(--shadow-inset)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "2px 4px" }}>
        <textarea
          ref={taRef}
          rows={1}
          placeholder={placeholder ?? "Reply to Buddy…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.5, color: "var(--foreground)", resize: "none", padding: "8px 6px", minHeight: 22, maxHeight: 160 }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
        <button
          style={{ width: 30, height: 30, border: "none", borderRadius: 999, background: "transparent", color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 140ms var(--ease-out)" }}
          aria-label="Attach"
          onMouseEnter={iconHoverIn}
          onMouseLeave={iconHoverOut}
        >
          <Paperclip size={16} />
        </button>
        <button
          style={{ width: 30, height: 30, border: "none", borderRadius: 999, background: "transparent", color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 140ms var(--ease-out)" }}
          aria-label="Add resource"
          onMouseEnter={iconHoverIn}
          onMouseLeave={iconHoverOut}
        >
          <Link size={16} />
        </button>
        <button
          style={{ width: 32, height: 32, marginLeft: "auto", border: "none", borderRadius: 999, background: enabled ? "var(--brand-navy-800)" : "var(--paper-200, #e9e7e0)", color: enabled ? "white" : "var(--ink-400, #8693a3)", cursor: enabled ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 140ms var(--ease-out)" }}
          onClick={() => enabled && onSend()}
          aria-label="Send"
          disabled={!enabled}
        >
          <ArrowUp size={15} />
        </button>
      </div>
    </div>
  );
}
