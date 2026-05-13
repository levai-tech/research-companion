// ResourcesPanel — global resource finder. Slides over from the right
// edge, anchored above the current view (does not push content). Opens
// from anywhere via:
//   • Sidebar "Search resources" button
//   • Workspace header "Resources" chip
//   • ⌘K (Ctrl+K) keyboard shortcut, bound in app.jsx
//
// Design intent: this is search-first, not a tab. The input takes focus
// the moment the panel opens; typing starts narrowing immediately.
// Scope chips let the user pivot between "this project" and the global
// corpus — natural on Home (no project open) and on Workspace (project
// is the default scope).
//
// Backdrop blur is the ONLY place blur is used in the system.

const ResourcesPanelStyles = {
  scrim: {
    position: "absolute",
    inset: 0,
    background: "rgba(6, 31, 55, 0.18)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    zIndex: 30,
    animation: "buddyScrimIn 240ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 460,
    background: "rgba(250, 250, 248, 0.94)",
    backdropFilter: "blur(14px) saturate(130%)",
    WebkitBackdropFilter: "blur(14px) saturate(130%)",
    borderLeft: "1px solid var(--border)",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column",
    zIndex: 31,
    animation: "buddyPanelIn 320ms cubic-bezier(0.16, 1, 0.3, 1)",
  },

  // Search-first header — big input is THE entry surface, not a sub-control
  searchHeader: {
    padding: "16px 18px 12px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  searchRow: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 38,
    boxSizing: "border-box",
    padding: "0 36px 0 38px",
    borderRadius: 999,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--foreground)",
    outline: "none",
    transition: "border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    color: "var(--foreground-muted)",
    pointerEvents: "none",
  },
  kbdHint: {
    position: "absolute",
    right: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--foreground-subtle)",
    background: "var(--surface-sunken)",
    padding: "2px 6px",
    borderRadius: 4,
    pointerEvents: "none",
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: "none", background: "transparent", cursor: "pointer",
    color: "var(--foreground-muted)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },

  // Scope chips
  scopeRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap",
  },
  scopeLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--foreground-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginRight: 4,
  },
  scopeChip: (active) => ({
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 999,
    border: active ? "1px solid var(--brand-navy-800)" : "1px solid var(--border-strong)",
    background: active ? "var(--brand-navy-800)" : "var(--surface)",
    color: active ? "var(--paper-0)" : "var(--foreground)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  }),
  scopeCount: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    opacity: 0.7,
    marginLeft: 2,
  },

  // Scope hint replaces the old scope chips
  scopeHint: {
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    color: "var(--foreground-muted)",
    margin: 0,
    paddingLeft: 4,
  },

  body: { flex: 1, overflowY: "auto", padding: "8px 8px 16px" },
  sectionLabel: {
    fontSize: 10, fontWeight: 600,
    color: "var(--foreground-muted)",
    letterSpacing: "0.12em", textTransform: "uppercase",
    padding: "12px 12px 6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: {
    fontSize: 13,
    color: "var(--foreground-muted)",
    padding: "24px 16px",
    textAlign: "center",
    lineHeight: 1.6,
  },

  // Result row — supports both resource hits and chunk hits
  resultRow: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    background: "var(--surface-sunken)",
    color: "var(--foreground-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  resultTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--foreground)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultMeta: {
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    color: "var(--foreground-muted)",
    margin: "2px 0 0",
  },
  resultSnippet: {
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    color: "var(--ink-700)",
    lineHeight: 1.5,
    margin: "4px 0 0",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  resultProjectChip: {
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--foreground-muted)",
    background: "var(--surface-sunken)",
    padding: "1px 6px",
    borderRadius: 999,
    marginRight: 6,
  },
  mark: { background: "rgba(11, 158, 209, 0.20)", padding: "0 2px", borderRadius: 2, color: "var(--foreground)" },

  addRow: {
    display: "flex", gap: 8, padding: "12px 18px",
    borderTop: "1px solid var(--border)",
    background: "rgba(244, 243, 239, 0.7)",
  },
  addBtn: {
    flex: 1,
    height: 36,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--foreground)",
    borderRadius: 8,
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
};

function StatusPill({ status }) {
  const colors = {
    ready:    { bg: "rgba(31, 138, 91, 0.12)",  fg: "var(--signal-success)" },
    indexing: { bg: "rgba(11, 158, 209, 0.12)", fg: "var(--brand-cyan-600)" },
    failed:   { bg: "rgba(192, 57, 43, 0.10)",  fg: "var(--signal-danger)" },
    queued:   { bg: "var(--surface-sunken)",     fg: "var(--foreground-muted)" },
  }[status] ?? { bg: "var(--surface-sunken)", fg: "var(--foreground-muted)" };
  return (
    <span style={{
      fontFamily: "var(--font-sans)",
      fontSize: 11,
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: 999,
      background: colors.bg,
      color: colors.fg,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: "currentColor" }}/>
      {status}
    </span>
  );
}

