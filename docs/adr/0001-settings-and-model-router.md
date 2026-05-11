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

### 2. Tier-based model selection (not free-form)

**Decision:** Users select `"free"` or `"paid"` per Agent Role. The Model Router resolves this to a concrete model ID using the hardcoded Catalogue. Users never enter raw model IDs.

**Rationale:** Prevents misconfiguration (invalid model IDs, choosing a coding model for creative writing). Allows us to update the Catalogue to better models without requiring user action.

**Catalogue is in code, not in settings.json.** Settings only stores `{"tier": "free"|"paid"}` per role.

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

### 6. Settings UI — cog icon → settings page

**Decision:** A gear icon in the app header navigates to a dedicated Settings page (not a modal). The page has three sections: **API Keys**, **Model Router** (tier per role), and **Ollama**.

**Rationale:** A full page gives room to grow (future: proxy settings, export options). A modal would feel cramped with five role rows plus multiple key fields.

---

## Rejected alternatives

| Alternative | Reason rejected |
|-------------|----------------|
| Separate Anthropic + Google SDK clients | Two API keys, two clients, harder to add new providers |
| Free-form model ID input | Too easy to misconfigure; no guard against invalid IDs |
| Encrypt settings.json | Non-sensitive data; adds complexity for no benefit |
| Tauri plugin-stronghold for key storage | Complex setup; `keyring` covers all platforms with one line |
| Settings in a modal/drawer | Not enough space for all sections; page scales better |
