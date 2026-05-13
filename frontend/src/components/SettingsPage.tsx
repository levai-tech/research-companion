import { useEffect, useState } from "react";
import { useSettingsStore } from "../settingsStore";
import { useAppStore } from "../store";

const ROLES: { key: string; label: string }[] = [
  { key: "project_advisor", label: "Project Advisor" },
  { key: "approach_explorer", label: "Approach Explorer" },
  { key: "research_agent", label: "Research Agent" },
  { key: "literature_review", label: "Literature Review Synthesizer" },
  { key: "editor_ai", label: "Editor AI" },
  { key: "outline_generator", label: "Outline Generator" },
  { key: "semantic_ingester", label: "Semantic Ingester" },
];

const CATALOGUE_DEFAULTS: Record<string, string> = {
  project_advisor: "mistralai/mistral-7b-instruct:free",
  approach_explorer: "mistralai/mistral-7b-instruct:free",
  research_agent: "mistralai/mistral-7b-instruct:free",
  literature_review: "mistralai/mistral-7b-instruct:free",
  editor_ai: "mistralai/mistral-7b-instruct:free",
  outline_generator: "mistralai/mistral-7b-instruct:free",
  semantic_ingester: "qwen/qwen3-next-80b-a3b-instruct:free",
};

const SEARCH_PROVIDERS = ["tavily", "brave"];

