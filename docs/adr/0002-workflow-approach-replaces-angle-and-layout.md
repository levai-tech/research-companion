# ADR-0002: Workflow redesign — Approach replaces Angle + Theme + Layout

**Status:** Accepted  
**Date:** 2026-05-07

The four-stage writing workflow (Interview → Approach → Outline → Editor) replaces the previous three-stage flow (Interview → Angles → Outline → Editor). Three specific decisions drove this change.

---

## Decision 1: Collapse `theme` + `angle` → `Approach`

The project model previously stored `theme` (the overarching argument) and `angle` (the specific lens) as separate fields, and the Angle Explorer proposed 3–5 independent angles for the user to accept/reject. These two concepts were too fine-grained and overlapping in practice.

A single **Approach** — shape `{title, description}`, one per Project — replaces both. The Approach Explorer proposes 3 candidates derived from the Interview Transcript; the user picks one and refines it before confirming. The `theme` and `angle` columns are removed from `project_meta`.

---

## Decision 2: Kill Layout

`layout_id` and the Layout picker (end of Interview) are removed entirely. Layout was a structural template chosen before the user had thought about their Approach, which reversed the natural creative order. With a richer Approach now feeding the Outline Generator, structure can be inferred at outline-generation time rather than pre-selected as a first-class concept.

---

## Decision 3: Collapse Outline Generator to one stage

The Outline Generator previously ran in two stages: propose structural options → generate outline from chosen structure. The structural-options stage existed to bridge the Layout choice into the outline; without Layout, it has no independent purpose. The Outline Generator now takes the confirmed Approach and produces a full outline in a single step.

---

## Considered alternatives

| Alternative | Reason rejected |
|-------------|----------------|
| Keep `theme` and `angle` as separate fields | Too fine-grained; users don't naturally distinguish them; Approach captures both in one writable description |
| Move Layout to the Outline stage instead of killing it | Still adds a pre-selection step at the wrong moment; Approach already carries structural intent |
| Keep two-stage Outline Generator | The first stage only existed to serve Layout selection; removing Layout makes it redundant friction |
