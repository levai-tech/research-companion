# Buddy — Levai UI Kit

A clickable visual recreation of the **Buddy desktop app** — Levai's AI helper for writing projects.

This kit is the canonical hi-fi reference for the product. It is **not** production code; it cuts corners on functionality (in-memory state, scripted Buddy replies, fake save indicators) so the visuals can stay pixel-aligned with the design system in `../../colors_and_type.css`. The real production code lives in the `frontend/` codebase mounted via the design-system project.

## Run it

Open `index.html` — it's a single-page React shell loaded via Babel. No build step.

## What it covers

- **Sidebar** — persistent left rail. Logo + wordmark, Settings + Resources nav buttons, "New project" button, scannable project list, footer with user.
- **HomeChat** — the main pane when no project is open. Welcome hero + suggestions; once the user sends a message, it transitions into the interview transcript (Buddy + user turns).
- **Workspace** — opened when a project is clicked. Header with title + Resources count, tab bar (Transcript / Approach / Outline / Editor), and rich content per tab. The Editor tab uses Source Serif 4 with a Buddy-citation callout block.
- **ResourcesPanel** — slide-over from the right. Backdrop blur over the active content (the one and only place blur is used). Search + list + add file/URL footer. Accessible from anywhere — the sidebar button and the workspace's Resources chip both open it.
- **SettingsPage** — full settings surface (API keys, model router per role, search provider).
- **Composer** — the rounded-pill chat input with inner-shadow lift. Lives at the bottom of HomeChat and would live inside Workspace's Editor as the AI scratchpad in the real product.

## Files

```
index.html         Entry point. Loads React + Babel and every .jsx below.
app.jsx            App shell: state, routing between views, seed data.
Sidebar.jsx        Left rail.
HomeChat.jsx       Welcome + interview surface.
Workspace.jsx      Project workspace (tabs + Editor/Outline/Approach/Transcript).
SettingsPage.jsx   Settings.
ResourcesPanel.jsx Slide-over resources drawer + status pills.
ChatTurn.jsx       Buddy + user bubble turns.
Composer.jsx       The pill-shape input.
icons.jsx          Lucide-style icons inlined as a tiny React module.
```

## Source-of-truth references

When updating this kit, cross-reference the working code under `frontend/src/components/`:

| Kit component | Frontend reference | Notes |
| --- | --- | --- |
| `Sidebar.jsx`        | `App.tsx` + `HomeScreen.tsx` | New layout — Claude-style rail replacing the top header. |
| `HomeChat.jsx`       | `Interview.tsx`              | Same interview state machine; restyled with hero + suggestions. |
| `Workspace.jsx`      | `ProjectWorkspace.tsx`       | Tab set is the same: Transcript, Approach, Outline, Editor, (Resources moves OUT to the slide-over). |
| `SettingsPage.jsx`   | `SettingsPage.tsx`           | Field list and shape preserved. |
| `ResourcesPanel.jsx` | `ResourcesTab.tsx` + `AddResourceModal.tsx` | Moved from tab to slide-over per the home-screen direction. |
| `Composer.jsx`       | Inline `<input>` in `Interview.tsx` | Promoted to a real component with the brand's pill shape. |

## Intentionally not in the kit

- The **JobTray** indexing-progress strip at the bottom of the workspace is stubbed (no progress bars). It exists in the codebase and would be reused as-is.
- The TipTap **ribbon** is a static row of letterforms; real ribbon behaviors live in `frontend/src/components/EditorRibbon.tsx`.
- **Auth / multi-user** — Buddy is single-user local-first today.

## Known caveats

- React 18 inline `style` objects only — no Tailwind classes — because the kit needs to read as a self-contained UI vocabulary. Production code uses Tailwind v4 + shadcn; the same tokens drive both.
- Babel is in-browser. Don't ship this kit; ship the codebase.
