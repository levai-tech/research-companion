// HomeChat — the main pane when no project is open. Acts as the new-project
// interview entry point. Shows a quiet welcome until the user types; the
// "Interview" begins as soon as they send a message.

const HomeChatStyles = {
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    background: "var(--background)",
  },
  scroll: { flex: 1, minHeight: 0, overflowY: "auto", padding: "32px 24px 140px" },
  inner: { maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100%" },
  hero: { textAlign: "center", padding: "40px 16px 32px" },
  heroMark: {
    width: 64, height: 64,
    margin: "0 auto 24px",
    display: "inline-flex",
    alignItems: "center", justifyContent: "center",
  },
  heroMarkImg: { width: "100%", height: "100%", objectFit: "contain" },
  heroTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 32,
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
    fontWeight: 600,
    color: "var(--foreground)",
    margin: "0 0 8px",
  },
  heroSub: {
    fontFamily: "var(--font-sans)",
    fontSize: 16,
    lineHeight: 1.5,
    color: "var(--foreground-muted)",
    margin: "0 auto",
    maxWidth: 480,
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 28,
    marginBottom: 8,
  },
  suggestion: {
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    color: "var(--foreground)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "6px 12px",
    cursor: "pointer",
    transition: "border-color 140ms var(--ease-out), background 140ms var(--ease-out)",
  },
  composerWrap: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: "16px 24px 22px",
    background: "linear-gradient(to top, var(--background) 60%, transparent)",
    pointerEvents: "none",
  },
  composerInner: { maxWidth: 720, margin: "0 auto", pointerEvents: "auto" },
  hint: {
    textAlign: "center",
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    color: "var(--foreground-muted)",
    marginTop: 8,
  },
  libraryChip: {
    marginTop: 36,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px 6px 12px",
    border: "1px solid transparent",
    background: "transparent",
    borderRadius: 999,
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    color: "var(--foreground-muted)",
    cursor: "pointer",
    transition: "color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  libraryKbd: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--foreground-subtle)",
    background: "var(--surface-sunken)",
    padding: "1px 6px",
    borderRadius: 4,
    marginLeft: 4,
  },
};

const SUGGESTIONS = [
  "A 4,000-word feature for a magazine",
  "A literature review for my dissertation",
  "An op-ed pitching a contrarian take",
  "A reported essay with on-the-record sources",
];

function HomeChat({ messages, onSendMessage, onPickSuggestion, onOpenSearch }) {
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function send() {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  }

  const hasStarted = messages.length > 0;

  return (
    <div style={HomeChatStyles.root}>
      <div style={HomeChatStyles.scroll} ref={scrollRef}>
        <div style={HomeChatStyles.inner}>
          {!hasStarted ? (
            <div style={HomeChatStyles.hero}>
              <div style={HomeChatStyles.heroMark}>
                <img src="../../assets/logo-mark-square.png" alt="" style={HomeChatStyles.heroMarkImg} />
              </div>
              <h1 style={HomeChatStyles.heroTitle}>What are you working on?</h1>
              <p style={HomeChatStyles.heroSub}>
                Tell me about the piece in a couple of sentences and I'll ask follow-ups. Buddy turns the conversation into an outline grounded in your sources.
              </p>
              <div style={HomeChatStyles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    style={HomeChatStyles.suggestion}
                    onClick={() => onPickSuggestion(s)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                style={HomeChatStyles.libraryChip}
                onClick={onOpenSearch}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--foreground)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--foreground-muted)"; e.currentTarget.style.borderColor = "transparent"; }}
              >
                <IconSearch width={13} height={13} />
                Search your library — 9 resources across 4 projects
                <span style={HomeChatStyles.libraryKbd}>⌘K</span>
              </button>
            </div>
          ) : (
            <div style={{ paddingTop: 12 }}>
              {messages.map((m, i) => (
                <ChatTurn key={i} role={m.role}>{m.content}</ChatTurn>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={HomeChatStyles.composerWrap}>
        <div style={HomeChatStyles.composerInner}>
          <Composer
            placeholder={hasStarted ? "Reply to Buddy…" : "Describe the piece — a magazine feature on…"}
            value={input}
            onChange={setInput}
            onSend={send}
          />
          {!hasStarted && (
            <p style={HomeChatStyles.hint}>Buddy will ask 3–5 follow-ups before suggesting an approach.</p>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomeChat });
