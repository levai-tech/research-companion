// Sidebar — persistent left rail. Claude-style:
//   • Logo + brand at top
//   • Settings + Resources nav buttons
//   • New project CTA
//   • Compact list of project titles (short, scannable)
//   • Footer with user

const SidebarStyles = {
  root: {
    width: 260,
    flexShrink: 0,
    background: "var(--sidebar)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    fontFamily: "var(--font-sans)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 14px 10px",
  },
  brandMark: { width: 28, height: 28, objectFit: "contain" },
  brandWord: {
    fontWeight: 200,
    fontSize: 20,
    letterSpacing: "0.04em",
    color: "var(--sidebar-fg)",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "4px 8px 8px",
  },
  navBtn: (active) => ({
    height: 34,
    padding: "0 10px",
    border: "none",
    background: active ? "var(--sidebar-active)" : "transparent",
    color: "var(--sidebar-fg)",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  }),
  newBtn: {
    margin: "4px 12px 10px",
    height: 36,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    color: "var(--sidebar-fg)",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    padding: "0 12px",
    boxShadow: "var(--shadow-xs)",
    transition: "background 140ms var(--ease-out)",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--sidebar-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "10px 16px 4px",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "0 8px",
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  item: (active) => ({
    height: 30,
    padding: "0 10px",
    border: "none",
    background: active ? "var(--sidebar-active)" : "transparent",
    color: active ? "var(--sidebar-fg)" : "var(--ink-700)",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "background 140ms var(--ease-out)",
  }),
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 999,
    background: "linear-gradient(135deg, var(--brand-cyan-400), var(--brand-navy-800))",
    color: "white",
    fontSize: 11,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  who: { display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 },
  whoName: { fontSize: 12, fontWeight: 600, color: "var(--sidebar-fg)" },
  whoPlan: { fontSize: 11, color: "var(--sidebar-muted)" },
};

function Sidebar({
  activeProjectId,
  onSelectProject,
  onNewProject,
  onOpenResources,
  onOpenSearch,
  onOpenSettings,
  projects,
  view,
}) {
  return (
    <aside style={SidebarStyles.root}>
      <div style={SidebarStyles.brand}>
        <img src="../../assets/logo-mark.png" alt="" style={SidebarStyles.brandMark} />
        <span style={SidebarStyles.brandWord}>Levai</span>
      </div>

      <nav style={SidebarStyles.nav}>
        <button
          style={SidebarStyles.navBtn(view === "settings")}
          onClick={onOpenSettings}
          onMouseEnter={(e) => { if (view !== "settings") e.currentTarget.style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { if (view !== "settings") e.currentTarget.style.background = "transparent"; }}
        >
          <IconSettings width={16} height={16} />
          Settings
        </button>
        <button
          style={SidebarStyles.navBtn(view === "resources")}
          onClick={onOpenResources}
          onMouseEnter={(e) => { if (view !== "resources") e.currentTarget.style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { if (view !== "resources") e.currentTarget.style.background = "transparent"; }}
        >
          <IconBook width={16} height={16} />
          Resources
        </button>
        <button
          style={SidebarStyles.navBtn(false)}
          onClick={onOpenSearch}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <IconSearch width={16} height={16} />
          <span style={{ flex: 1, textAlign: "left" }}>Search resources</span>
          <span style={{ fontSize: 11, color: "var(--foreground-muted)", fontFamily: "var(--font-mono)" }}>⌘K</span>
        </button>
      </nav>

      <button
        style={SidebarStyles.newBtn}
        onClick={onNewProject}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
      >
        <IconNewChat width={16} height={16} />
        <span style={{ flex: 1, textAlign: "left" }}>New project</span>
        <span style={{ fontSize: 11, color: "var(--foreground-muted)", fontFamily: "var(--font-mono)" }}>⌘N</span>
      </button>

      <div style={SidebarStyles.sectionLabel}>Projects</div>
      <div style={SidebarStyles.list}>
        {projects.map((p) => (
          <button
            key={p.id}
            style={SidebarStyles.item(p.id === activeProjectId && view === "workspace")}
            onClick={() => onSelectProject(p.id)}
            onMouseEnter={(e) => {
              if (!(p.id === activeProjectId && view === "workspace")) {
                e.currentTarget.style.background = "var(--sidebar-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!(p.id === activeProjectId && view === "workspace")) {
                e.currentTarget.style.background = "transparent";
              }
            }}
            title={p.title}
          >
            <IconFile width={14} height={14} style={{ opacity: 0.55, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
          </button>
        ))}
      </div>

      <div style={SidebarStyles.footer}>
        <span style={SidebarStyles.avatar}>JD</span>
        <div style={SidebarStyles.who}>
          <span style={SidebarStyles.whoName}>Jane Doe</span>
          <span style={SidebarStyles.whoPlan}>Free · Bring your own key</span>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
