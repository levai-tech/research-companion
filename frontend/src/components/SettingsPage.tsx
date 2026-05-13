import { useEffect, useState } from "react";
import { useSettingsStore } from "../settingsStore";
import { useAppStore } from "../store";
import { Button } from "@/components/ui/button";

const ROLES: { key: string; label: string }[] = [
  { key: "project_advisor", label: "Project Advisor" },
  { key: "approach_explorer", label: "Approach Explorer" },
  { key: "research_agent", label: "Research Agent" },
  { key: "literature_review", label: "Literature Review Synthesizer" },
  { key: "editor_ai", label: "Editor AI" },
  { key: "outline_generator", label: "Outline Generator" },
  { key: "semantic_ingester", label: "Semantic Ingester" },
];

const SEARCH_PROVIDERS = ["tavily", "brave"];

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
    loadSettings().then((err) => {
      if (err) setLoadError(err);
    });
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
      <div className="p-8 space-y-3 text-sm">
        <p className="text-muted-foreground">
          {backendPort === null
            ? "Waiting for backend port…"
            : `Connecting to backend on port ${backendPort}…`}
        </p>
        {loadError && (
          <p className="text-destructive font-mono text-xs break-all">{loadError}</p>
        )}
        {backendPort !== null && (
          <button
            className="underline text-muted-foreground hover:text-foreground"
            onClick={() => {
              setLoadError(null);
              loadSettings().then((err) => { if (err) setLoadError(err); });
              loadKeysMask();
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-10">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* API Keys */}
      <section className="space-y-4">
        <h2 className="text-base font-medium border-b pb-2">API Keys</h2>

        <KeyField
          label="OpenRouter API Key"
          name="openrouter_api_key"
          isSet={keysMask.openrouter_api_key ?? false}
          value={openrouterKey}
          onChange={setOpenrouterKey}
          saving={saving === "openrouter_api_key"}
          onSave={() => handleSaveKey("openrouter_api_key", openrouterKey, () => setOpenrouterKey(""))}
        />

        <KeyField
          label="Tavily API Key"
          name="tavily_api_key"
          isSet={keysMask.tavily_api_key ?? false}
          value={tavilyKey}
          onChange={setTavilyKey}
          saving={saving === "tavily_api_key"}
          onSave={() => handleSaveKey("tavily_api_key", tavilyKey, () => setTavilyKey(""))}
        />
      </section>

      {/* Model Router */}
      <section className="space-y-4">
        <h2 className="text-base font-medium border-b pb-2">Model Router</h2>
        <p className="text-sm text-muted-foreground">
          Paste any OpenRouter model ID (e.g. <code className="font-mono text-xs">anthropic/claude-sonnet-4.6</code>).
          Find available models at <span className="font-mono text-xs">openrouter.ai/models</span>.
        </p>

        <div className="space-y-3">
          {ROLES.map(({ key, label }) => {
            const model = settings.roles[key]?.model ?? "";
            return (
              <EditableField
                key={key}
                label={label}
                value={model}
                onSave={(v) => updateRoleModel(key, v)}
              />
            );
          })}
        </div>
      </section>

      {/* Search Provider */}
      <section className="space-y-4">
        <h2 className="text-base font-medium border-b pb-2">Search Provider</h2>
        <div className="flex gap-2">
          {SEARCH_PROVIDERS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={settings.search_provider === p ? "default" : "outline"}
              onClick={() => updateSettings({ search_provider: p })}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
        </div>
      </section>

      {/* Ollama */}
      <section className="space-y-4">
        <h2 className="text-base font-medium border-b pb-2">Ollama (Local Embeddings)</h2>
        <p className="text-sm text-muted-foreground">
          Embeddings are generated locally — no API key required.
        </p>

        <EditableField
          label="Endpoint"
          value={settings.ollama.endpoint}
          onSave={(v) => updateSettings({ ollama: { ...settings.ollama, endpoint: v } })}
        />

        <EditableField
          label="Embedding Model"
          value={settings.ollama.embedding_model}
          onSave={(v) => updateSettings({ ollama: { ...settings.ollama, embedding_model: v } })}
        />
      </section>
    </div>
  );
}

function KeyField({
  label, name, isSet, value, onChange, saving, onSave,
}: {
  label: string; name: string; isSet: boolean;
  value: string; onChange: (v: string) => void;
  saving: boolean; onSave: () => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {isSet && <span className="ml-2 text-xs text-green-600 font-normal">✓ saved</span>}
      </label>
      <div className="flex gap-2">
        <input
          id={name}
          type="password"
          placeholder={isSet ? "••••••••••••" : "Enter key…"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border px-3 py-1.5 text-sm"
          autoComplete="off"
        />
        <Button size="sm" disabled={!value || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function EditableField({
  label, value, onSave,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2 items-center">
        {editing ? (
          <>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-md border px-3 py-1.5 text-sm"
            />
            <Button size="sm" onClick={async () => { await onSave(draft); setEditing(false); }}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <span className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-muted/50 text-muted-foreground font-mono">
              {value}
            </span>
            <Button size="sm" variant="outline" onClick={() => { setDraft(value); setEditing(true); }}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
