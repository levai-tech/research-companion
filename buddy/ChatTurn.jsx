// ChatTurn — one row in a conversation. Buddy turns are bubble-less
// (just a small avatar + body), user turns are right-aligned cards.

const ChatTurnStyles = {
  row: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  rowUser: { justifyContent: "flex-end" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "linear-gradient(135deg, var(--brand-cyan-400), var(--brand-navy-800))",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: "var(--shadow-xs)",
  },
  avatarImg: { width: "82%", height: "82%", objectFit: "contain" },
  bubble: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--foreground)",
    maxWidth: 600,
  },
  userBubble: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px 16px 4px 16px",
    padding: "10px 14px",
    boxShadow: "var(--shadow-xs)",
  },
  who: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--foreground-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 4,
  },
};

function ChatTurn({ role, children }) {
  if (role === "user") {
    return (
      <div style={{ ...ChatTurnStyles.row, ...ChatTurnStyles.rowUser }}>
        <div style={{ ...ChatTurnStyles.bubble, ...ChatTurnStyles.userBubble }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={ChatTurnStyles.row}>
      <span style={ChatTurnStyles.avatar}>
        <img src="../../assets/logo-mark-square.png" alt="" style={ChatTurnStyles.avatarImg} />
      </span>
      <div style={ChatTurnStyles.bubble}>
        <div style={ChatTurnStyles.who}>Buddy</div>
        {children}
      </div>
    </div>
  );
}

function ThinkingTurn() {
  return (
    <div style={ChatTurnStyles.row}>
      <span style={ChatTurnStyles.avatar}>
        <img src="../../assets/logo-mark-square.png" alt="" style={ChatTurnStyles.avatarImg} />
      </span>
      <div style={ChatTurnStyles.bubble}>
        <div style={ChatTurnStyles.who}>Buddy</div>
        <span style={{ color: "var(--foreground-muted)" }}>
          Thinking
          <span className="dots">
            <i></i><i></i><i></i>
          </span>
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { ChatTurn, ThinkingTurn });
