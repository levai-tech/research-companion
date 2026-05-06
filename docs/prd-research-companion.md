# PRD: Research Companion

## Problem Statement

Writers working on books, academic articles, investigative journalism pieces, and essays face a fragmented research workflow. They must manually hunt for sources across multiple platforms, manage large volumes of reference material (PDFs, books, web pages), structure their arguments from scratch, and switch between separate tools for research, writing, and editing. There is no unified tool that understands the conventions of different writing genres, actively helps explore angles, retrieves and organises relevant evidence, and checks the written work against the gathered sources.

## Solution

A desktop application (Windows `.exe`) that acts as an AI-powered research and writing companion. The user starts a project by declaring a topic and writing genre (academic article, book, investigative journalism, essay). The app then guides them through angle exploration, document structure selection, source discovery and indexing, drafting, and editorial review — all within a single interface. AI agents handle research autonomously using web search and RAG over user-supplied files, while the user remains in control of curation and direction. The final document can be exported as DOCX or PDF with properly formatted citations.

## User Stories

1. As a writer, I want to create a new project by entering a topic and selecting a writing genre, so that the app can tailor its guidance to my specific type of document.
2. As a writer, I want the app to present 2–3 structural options for my document (e.g. chronological vs. thematic), with tradeoffs explained, so that I can make an informed choice about how to organise my argument.
3. As a writer, I want the app to generate a detailed outline from my chosen structure, so that I have a clear skeleton to write against.
4. As a writer, I want the AI to propose 3–5 research angles on my topic, so that I can explore different dimensions I might not have considered.
5. As a writer, I want to select, reject, and refine the proposed angles, so that the research stays focused on what I actually care about.
6. As a writer, I want AI agents to search the web for sources relevant to each angle, so that I don't have to manually hunt across multiple platforms.
7. As a writer, I want the app to suggest where to look for sources (specific journals, databases, archives, subreddits, experts), so that I know which resources are most relevant to my genre and topic.
8. As a writer, I want to supply my own large files (PDFs, books, text files) and have the app index them, so that agents can retrieve relevant passages without me reading everything manually.
9. As a writer, I want the app to retrieve relevant chunks from my indexed files using RAG, so that large documents don't overwhelm the AI's context window.
10. As a writer, I want research findings presented as summary cards (headline finding, key bullet points, citations), so that I can scan results quickly.
11. As a writer, I want an automated initial literature review sweep for academic projects, so that I have a foundation of prior work to build on.
12. As a writer, I want to add and remove sources from the literature review before it is synthesised, so that I control what prior work is represented.
13. As a writer, I want the AI to synthesise my curated sources into a literature review section, so that I don't have to write it from scratch.
14. As a writer, I want a rich-text editor inside the app, so that I can draft sections without switching to an external tool.
15. As a writer, I want to see per-section progress status (Not Started / Drafting / In Review / Done), so that I always know where I am on a long project.
16. As a writer, I want an editor AI to review my draft for style and clarity, so that my writing is polished before publication.
17. As a writer, I want the editor AI to flag claims that are not backed by my indexed sources, so that I can catch unsupported assertions before submitting.
18. As a writer, I want a source sidebar that shows the exact source chunk when I click on a citation, so that I can verify references without leaving the app.
19. As a writer, I want to export my finished document as DOCX, so that I can share it with editors or collaborators who use Word.
20. As a writer, I want to export my finished document as PDF, so that I can submit or distribute a polished, formatted version.
21. As a writer, I want citations formatted correctly in the export, so that my document meets genre conventions (e.g. APA, Chicago, footnotes).
22. As a writer, I want to configure which AI model is used for each agent role (angle explorer, research agent, editor AI), so that I can balance cost, speed, and quality.
23. As a writer, I want sensible model defaults out of the box (e.g. Gemini Flash for research, Claude Sonnet for editing, Opus 4.7 for angle exploration), so that the app works well without manual configuration.
24. As a writer, I want to store my API keys locally in a settings screen, so that I don't have to re-enter them every session.
25. As a writer, I want to configure which web search provider the agents use (default: Tavily), so that I can swap providers if needed.
26. As a writer, I want each project to have a structured folder for raw source material alongside the app database, so that I can organise files I gather manually.
27. As a writer, I want a home screen to open or switch between projects, so that I can manage multiple ongoing works.
28. As a writer, I want embeddings computed locally (via Ollama), so that my research material never leaves my machine.

## Implementation Decisions

### Architecture
- **Desktop shell:** Tauri (Rust + web frontend) shipping as a native `.exe`
- **Backend:** Python process serving a local API (FastAPI); Tauri communicates with it over localhost
- **Database:** SQLite per project, extended with `sqlite-vec` for vector storage
- **Embeddings:** `nomic-embed-text` via Ollama, run locally
- **Project folder:** Each project gets a structured directory for raw source files alongside its `.db` file

