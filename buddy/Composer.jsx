// Composer — the pill-shape chat input that anchors every conversation
// surface (new-project interview, workspace chat). Matches the brand
// "rounded-22 pill with soft inset shadow" motif.

const ComposerStyles = {
  shell: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    boxShadow: "var(--shadow-sm), var(--shadow-inset)",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  topRow: { display: "flex", alignItems: "flex-start", gap: 4, padding: "2px 4px" },
  textarea: {
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
  },
  bottomRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 4px",
  },
  iconBtn: {
    width: 30,
    height: 30,
    border: "none",
    borderRadius: 999,
    background: "transparent",
    color: "var(--foreground-muted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 140ms var(--ease-out)",
  },
  send: (enabled) => ({
    width: 32,
    height: 32,
    marginLeft: "auto",
    border: "none",
    borderRadius: 999,
    background: enabled ? "var(--brand-navy-800)" : "var(--paper-200)",
    color: enabled ? "white" : "var(--ink-400)",
    cursor: enabled ? "pointer" : "not-allowed",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 140ms var(--ease-out), transform 80ms var(--ease-out)",
  }),
  chip: {
    fontSize: 11,
    color: "var(--foreground-muted)",
    background: "var(--surface-sunken)",
    borderRadius: 999,
    padding: "3px 9px",
    fontFamily: "var(--font-sans)",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  },
};

function Composer({ placeholder, value, onChange, onSend, disabled }) {
  const taRef = React.useRef(null);
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  }, [value]);

  const enabled = !disabled && value.trim().length > 0;

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (enabled) onSend();
    }
  }

  function hoverIn(e) { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }
  function hoverOut(e) { e.currentTarget.style.background = "transparent"; }

  return (
    <div style={ComposerStyles.shell}>
      <div style={ComposerStyles.topRow}>
        <textarea
          ref={taRef}
          rows={1}
          placeholder={placeholder ?? "Reply to Buddy…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={ComposerStyles.textarea}
        />
      </div>
      <div style={ComposerStyles.bottomRow}>
        <button style={ComposerStyles.iconBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut} aria-label="Attach">
          <IconPaperclip width={16} height={16} />
        </button>
        <button style={ComposerStyles.iconBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut} aria-label="Add resource">
          <IconLink width={16} height={16} />
        </button>
        <span style={ComposerStyles.chip}>
          <IconSparkles width={11} height={11} />
          claude-sonnet-4.6
        </span>
        <button
          style={ComposerStyles.send(enabled)}
          onClick={() => enabled && onSend()}
          aria-label="Send"
          disabled={!enabled}
        >
          <IconArrowUp width={15} height={15} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { Composer });
