# ADR-0001: Settings & Model Router architecture

**Status:** Accepted  
**Date:** 2026-05-06  
**Issue:** #5 — Settings & Model Router

---

## Context

Five Agent Roles need to call LLMs. Originally the plan called for separate Anthropic and Google API clients. The user also needs to store API keys securely on a local desktop and select between free and paid models per role.

---

## Decisions

### 1. OpenRouter as the sole LLM gateway

**Decision:** All LLM generation goes through OpenRouter (`https://openrouter.ai/api/v1`) using the OpenAI-compatible API. No direct Anthropic or Google SDK clients.

**Rationale:** Single API key, single HTTP client, 300+ models accessible without provider-specific SDK juggling. OpenRouter model IDs (`anthropic/claude-opus-4.7`, `meta-llama/llama-3.3-70b-instruct:free`) are stable enough to hardcode in the Catalogue.

**Consequence:** We cannot use provider-specific features (Anthropic extended thinking, Google Grounding, batch API). Acceptable for v1.

---

### 2. Raw model ID entry per role ~~(was: Tier-based model selection)~~

> **Amended 2026-05-13:** Decision reversed. See rationale below.

**Decision:** Users enter a raw OpenRouter model ID per Agent Role in Settings. The Catalogue becomes a set of read-only *defaults* shown in the Settings UI, not locked values. Settings stores `{"model_id": "..."}` per role. The Tier/free/paid toggle is removed.

**Rationale:** The buddy UI kit (canonical hi-fi reference) exposes raw model IDs. Power users on a local-first desktop app are the target audience and benefit from direct control — they know what `anthropic/claude-opus-4.7` means. Invalid IDs surface as an OpenRouter error on first use, which is acceptable for this audience. The Catalogue defaults guide users without constraining them.

**Catalogue is in code as defaults only.** Settings stores `{"model_id": "..."}` per role; if absent, the Catalogue default is used.

---

### 3. OS Key Store for API keys via `keyring`

**Decision:** API keys (OpenRouter, Tavily) are written to and read from the OS credential store using the Python `keyring` library. They are never written to disk in plaintext.

**Rationale:** Least-effort cross-platform secure storage. Windows Credential Manager, macOS Keychain, and Linux libsecret are all supported by `keyring` with no extra configuration.

**`GET /settings/keys` returns a boolean mask only** — which keys are set, never their values. The frontend never holds a key value in state after the user submits the save form.

---

### 4. `settings.json` for non-sensitive config

**Decision:** Non-sensitive settings (tier per role, search provider, Ollama endpoint + embedding model) are stored at `~/.research-companion/settings.json`.

**Rationale:** Simple, human-readable, easy to back up or reset. No encryption needed — none of this data is sensitive.

**Defaults are applied at read time** if the file doesn't exist or a key is missing. The file is only written when the user explicitly saves.

---

### 5. Ollama for embeddings — separate from OpenRouter

**Decision:** The local Ollama server (`http://localhost:11434`) handles all embedding generation using `nomic-embed-text`. This is never routed through OpenRouter.

**Rationale:** Keeps research Documents on-device (no API cost, no data egress). Ollama is already the intended embedding backend per the PRD.

**Configurable in Settings:** Ollama endpoint URL and embedding model name are stored in `settings.json` so power users can point at a remote Ollama instance or swap models.

> **Updated 2026-05-11:** The default Embedder is now `fastembed` running `BAAI/bge-small-en-v1.5` in-process (ONNX, ~100 MB RAM, no server required). Ollama remains a supported override for power users. The "embeddings never go through OpenRouter" rule still holds. See [CONTEXT.md](../../CONTEXT.md) glossary entry for **Embedder**.

---

### 6. Settings UI — sidebar nav → settings page

> **Amended 2026-05-13:** Settings is now reached via the sidebar nav button, not a header cog icon, per the buddy layout.

**Decision:** A Settings nav button in the sidebar navigates to a dedicated Settings page (not a modal). The page has three sections: **API Keys**, **Model Router** (raw model ID per role, with Catalogue defaults shown), and **Search Provider**.

**Rationale:** A full page gives room to grow (future: proxy settings, export options). A modal would feel cramped with five role rows plus multiple key fields.

---

## Rejected alternatives

| Alternative | Reason rejected |
|-------------|----------------|
| Separate Anthropic + Google SDK clients | Two API keys, two clients, harder to add new providers |
| Free-form model ID input | ~~Too easy to misconfigure~~ — reversed in 2026-05-13 amendment; see Decision #2 |
| Encrypt settings.json | Non-sensitive data; adds complexity for no benefit |
| Tauri plugin-stronghold for key storage | Complex setup; `keyring` covers all platforms with one line |
| Settings in a modal/drawer | Not enough space for all sections; page scales better |
