// ResourcesPage — full-screen surface for MANAGING the resource library.
// Reached from the sidebar Resources nav entry (and from the workspace
// header's Resources chip). NOT the slide-over: this is where users add,
// re-ingest, and delete. The slide-over is read-only search.
//
// Mirrors `frontend/src/components/ResourcesTab.tsx` + AddResourceModal,
// but lifted out of the project-tab context: it shows the WHOLE library
// across all projects, filterable by project.

const ResourcesPageStyles = {
  root: {
    height: "100%",
    overflowY: "auto",
    background: "var(--background)",
  },
  inner: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "32px 32px 60px",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
    marginBottom: 6,
  },
  title: {
    fontFamily: "var(--font-sans)",
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "-0.012em",
    margin: 0,
  },
  count: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--foreground-muted)",
    paddingBottom: 6,
  },
  subtitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--foreground-muted)",
    margin: "0 0 24px",
    maxWidth: 580,
  },
  toolbar: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 18,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--foreground-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginRight: 4,
  },
  filterChip: (active) => ({
    fontFamily: "var(--font-sans)",
    fontSize: 12,
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
  addBtnGroup: { marginLeft: "auto", display: "flex", gap: 8 },
  primaryBtn: {
    height: 34,
    padding: "0 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--brand-navy-800)",
    color: "var(--paper-0)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  outlineBtn: {
    height: 34,
    padding: "0 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    color: "var(--foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },

  table: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "var(--shadow-xs)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  rowLast: { borderBottom: "none" },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "var(--surface-sunken)",
    color: "var(--foreground-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--foreground)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    color: "var(--foreground-muted)",
    margin: "2px 0 0",
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  projectChip: {
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--foreground-muted)",
    background: "var(--surface-sunken)",
    padding: "1px 7px",
    borderRadius: 999,
  },
  actions: { display: "flex", gap: 4, alignItems: "center", flexShrink: 0 },
  iconAction: {
    width: 30, height: 30,
    border: "none", background: "transparent",
    borderRadius: 6,
    color: "var(--foreground-muted)",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  empty: {
    padding: "48px 24px",
    textAlign: "center",
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--foreground-muted)",
  },

  // Add-resource inline modal
  modalScrim: {
    position: "absolute",
    inset: 0,
    background: "rgba(6, 31, 55, 0.30)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
    animation: "buddyScrimIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  modalCard: {
    width: "min(500px, calc(100% - 48px))",
    maxHeight: "calc(100% - 96px)",
    background: "var(--surface)",
    borderRadius: 16,
    boxShadow: "var(--shadow-xl)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    animation: "buddyModalIn 260ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  modalHeader: {
    padding: "18px 22px 14px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
  },
  modalTitle: {
    fontFamily: "var(--font-sans)",
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    flex: 1,
  },
  modalBody: { padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" },
  modalFooter: {
    padding: "14px 22px",
    borderTop: "1px solid var(--border)",
    background: "var(--surface-sunken)",
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  modeRow: {
    display: "flex",
    background: "var(--surface-sunken)",
    padding: 3,
    borderRadius: 8,
    width: "fit-content",
  },
  modeBtn: (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    background: active ? "var(--surface)" : "transparent",
    color: active ? "var(--foreground)" : "var(--foreground-muted)",
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: active ? "var(--shadow-xs)" : "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background 140ms cubic-bezier(0.16, 1, 0.3, 1)",
  }),
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "var(--foreground)" },
  input: {
    height: 34,
    padding: "0 12px",
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    borderRadius: 6,
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--foreground)",
    outline: "none",
  },
  dropzone: {
    border: "1.5px dashed var(--border-strong)",
    borderRadius: 10,
    padding: "26px 14px",
    textAlign: "center",
    color: "var(--foreground-muted)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    background: "var(--surface-sunken)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  },
};

function AddResourceModal({ open, onClose, onSubmit, projects, defaultProjectId }) {
  const [mode, setMode] = React.useState("file");
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? projects[0]?.id);

  React.useEffect(() => {
    if (!open) return;
    setMode("file"); setUrl(""); setTitle(""); setProjectId(defaultProjectId ?? projects[0]?.id);
  }, [open, defaultProjectId, projects]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={ResourcesPageStyles.modalScrim} onClick={onClose}>
      <div style={ResourcesPageStyles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header style={ResourcesPageStyles.modalHeader}>
          <h2 style={ResourcesPageStyles.modalTitle}>Add resource</h2>
          <button
            style={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: 6, color: "var(--foreground-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}
            aria-label="Close"
          >
            <IconX width={16} height={16} />
          </button>
        </header>
        <div style={ResourcesPageStyles.modalBody}>
          <div style={ResourcesPageStyles.modeRow}>
            <button style={ResourcesPageStyles.modeBtn(mode === "file")} onClick={() => setMode("file")}>
              <IconUpload width={13} height={13} />
              Upload file
            </button>
            <button style={ResourcesPageStyles.modeBtn(mode === "url")} onClick={() => setMode("url")}>
              <IconLink width={13} height={13} />
              Paste URL
            </button>
          </div>

          {mode === "file" ? (
            <div style={ResourcesPageStyles.dropzone}>
              <IconUpload width={22} height={22} />
              <div>
                <div style={{ fontWeight: 600, color: "var(--foreground)" }}>Drop a file or click to browse</div>
                <div>PDF, DOCX, or TXT · max 50 MB</div>
              </div>
            </div>
          ) : (
            <div style={ResourcesPageStyles.field}>
              <label style={ResourcesPageStyles.fieldLabel}>URL</label>
              <input
                style={ResourcesPageStyles.input}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          <div style={ResourcesPageStyles.field}>
            <label style={ResourcesPageStyles.fieldLabel}>Title</label>
            <input
              style={ResourcesPageStyles.input}
              placeholder="What is this source?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={ResourcesPageStyles.field}>
            <label style={ResourcesPageStyles.fieldLabel}>Attach to project</label>
            <select
              style={{ ...ResourcesPageStyles.input, paddingLeft: 8 }}
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        </div>
        <footer style={ResourcesPageStyles.modalFooter}>
          <button style={ResourcesPageStyles.outlineBtn} onClick={onClose}>Cancel</button>
          <button
            style={ResourcesPageStyles.primaryBtn}
            onClick={() => { onSubmit({ mode, url, title, projectId }); onClose(); }}
          >
            Add to library
          </button>
        </footer>
      </div>
    </div>
  );
}

function ResourcesPage({ resources, projects, initialFilterId }) {
  const [filterId, setFilterId] = React.useState(initialFilterId ?? "all");
  React.useEffect(() => { if (initialFilterId) setFilterId(initialFilterId); }, [initialFilterId]);
  const [modalOpen, setModalOpen] = React.useState(false);

  const counts = React.useMemo(() => {
    return resources.reduce((acc, r) => { acc[r.projectId] = (acc[r.projectId] ?? 0) + 1; return acc; }, {});
  }, [resources]);

  const filtered = filterId === "all" ? resources : resources.filter((r) => r.projectId === filterId);

  return (
    <div style={ResourcesPageStyles.root}>
      <div style={ResourcesPageStyles.inner}>
        <div style={ResourcesPageStyles.headerRow}>
          <h1 style={ResourcesPageStyles.title}>Resources</h1>
          <span style={ResourcesPageStyles.count}>{resources.length} indexed across {projects.length} projects</span>
        </div>
        <p style={ResourcesPageStyles.subtitle}>
          Everything Buddy can cite. Add a file or URL and it's indexed semantically — searchable from anywhere via ⌘K.
        </p>

        <div style={ResourcesPageStyles.toolbar}>
          <span style={ResourcesPageStyles.filterLabel}>Project</span>
          <button style={ResourcesPageStyles.filterChip(filterId === "all")} onClick={() => setFilterId("all")}>
            All · <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>{resources.length}</span>
          </button>
          {projects.filter((p) => counts[p.id]).map((p) => (
            <button key={p.id} style={ResourcesPageStyles.filterChip(filterId === p.id)} onClick={() => setFilterId(p.id)}>
              {p.title} · <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>{counts[p.id]}</span>
            </button>
          ))}
          <div style={ResourcesPageStyles.addBtnGroup}>
            <button
              style={ResourcesPageStyles.primaryBtn}
              onClick={() => setModalOpen(true)}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--brand-navy-700)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--brand-navy-800)"}
            >
              <IconPlus width={14} height={14} />
              Add resource
            </button>
          </div>
        </div>

        <div style={ResourcesPageStyles.table}>
          {filtered.length === 0 ? (
            <div style={ResourcesPageStyles.empty}>
              No resources in this scope yet.
            </div>
          ) : (
            filtered.map((r, i) => (
              <div
                key={r.id}
                style={{ ...ResourcesPageStyles.row, ...(i === filtered.length - 1 ? ResourcesPageStyles.rowLast : {}) }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.025)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={ResourcesPageStyles.rowIcon}>
                  <IconFile width={18} height={18} />
                </div>
                <div style={ResourcesPageStyles.rowBody}>
                  <h3 style={ResourcesPageStyles.rowTitle}>{r.title}</h3>
                  <p style={ResourcesPageStyles.rowMeta}>
                    <span style={ResourcesPageStyles.projectChip}>{r.projectTitle}</span>
                    {r.kind} · {r.meta}
                  </p>
                </div>
                <StatusPill status={r.status} />
                <div style={ResourcesPageStyles.actions}>
                  <button
                    style={ResourcesPageStyles.iconAction}
                    title="Re-index"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.05)"; e.currentTarget.style.color = "var(--foreground)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--foreground-muted)"; }}
                  >
                    <IconSparkles width={15} height={15} />
                  </button>
                  <button
                    style={ResourcesPageStyles.iconAction}
                    title="Delete"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(192,57,43,0.10)"; e.currentTarget.style.color = "var(--signal-danger)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--foreground-muted)"; }}
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AddResourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={() => {}}
        projects={projects}
        defaultProjectId={filterId !== "all" ? filterId : undefined}
      />
    </div>
  );
}

Object.assign(window, { ResourcesPage, AddResourceModal });
