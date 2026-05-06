# Research Companion — Domain Context

A single-user desktop app (Tauri + Python FastAPI + React) that acts as an AI research and writing companion for books, articles, essays, and investigative journalism.

## Glossary

| Term | Definition | Avoid |
|------|-----------|-------|
| **Project** | A user-created workspace scoped to one book or article. Contains documents, outline, research, and settings. | "workspace", "session" |
| **Document** | A file uploaded by the user (PDF, DOCX, TXT) that gets indexed into the vector store for RAG. | "file", "attachment" |
| **Chunk** | A fixed-size text segment produced by splitting a Document during indexing. The unit stored in the vector store. | "segment", "passage" |
| **Embedding** | A dense vector representation of a Chunk, produced by the local embedding model and stored in sqlite-vec. | "vector", "encoding" |
| **Vector Store** | The sqlite-vec extension inside the per-Project SQLite database that holds Chunks and their Embeddings. | "vector database", "index" |
| **Agent Role** | A named function in the system (Angle Explorer, Research Agent, etc.) that maps to a configured LLM model. | "agent", "task" |
| **Model Router** | The backend module that maps an Agent Role + tier to an OpenRouter model ID and constructs the LLM client. | "model selector", "router" |
| **Tier** | Either `"free"` or `"paid"` — the user's selection per Agent Role that determines which model is used. | "plan", "level" |
| **Catalogue** | The hardcoded table of free/paid model IDs per Agent Role, embedded in the Model Router. | "model list", "registry" |
| **Settings** | Non-sensitive configuration (tier per role, search provider, Ollama endpoint) stored in a JSON file. | "config", "preferences" |
| **Key Store** | The OS credential store (Windows Credential Manager / macOS Keychain / libsecret) accessed via Python `keyring`. | "secrets store", "vault" |
| **Angle Explorer** | Agent Role that takes a topic + genre and returns a set of possible angles for the user to choose from. | |
| **Outline Generator** | Agent Role that converts a chosen angle into a hierarchical document outline. | |
| **Research Agent** | Agent Role that performs web search + RAG to produce source-backed summary cards. | |
| **Literature Review Synthesizer** | Agent Role that sweeps sources, curates, and synthesises a literature review section. | |
| **Editor AI** | Agent Role that annotates a draft section with style/clarity and factual-grounding suggestions. | |
| **Source Card** | A UI element summarising one research source: title, excerpt, relevance score, citation. | "result", "card" |
| **Search Provider** | The configured web-search backend (default: Tavily). Configurable in Settings. | "search engine" |
| **Ollama** | The local inference server used to run `nomic-embed-text` for producing Embeddings. Never used for LLM generation. | |
| **Embedding Model** | The model run via Ollama to produce Embeddings (default: `nomic-embed-text`). | "embedding service" |

## Agent Role → Model Catalogue

Managed by the Model Router. Users select Tier per role; they never enter raw model IDs.

| Agent Role | Free model (default) | Paid model |
|-----------|---------------------|------------|
| Angle Explorer | `nousresearch/hermes-3-llama-3.1-405b:free` | `anthropic/claude-opus-4.7` |
| Research Agent | `meta-llama/llama-3.3-70b-instruct:free` | `google/gemini-2.5-flash` |
| Literature Review Synthesizer | `nousresearch/hermes-3-llama-3.1-405b:free` | `google/gemini-2.5-flash` |
| Editor AI | `meta-llama/llama-3.3-70b-instruct:free` | `anthropic/claude-sonnet-4.6` |
| Outline Generator | `qwen/qwen3-next-80b-a3b-instruct:free` | `anthropic/claude-sonnet-4.6` |

## Data layout

```
~/.research-companion/
├── settings.json          # Settings (non-sensitive)
└── projects/
    └── <project-id>/
        └── db.sqlite      # Per-project SQLite + sqlite-vec (Documents, Chunks, Embeddings)

OS Credential Store        # Key Store: OpenRouter API key (and optional provider keys)
```

## External services

| Service | Purpose | Key stored in |
|---------|---------|--------------|
| OpenRouter (`openrouter.ai/api/v1`) | All LLM generation via OpenAI-compatible API | Key Store |
| Ollama (`localhost:11434`) | Local Embedding model — no key needed | — |
| Tavily | Web search for Research Agent | Key Store |