### Modules

**Project Manager**
Handles project creation, opening, and switching. Stores project metadata (title, genre, outline, section statuses) in SQLite. Exposes a simple interface: create, open, list, and update project state.

**Document Indexer**
Ingests PDFs, plain text, and web pages. Chunks documents using a fixed-size strategy with overlap. Generates embeddings via Ollama (`nomic-embed-text`). Stores chunks and vectors in SQLite+sqlite-vec. Interface: `index(file_or_url) → source_id`, `query(text, top_k) → [chunk]`.

**Angle Explorer**
Given a topic and genre, prompts a large model (default: Opus 4.7, configurable) to propose 3–5 research angles. Returns structured angle objects the user can accept, reject, or edit. Interface: `propose_angles(topic, genre) → [angle]`.

**Outline Generator**
Given genre and accepted angles, presents 2–3 structural options with tradeoff explanations. On user selection, generates a detailed outline with sections and subsections. Interface: `propose_structures(genre, angles) → [structure_option]`, `generate_outline(structure, angles) → outline`.

**Research Agent**
For each angle, runs web search (Tavily by default) and RAG queries against indexed documents. Assembles results into summary cards: headline, bullet-point key ideas, and citations. Interface: `research(angle, sources) → [card]`.

**Resource Suggester**
Given genre and topic, recommends specific places to look for sources (journals, databases, archives). Returns a ranked list with descriptions. Interface: `suggest_resources(topic, genre) → [resource]`.

**Literature Review Synthesizer**
Aggregates sources selected by the user. Synthesises them into a structured literature review section. Interface: `synthesise(sources) → review_text`.

**Editor AI**
Takes a section draft and checks: (1) style and clarity, (2) factual grounding — every claim is matched against indexed source chunks. Returns annotated feedback with source links for unsupported claims. Interface: `review(section_text) → [annotation]`.

**Model Router**
Maps agent roles to configured models. Reads role→model config from Settings Manager. Provides a single call interface so agents don't need to know which model they're using. Interface: `call(role, prompt) → response`.

**Outline Generator** (see above)

**Export Engine**
Renders the completed outline + drafted sections into DOCX and PDF. Formats citations according to genre convention. Interface: `export(project, format) → file`.

**Settings Manager**
Persists API keys, model-per-role config, and search provider selection to a local config file. No network calls; purely local read/write.

### Model Defaults
| Role | Default Model |
|------|--------------|
| Angle Explorer | Claude Opus 4.7 |
| Research Agent | Gemini Flash |
| Literature Review Synthesizer | Gemini Flash |
| Editor AI | Claude Sonnet 4.6 |
| Outline Generator | Claude Sonnet 4.6 |

### Search Provider
Tavily as default; configurable in Settings Manager to any provider with a compatible interface.

## Testing Decisions

**What makes a good test:** Tests should assert on external behaviour given controlled inputs — never on internal implementation details. Mock external APIs (Tavily, Ollama, LLM providers) at the boundary so tests are fast and deterministic.

**Modules with tests:**

- **Document Indexer** — test chunking logic (correct chunk sizes, overlap, boundary handling) and that `query()` returns the most relevant chunks for known embeddings
- **Research Agent** — given mocked search results and mocked RAG responses, assert that summary cards are assembled correctly with accurate citations
- **Editor AI** — given a draft with known supported and unsupported claims and a mocked source index, assert correct annotation output
- **Export Engine** — given a fixed outline and draft, assert that DOCX/PDF output contains expected sections and citation strings
- **Model Router** — assert correct model is selected per role; assert fallback behaviour when a model is unconfigured
- **Outline Generator** — given a genre and angles, assert that the returned structure options match expected shapes and that the generated outline contains the correct sections

## Out of Scope

- User accounts or authentication (single-user local app)
- Cloud sync or remote storage
- Real-time collaboration
- Mobile or web versions
- Multiple projects open simultaneously (tabbed interface)
- Citation style configuration in v1 (genre defaults only)
- Fine-tuning or training custom models
- Voice input

## Further Notes

- The app is single-user and runs entirely locally, except for external API calls (LLM providers, Tavily). No user data leaves the machine unless explicitly sent to a configured API.
- The Python backend and Tauri frontend should communicate over a localhost port; the port should be chosen dynamically to avoid conflicts.
- Ollama must be installed separately by the user; the app should detect its presence and show a clear setup prompt if it is missing.
- Genre conventions for citation formatting (APA, Chicago, etc.) should be configurable per project in a future version.
