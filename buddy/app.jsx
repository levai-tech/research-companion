// App — the Buddy shell. Wires Sidebar + main pane + the slide-over
// Resources panel. The main pane swaps between:
//   • HomeChat (new-project interview, the entry point)
//   • Workspace (an opened project)
//   • SettingsPage
//
// All state is in-memory and the chat replies are scripted (this is a
// UI kit, not the real product). Real product code lives in `frontend/`.

const SEED_PROJECTS = [
  {
    id: "p1",
    title: "Carbon markets piece",
    documentType: "Article",
    topic: "Cap-and-trade revival",
    approach: {
      title: "A skeptical history of cap-and-trade, 1990 → today",
      description: "Frame the current cap-and-trade resurgence against its 1990s acid-rain origin story. Argue that the new programs inherit structural flaws — voluntary offsets, additionality theater — that the originals already exposed.",
    },
    outline: {
      sections: [
        { title: "The origin myth", description: "Acid rain and the SO₂ market that worked.", subsections: [
          { title: "1990 amendments", description: "What made the original program tractable" },
          { title: "Why economists loved it", description: "Quantifiable damages, point sources, no offsets" },
        ]},
        { title: "The carbon transposition", description: "Why the same shape doesn't fit a different problem.", subsections: [
          { title: "Diffuse vs. point sources", description: "Where the analogy quietly breaks" },
          { title: "Offsets and additionality", description: "The structural weakness the original avoided" },
        ]},
        { title: "What works now", description: "Specific programs and what they tell us about scope.", subsections: [
          { title: "EU ETS, 2018 reform", description: "Tightening worked; politics enabled it" },
          { title: "California's experience", description: "Where offsets pulled the system off-kilter" },
        ]},
        { title: "An ask", description: "What a serious revival would require.", subsections: [] },
      ],
    },
    transcript: {
      summary: "Author is writing a 4,000-word skeptical feature on the cap-and-trade resurgence for The Atlantic. Has on-the-record interviews and one academic source so far.",
      messages: [
        { role: "assistant", content: "Tell me about what you're working on." },
        { role: "user", content: "A 4,000-word piece for The Atlantic on the resurgence of company towns in rural logistics hubs. Skeptical angle." },
        { role: "assistant", content: "Got it. Are you focused on a specific region or treating it nationally — and do you have on-the-ground reporting, or are we working from desk sources?" },
        { role: "user", content: "Nationally, but with two anchor cases: Anderson IN and Joliet IL. I have eight interviews on the record." },
        { role: "assistant", content: "Strong setup. Last question: what's the take? What's the contrary thing this piece argues that a thoughtful reader doesn't already know?" },
      ],
    },
  },
  { id: "p2", title: "Archive ethics", documentType: "Essay", topic: "What we owe the archive", approach: null, outline: { sections: [] }, transcript: null },
  { id: "p3", title: "Q3 dissertation chapter", documentType: "Chapter", topic: "Postwar housing co-operatives in Vienna", approach: null, outline: { sections: [] }, transcript: null },
  { id: "p4", title: "AI labor pitch", documentType: "Pitch", topic: "Where the productivity gains actually went", approach: null, outline: { sections: [] }, transcript: null },
];

const SEED_RESOURCES = [
  { id: "r1", projectId: "p1", projectTitle: "Carbon markets piece", title: "Company Towns and the New Logistics",          kind: "Book",       meta: "Hammond, K. · 2024",            status: "ready" },
  { id: "r2", projectId: "p1", projectTitle: "Carbon markets piece", title: "Walmart's Distribution Footprint, 2010-2024",     kind: "Article",    meta: "The Atlantic · Mar 2024",       status: "ready" },
  { id: "r3", projectId: "p1", projectTitle: "Carbon markets piece", title: "Anderson IN — site visit, day 1",                  kind: "Transcript", meta: "38 min · Jennings + Cho",       status: "indexing" },
  { id: "r4", projectId: "p1", projectTitle: "Carbon markets piece", title: "BLS QCEW logistics employment 2010-2024.csv",       kind: "Dataset",    meta: "BLS · 2024",                    status: "queued" },
  { id: "r5", projectId: "p2", projectTitle: "Archive ethics",       title: "Dust: The Archive and Cultural History",          kind: "Book",       meta: "Steedman, C. · 2002",           status: "ready" },
  { id: "r6", projectId: "p2", projectTitle: "Archive ethics",       title: "Notes on the trauma archive",                     kind: "Article",    meta: "LARB · Apr 2023",                status: "ready" },
  { id: "r7", projectId: "p3", projectTitle: "Q3 dissertation chapter", title: "Red Vienna: housing, politics, and the worker", kind: "Book",       meta: "Blau, E. · 1999",                status: "ready" },
  { id: "r8", projectId: "p3", projectTitle: "Q3 dissertation chapter", title: "Karl-Marx-Hof archival photographs, 1930",      kind: "Image set",  meta: "Wien Museum · 84 images",       status: "ready" },
  { id: "r9", projectId: "p4", projectTitle: "AI labor pitch",        title: "Erik Brynjolfsson on the AI productivity J-curve", kind: "Transcript", meta: "22 min · phone interview",    status: "ready" },
];

