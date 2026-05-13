// Workspace — opened when the user clicks a project in the sidebar.
// Shows a tab bar (Transcript / Approach / Outline / Editor) and renders
// a rich Outline + Editor by default. Other tabs are stubs that match the
// system but stay quiet — the UI kit's job is to demonstrate the visual
// vocabulary, not re-implement the whole product.

const WorkspaceStyles = {
  root: { height: "100%", display: "flex", flexDirection: "column", background: "var(--background)" },
  header: {
    padding: "14px 24px 0",
    background: "var(--background)",
    flexShrink: 0,
  },
  title: {
    fontFamily: "var(--font-sans)",
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "-0.012em",
    color: "var(--foreground)",
    margin: 0,
  },
  subtitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--foreground-muted)",
    margin: "2px 0 14px",
  },
  tabRow: {
    display: "flex", gap: 2,
    borderBottom: "1px solid var(--border)",
    padding: "0 24px",
  },
  tab: (active) => ({
    padding: "9px 12px",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    color: active ? "var(--foreground)" : "var(--foreground-muted)",
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? "var(--brand-cyan-500)" : "transparent"}`,
    marginBottom: -1,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  }),
  tabCheck: { color: "var(--signal-success)", fontSize: 11 },
  body: { flex: 1, minHeight: 0, overflowY: "auto" },
};

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={WorkspaceStyles.tabRow}>
      {tabs.map((t) => (
        <button key={t.id} style={WorkspaceStyles.tab(active === t.id)} onClick={() => onSelect(t.id)}>
          {t.label}
          {t.done && <span style={WorkspaceStyles.tabCheck}>✓</span>}
        </button>
      ))}
    </div>
  );
}

function OutlineTab({ outline }) {
  return (
    <div style={{ padding: "24px", maxWidth: 800, margin: "0 auto" }}>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {outline.sections.map((s, i) => (
          <li key={i} style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "14px 18px",
            boxShadow: "var(--shadow-xs)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--foreground-muted)",
                minWidth: 24,
              }}>{i + 1}.</span>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  margin: "0 0 4px",
                }}>{s.title}</h3>
                <p style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--foreground-muted)",
                  margin: 0,
                }}>{s.description}</p>
                {s.subsections.length > 0 && (
                  <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                    {s.subsections.map((ss, j) => (
                      <li key={j} style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        color: "var(--foreground)",
                        paddingLeft: 12,
                        borderLeft: "1px solid var(--border)",
                      }}>
                        <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>{i + 1}.{j + 1} {ss.title}</span>
                        {" "}
                        <span style={{ color: "var(--foreground-muted)" }}>— {ss.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EditorTab({ project }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Editor ribbon */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        {["B", "I", "U"].map((c, i) => (
          <button key={i} style={ribbonBtn}>{c}</button>
        ))}
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }}/>
        {["H1", "H2", "¶"].map((c, i) => (
          <button key={i} style={ribbonBtn}>{c}</button>
        ))}
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }}/>
        <button style={ribbonBtn}>“</button>
        <button style={ribbonBtn}>•</button>
        <span style={{ flex: 1 }}/>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground-muted)" }}>1,842 words · saved</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 0" }}>
        <article className="prose" style={{
          fontFamily: "var(--font-serif)",
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 24px",
          color: "var(--foreground)",
          fontSize: 17,
          lineHeight: 1.7,
        }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 36, lineHeight: 1.15, letterSpacing: "-0.012em", margin: "0 0 8px" }}>
            {project.title}
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14, fontFamily: "var(--font-sans)", margin: "0 0 28px" }}>
            Draft · {project.documentType} · last edited 2 minutes ago
          </p>
          <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 22, lineHeight: 1.3, margin: "32px 0 8px" }}>
            The town that learned to stand still
          </h2>
          <p>
            The first thing you notice in Anderson, Indiana is the parking. Three new logistics campuses sit at the edge of a town that lost its General Motors plant in 2006, and their parking lots are vast in a way the old factory lots never were — wider, flatter, ringed in fresh asphalt the color of wet stone.
          </p>
          <p>
            The campuses themselves are quiet. <em>Quiet</em> isn't quite the word — it's not silent inside; the conveyors run at a steady mechanical hush, the kind that fills a hangar without ever rising. But the noise stays put. None of it reaches the road.
          </p>
          <p style={{ background: "rgba(11, 158, 209, 0.08)", borderLeft: "2px solid var(--brand-cyan-500)", padding: "10px 14px", fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "normal", lineHeight: 1.55, color: "var(--ink-700)", borderRadius: 4 }}>
            <strong style={{ fontWeight: 600 }}>Buddy:</strong> Two sources in Resources support this opening — Hammond (2024) ch. 3, and the Walmart Distribution Footprint article. Drop a citation here?
          </p>
        </article>
      </div>
    </div>
  );
}

const ribbonBtn = {
  width: 28, height: 28,
  border: "none", background: "transparent",
  borderRadius: 4,
  color: "var(--foreground-muted)",
  fontFamily: "var(--font-sans)",
  fontSize: 13, fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

function ApproachTab({ approach }) {
  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 22px",
        boxShadow: "var(--shadow-xs)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600,
            background: "var(--brand-navy-800)", color: "var(--paper-0)",
            padding: "3px 8px", borderRadius: 999,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>Selected</span>
          <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, margin: 0 }}>{approach.title}</h3>
        </div>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.6, color: "var(--foreground-muted)", margin: 0 }}>
          {approach.description}
        </p>
      </div>
    </div>
  );
}

function TranscriptTab({ transcript }) {
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{
        background: "var(--surface-sunken)",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Summary</div>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: 1.55, margin: 0, color: "var(--foreground)" }}>
          {transcript.summary}
        </p>
      </div>
      {transcript.messages.map((m, i) => (
        <ChatTurn key={i} role={m.role}>{m.content}</ChatTurn>
      ))}
    </div>
  );
}

function Workspace({ project, onOpenResources }) {
  const [tab, setTab] = React.useState("editor");
  const tabs = [
    { id: "transcript", label: "Transcript", done: true },
    { id: "approach", label: "Approach", done: true },
    { id: "outline", label: "Outline", done: true },
    { id: "editor", label: "Editor" },
  ];

  return (
    <div style={WorkspaceStyles.root}>
      <header style={WorkspaceStyles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={WorkspaceStyles.title}>{project.title}</h1>
            <p style={WorkspaceStyles.subtitle}>{project.documentType} · {project.topic}</p>
          </div>
          <button
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 6,
              cursor: "pointer",
            }}
            onClick={onOpenResources}
          >
            <IconBook width={14} height={14} />
            Resources · 4
          </button>
        </div>
        <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      </header>
      <div style={WorkspaceStyles.body}>
        {tab === "editor" && <EditorTab project={project} />}
        {tab === "outline" && <OutlineTab outline={project.outline} />}
        {tab === "approach" && <ApproachTab approach={project.approach} />}
        {tab === "transcript" && <TranscriptTab transcript={project.transcript} />}
      </div>
    </div>
  );
}

Object.assign(window, { Workspace });