const s = {
  root: { height: "100%", overflowY: "auto", background: "var(--background)" } as React.CSSProperties,
  inner: { maxWidth: 720, margin: "0 auto", padding: "40px 32px 60px", display: "flex", flexDirection: "column", gap: 36 } as React.CSSProperties,
  title: { fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.012em", margin: 0 } as React.CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,
  sectionTitle: { fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", paddingBottom: 8, borderBottom: "1px solid var(--border)", margin: 0 } as React.CSSProperties,
  sectionHelp: { fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground-muted)", margin: 0, lineHeight: 1.55 } as React.CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  label: { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" } as React.CSSProperties,
  inputRow: { display: "flex", gap: 8 } as React.CSSProperties,
  input: { flex: 1, height: 34, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none" } as React.CSSProperties,
  mono: { flex: 1, height: 34, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-sunken)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground-muted)", display: "flex", alignItems: "center" } as React.CSSProperties,
  saveBtn: { height: 34, padding: "0 14px", borderRadius: 6, border: "none", background: "var(--brand-navy-800)", color: "var(--paper-0)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer" } as React.CSSProperties,
  editBtn: { height: 34, padding: "0 14px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, cursor: "pointer" } as React.CSSProperties,
  saved: { color: "var(--signal-success)", fontSize: 11, fontWeight: 500, marginLeft: 8 } as React.CSSProperties,
};

export default function SettingsPage() {
  const { settings, keysMask, loadSettings, loadKeysMask, updateRoleModel, updateSettings, saveApiKey } =
    useSettingsStore();
  const backendPort = useAppStore((s) => s.backendPort);

  const [openrouterKey, setOpenrouterKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (backendPort === null) return;
    setLoadError(null);
    loadSettings().then((err) => { if (err) setLoadError(err); });
    loadKeysMask();
  }, [backendPort, loadSettings, loadKeysMask]);

  async function handleSaveKey(name: string, value: string, clear: () => void) {
    setSaving(name);
    await saveApiKey(name, value);
    await loadKeysMask();
    clear();
    setSaving(null);
  }

  if (!settings) {
    return (
      <div style={s.root}>
        <div style={s.inner}>
          <h1 style={s.title}>Settings</h1>
          <p style={s.sectionHelp}>
            {backendPort === null ? "Waiting for backend port…" : `Connecting to backend on port ${backendPort}…`}
          </p>
          {loadError && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--signal-danger)", wordBreak: "break-all" }}>{loadError}</p>
          )}
          {backendPort !== null && (
            <button style={{ ...s.editBtn, alignSelf: "flex-start" }} onClick={() => { setLoadError(null); loadSettings().then((err) => { if (err) setLoadError(err); }); loadKeysMask(); }}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.inner}>
        <h1 style={s.title}>Settings</h1>

        {/* Display Name */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Display Name</h2>
          <EditableField label="Display Name" value={settings.display_name ?? ""} onSave={(v) => updateSettings({ display_name: v })} />
        </section>

        {/* API Keys */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>API Keys</h2>
          <KeyField
            label="OpenRouter API Key" name="openrouter_api_key"
            isSet={keysMask.openrouter_api_key ?? false}
            value={openrouterKey} onChange={setOpenrouterKey}
            saving={saving === "openrouter_api_key"}
            onSave={() => handleSaveKey("openrouter_api_key", openrouterKey, () => setOpenrouterKey(""))}
          />
          <KeyField
            label="Tavily API Key" name="tavily_api_key"
            isSet={keysMask.tavily_api_key ?? false}
            value={tavilyKey} onChange={setTavilyKey}
            saving={saving === "tavily_api_key"}
            onSave={() => handleSaveKey("tavily_api_key", tavilyKey, () => setTavilyKey(""))}
          />
        </section>

        {/* Model Router */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Model Router</h2>
          <p style={s.sectionHelp}>
            Paste any OpenRouter model ID (e.g.{" "}
            <code style={{ background: "var(--surface-sunken)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 12 }}>
              anthropic/claude-sonnet-4.6
            </code>
            ). Clearing a field reverts to the Catalogue default.
          </p>
          {ROLES.map(({ key, label }) => (
            <EditableField
              key={key} label={label}
              value={settings.roles[key]?.model ?? ""}
              placeholder={CATALOGUE_DEFAULTS[key]}
              onSave={(v) => updateRoleModel(key, v)}
            />
          ))}
        </section>

        {/* Search Provider */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Search Provider</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {SEARCH_PROVIDERS.map((p) => (
              <button
                key={p}
                style={{
                  height: 30, padding: "0 14px", borderRadius: 6,
                  border: settings.search_provider === p ? "1px solid var(--brand-navy-800)" : "1px solid var(--border-strong)",
                  background: settings.search_provider === p ? "var(--brand-navy-800)" : "var(--surface)",
                  color: settings.search_provider === p ? "var(--paper-0)" : "var(--foreground)",
                  fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                }}
                onClick={() => updateSettings({ search_provider: p })}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* Ollama */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Ollama (Local Embeddings)</h2>
          <p style={s.sectionHelp}>Embeddings are generated locally — no API key required.</p>
          <EditableField label="Endpoint" value={settings.ollama.endpoint} onSave={(v) => updateSettings({ ollama: { ...settings.ollama, endpoint: v } })} />
          <EditableField label="Embedding Model" value={settings.ollama.embedding_model} onSave={(v) => updateSettings({ ollama: { ...settings.ollama, embedding_model: v } })} />
        </section>
      </div>
    </div>
  );
}

function KeyField({ label, name, isSet, value, onChange, saving, onSave }: {
  label: string; name: string; isSet: boolean;
  value: string; onChange: (v: string) => void;
  saving: boolean; onSave: () => void;
}) {
  return (
    <div style={s.field}>
      <label htmlFor={name} style={s.label}>
        {label}
        {isSet && <span style={s.saved}>✓ saved</span>}
      </label>
      <div style={s.inputRow}>
        <input
          id={name} type="password"
          placeholder={isSet ? "••••••••••••" : "Enter key…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={s.input}
          autoComplete="off"
        />
        <button style={{ ...s.saveBtn, opacity: !value || saving ? 0.5 : 1, cursor: !value || saving ? "default" : "pointer" }} disabled={!value || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function EditableField({ label, value, placeholder, onSave }: {
  label: string; value: string; placeholder?: string; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const displayValue = value || placeholder || "";

  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <div style={s.inputRow}>
        {editing ? (
          <>
            <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} style={s.input} autoFocus />
            <button style={s.saveBtn} onClick={async () => { await onSave(draft); setEditing(false); }}>Save</button>
            <button style={s.editBtn} onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <div style={s.mono}>{displayValue}</div>
            <button style={s.editBtn} onClick={() => { setDraft(value); setEditing(true); }}>Edit</button>
          </>
        )}
      </div>
    </div>
  );
}