// Pre-computed semantic chunk results. In the real product these come
// from Tavily + Ollama embeddings via the backend's /resources/search
// endpoint. Here they're a static corpus so the panel feels alive.
const SEED_CHUNKS = [
  { resourceId: "r1", projectId: "p1", projectTitle: "Carbon markets piece",
    title: "Company Towns and the New Logistics", location: "ch. 3, p. 87",
    snippet: "The new logistics campus operates on a model that recalls the company town more than the post-war factory: dense employment in a single rural footprint, opaque labor practices, and a parking lot wider than the building." },
  { resourceId: "r2", projectId: "p1", projectTitle: "Carbon markets piece",
    title: "Walmart's Distribution Footprint, 2010-2024", location: "section II",
    snippet: "Between 2010 and 2024, Walmart added 1.4 million square feet of distribution capacity in counties where its retail share already exceeded 40 percent, concentrating logistics employment in towns the firm had already reshaped." },
  { resourceId: "r3", projectId: "p1", projectTitle: "Carbon markets piece",
    title: "Anderson IN — site visit, day 1", location: "00:14:22",
    snippet: "Jennings: \"The mayor calls it a renaissance. What it is, is one employer. The fact that the parking lot is full every morning doesn't tell you whether the town is healthier than it was in 2006.\"" },
  { resourceId: "r5", projectId: "p2", projectTitle: "Archive ethics",
    title: "Dust: The Archive and Cultural History", location: "ch. 2",
    snippet: "To work in the archive is to inherit a sorting that was not yours. Every box is an editorial act — someone, at some point, decided what stayed." },
];

// Scripted Buddy replies — fires on every send, walks the conversation
// forward. Loops at the end so the demo never runs out.
const BUDDY_REPLIES = [
  "Got it. Two follow-ups: are you focused on a specific region or treating it nationally — and do you have on-the-ground reporting, or are we working from desk sources?",
  "Helpful. Who's the audience for this? A general magazine reader, a policy crowd, or somewhere in between?",
  "Okay — I think I have enough to suggest an approach. Want me to draft three angles you can pick from?",
  "(Demo loops here. In the real product, this is where the Approach Explorer takes over.)",
];

function App() {
  const [projects] = React.useState(SEED_PROJECTS);
  const [activeProjectId, setActiveProjectId] = React.useState(null);
  const [view, setView] = React.useState("home"); // "home" | "workspace" | "settings" | "resources"
  const [resourcesOpen, setResourcesOpen] = React.useState(false);
  const [pendingFilter, setPendingFilter] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const replyIdx = React.useRef(0);

  // ⌘K / Ctrl+K opens the search panel from ANYWHERE. Re-pressing
  // toggles it closed so the same keystroke dismisses too.
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setResourcesOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Opening the search slide-over is always global — no project scoping.
  // Adding/managing resources happens in the full Resources page.
  function openSearch() {
    setResourcesOpen(true);
  }

  function openResourcesPage(filterProjectId) {
    // Guard: React passes the SyntheticEvent when used as onClick directly.
    const id = typeof filterProjectId === "string" ? filterProjectId : null;
    if (id) {
      setPendingFilter(id);
    } else {
      setPendingFilter(null);
      setActiveProjectId(null);
    }
    setView("resources");
  }

  function handleSendMessage(content) {
    const userMsg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    const reply = BUDDY_REPLIES[Math.min(replyIdx.current, BUDDY_REPLIES.length - 1)];
    replyIdx.current += 1;
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    }, 700);
  }

  function handleNewProject() {
    setActiveProjectId(null);
    setView("home");
    setMessages([]);
    replyIdx.current = 0;
  }

  function handleSelectProject(id) {
    setActiveProjectId(id);
    setView("workspace");
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      background: "var(--background)",
      overflow: "hidden",
      position: "relative",
    }}>
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        view={view}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onOpenResources={openResourcesPage}
        onOpenSearch={openSearch}
        onOpenSettings={() => setView("settings")}
      />
      <main style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
        {view === "home" && (
          <HomeChat
            messages={messages}
            onSendMessage={handleSendMessage}
            onPickSuggestion={handleSendMessage}
            onOpenSearch={openSearch}
          />
        )}
        {view === "workspace" && activeProject && (
          <Workspace project={activeProject} onOpenResources={() => openResourcesPage(activeProject.id)} />
        )}
        {view === "resources" && (
          <ResourcesPage resources={SEED_RESOURCES} projects={projects} initialFilterId={pendingFilter} />
        )}
        {view === "settings" && <SettingsPage />}
        <ResourcesPanel
          open={resourcesOpen}
          onClose={() => setResourcesOpen(false)}
          resources={SEED_RESOURCES}
          chunkHits={SEED_CHUNKS}
        />
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
