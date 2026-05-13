// SettingsPage — accessed from the sidebar Settings nav. Mirrors the
// frontend/ codebase's settings shape (API keys, model router, search
// provider, Ollama) but styled to the Levai system.

const SettingsStyles = {
  root: {
    height: "100%",
    overflowY: "auto",
    background: "var(--background)",
  },
  inner: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "40px 32px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 36,
  },
  title: {
    fontFamily: "var(--font-sans)",
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "-0.012em",
    margin: 0,
  },
  section: { display: "flex", flexDirection: "column", gap: 14 },
  sectionTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--foreground)",
    paddingBottom: 8,
    borderBottom: "1px solid var(--border)",
    margin: 0,
  },
  sectionHelp: {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--foreground-muted)",
    margin: 0,
    lineHeight: 1.55,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--foreground)",
  },
  saved: { color: "var(--signal-success)", fontSize: 11, fontWeight: 500, marginLeft: 8 },
  inputRow: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    height: 34,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--foreground)",
    outline: "none",
  },
  mono: {
    flex: 1,
    height: 34,
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--surface-sunken)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--foreground-muted)",
    display: "flex",
    alignItems: "center",
  },
  saveBtn: {
    height: 34,
    padding: "0 14px",
    borderRadius: 6,
    border: "none",
    background: "var(--brand-navy-800)",
    color: "var(--paper-0)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  editBtn: {
    height: 34,
    padding: "0 14px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    color: "var(--foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  toggle: { display: "flex", gap: 6 },
  toggleBtn: (active) => ({
    height: 30,
    padding: "0 14px",
    borderRadius: 6,
    border: active ? "1px solid var(--brand-navy-800)" : "1px solid var(--border-strong)",
    background: active ? "var(--brand-navy-800)" : "var(--surface)",
    color: active ? "var(--paper-0)" : "var(--foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  }),
};

function SettingsPage() {
  const [provider, setProvider] = React.useState("tavily");
  return (
    <div style={SettingsStyles.root}>
      <div style={SettingsStyles.inner}>
        <h1 style={SettingsStyles.title}>Settings</h1>

        <section style={SettingsStyles.section}>
          <h2 style={SettingsStyles.sectionTitle}>API keys</h2>
          <div style={SettingsStyles.field}>
            <label style={SettingsStyles.label}>
              OpenRouter API Key
              <span style={SettingsStyles.saved}>✓ saved</span>
            </label>
            <div style={SettingsStyles.inputRow}>
              <input style={SettingsStyles.input} type="password" placeholder="••••••••••••" />
              <button style={SettingsStyles.saveBtn}>Save</button>
            </div>
          </div>
          <div style={SettingsStyles.field}>
            <label style={SettingsStyles.label}>Tavily API Key</label>
            <div style={SettingsStyles.inputRow}>
              <input style={SettingsStyles.input} type="password" placeholder="Enter key…" />
              <button style={SettingsStyles.saveBtn}>Save</button>
            </div>
          </div>
        </section>

        <section style={SettingsStyles.section}>
          <h2 style={SettingsStyles.sectionTitle}>Model router</h2>
          <p style={SettingsStyles.sectionHelp}>
            Paste any OpenRouter model ID (e.g. <code style={{ background: "var(--surface-sunken)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12 }}>anthropic/claude-sonnet-4.6</code>).
          </p>
          {[
            ["Project advisor", "anthropic/claude-sonnet-4.6"],
            ["Approach explorer", "anthropic/claude-sonnet-4.6"],
            ["Research agent", "anthropic/claude-opus-4.1"],
            ["Editor AI", "anthropic/claude-sonnet-4.6"],
            ["Outline generator", "anthropic/claude-sonnet-4.6"],
          ].map(([label, model]) => (
            <div style={SettingsStyles.field} key={label}>
              <label style={SettingsStyles.label}>{label}</label>
              <div style={SettingsStyles.inputRow}>
                <div style={SettingsStyles.mono}>{model}</div>
                <button style={SettingsStyles.editBtn}>Edit</button>
              </div>
            </div>
          ))}
        </section>

        <section style={SettingsStyles.section}>
          <h2 style={SettingsStyles.sectionTitle}>Search provider</h2>
          <div style={SettingsStyles.toggle}>
            <button style={SettingsStyles.toggleBtn(provider === "tavily")} onClick={() => setProvider("tavily")}>Tavily</button>
            <button style={SettingsStyles.toggleBtn(provider === "brave")} onClick={() => setProvider("brave")}>Brave</button>
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsPage });
