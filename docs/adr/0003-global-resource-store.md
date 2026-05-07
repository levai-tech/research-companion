# ADR-0003: Global Resource Store for deduplication

**Status:** Accepted
**Date:** 2026-05-07

Resources (uploaded files and webpages) are shared across Projects via a global `resources.db` SQLite file at `~/.research-companion/resources.db`, rather than duplicated into each Project's own `db.sqlite`. The per-project `db.sqlite` holds only a `project_resources` join table linking Project IDs to Resource IDs.

The driver is deduplication: the same book or article is often used across multiple Projects, and re-vectorizing it each time is wasteful. A global store means Chunks and Embeddings are produced once and shared.

## Consequences

- **Resource identity** is stable and content-addressed: uploaded files are identified by SHA-256 hash of their content; webpages by their normalized URL. Adding the same file or URL to a second Project attaches the existing record — no re-indexing.
- **Deletion requires a reference check.** Removing a Resource from a Project detaches the `project_resources` row. If no other Project references that Resource, the global record (Chunks, Embeddings, raw file in `~/.research-companion/sources/`) is deleted. The raw `sources/` directory is now global, not per-project.
- **Per-project DB is simpler.** The `db.sqlite` no longer needs sqlite-vec. All vector search stays in `resources.db`, filtered by the `project_resources` join.

## Considered alternatives

| Alternative | Reason rejected |
|-------------|----------------|
| Per-project DB with copy-on-attach | Copying embeddings is wasteful; source of truth for a shared Resource is ambiguous |
| Per-project DB, accept duplication | Directly rejected by the requirement not to vectorize the same book twice |