// Highlight matched substring inside `text`, case-insensitive.
function highlight(text, query) {
  if (!query) return text;
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i < 0) return text;
  return (
    <React.Fragment>
      {text.slice(0, i)}
      <mark style={ResourcesPanelStyles.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </React.Fragment>
  );
}

function ResourceResultRow({ resource, query, showProject }) {
  return (
    <div
      style={ResourcesPanelStyles.resultRow}
      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={ResourcesPanelStyles.resultIcon}>
        <IconFile width={16} height={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={ResourcesPanelStyles.resultTitle}>{highlight(resource.title, query)}</p>
        <p style={ResourcesPanelStyles.resultMeta}>
          {showProject && resource.projectTitle && (
            <span style={ResourcesPanelStyles.resultProjectChip}>{resource.projectTitle}</span>
          )}
          {resource.kind} · {resource.meta}
        </p>
      </div>
      <StatusPill status={resource.status} />
    </div>
  );
}

function ChunkResultRow({ hit, query, showProject }) {
  return (
    <div
      style={ResourcesPanelStyles.resultRow}
      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={ResourcesPanelStyles.resultIcon}>
        <IconSparkles width={15} height={15} style={{ color: "var(--brand-cyan-600)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={ResourcesPanelStyles.resultTitle}>{hit.title}</p>
        <p style={ResourcesPanelStyles.resultMeta}>
          {showProject && hit.projectTitle && (
            <span style={ResourcesPanelStyles.resultProjectChip}>{hit.projectTitle}</span>
          )}
          {hit.location}
        </p>
        <p style={ResourcesPanelStyles.resultSnippet}>{highlight(hit.snippet, query)}</p>
      </div>
    </div>
  );
}

function ResourcesPanel({ open, onClose, resources, chunkHits }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef(null);

  // Autofocus + reset on every open
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filteredResources = resources.filter((r) => {
    if (!q) return true;
    return (r.title + " " + r.meta).toLowerCase().includes(q);
  });
  const filteredChunks = (chunkHits ?? []).filter((h) => {
    if (!q) return false; // chunk results only appear when searching
    return h.snippet.toLowerCase().includes(q) || h.title.toLowerCase().includes(q);
  });

  // Panel is always global — show project chip on every row so the user
  // knows which project a resource belongs to.
  const showProject = true;

  return (
    <React.Fragment>
      <div style={ResourcesPanelStyles.scrim} onClick={onClose} />
      <aside style={ResourcesPanelStyles.panel}>
        <header style={ResourcesPanelStyles.searchHeader}>
          <div style={ResourcesPanelStyles.searchRow}>
            <span style={ResourcesPanelStyles.searchIcon}><IconSearch width={16} height={16} /></span>
            <input
              ref={inputRef}
              style={ResourcesPanelStyles.searchInput}
              placeholder="Search across all resources, transcripts, and citations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand-cyan-500)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            {!query && <span style={ResourcesPanelStyles.kbdHint}>esc</span>}
            <button
              style={ResourcesPanelStyles.closeBtn}
              onClick={onClose}
              aria-label="Close"
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <IconX width={16} height={16} />
            </button>
          </div>
          <p style={ResourcesPanelStyles.scopeHint}>
            Searching across <strong>your entire library</strong> — every project, every resource.
          </p>
        </header>

        <div style={ResourcesPanelStyles.body}>
          {q && filteredChunks.length > 0 && (
            <React.Fragment>
              <div style={ResourcesPanelStyles.sectionLabel}>
                <span>Matching passages · {filteredChunks.length}</span>
                <span style={{ fontFamily: "var(--font-mono)", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>semantic + keyword</span>
              </div>
              {filteredChunks.map((h, i) => (
                <ChunkResultRow key={i} hit={h} query={query} showProject={showProject} />
              ))}
            </React.Fragment>
          )}

          <div style={ResourcesPanelStyles.sectionLabel}>
            <span>{q ? `Resources · ${filteredResources.length}` : `All resources · ${filteredResources.length}`}</span>
          </div>
          {filteredResources.length === 0 && filteredChunks.length === 0 ? (
            <p style={ResourcesPanelStyles.empty}>
              {q
                ? <React.Fragment>No matches for <strong style={{ color: "var(--foreground)" }}>"{query}"</strong>.</React.Fragment>
                : <React.Fragment>Your library is empty. Open <strong style={{ color: "var(--foreground)" }}>Resources</strong> from the sidebar to add files and URLs.</React.Fragment>}
            </p>
          ) : (
            filteredResources.map((r) => (
              <ResourceResultRow key={r.id} resource={r} query={query} showProject={showProject} />
            ))
          )}
        </div>
      </aside>
    </React.Fragment>
  );
}

Object.assign(window, { ResourcesPanel, StatusPill });
