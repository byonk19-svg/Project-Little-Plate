# Ticket 17 Reviewer Intake Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a safe, reusable reviewer intake packet for the first ten PRD foods without inventing or publishing safety content.

**Architecture:** Keep the packet as repository-native Markdown plus one deliberately non-importable JSON template that mirrors `import_catalog_fixture`. Separate reviewer authority, food tracking, and machine-shaped data so each artifact has one responsibility.

**Tech Stack:** Markdown, JSON, PowerShell/Node validation, existing Supabase catalog release procedure.

---

### Task 1: Add the reviewer guidance and authority contract

**Files:**

- Create: `docs/catalog-review/README.md`
- Create: `docs/catalog-review/reviewer-authority.template.md`

- [ ] Write the safety boundary, privacy constraints, reviewer-role mapping, approval evidence requirements, and handoff sequence.
- [ ] Ensure the guidance never supplies production safety values or private reviewer contact fields.

### Task 2: Add the machine-shaped package template

**Files:**

- Create: `docs/catalog-review/catalog-package.template.json`

- [ ] Mirror the importer sections: `sources`, `tags`, `foods`, `preparations`, `revisions`, `visuals`, and `retirements`.
- [ ] Use `REQUIRED_REVIEWER_INPUT` markers for every reviewer-controlled value.
- [ ] Keep the filename explicitly non-importable until all markers are replaced and approval is recorded.

### Task 3: Add the first-ten-food tracker

**Files:**

- Create: `docs/catalog-review/first-ten-foods.template.md`

- [ ] List only the ten PRD target food names.
- [ ] Add completion checkboxes for structured record, qualified review, source evidence, visual rights, and release QA.

### Task 4: Verify the packet

**Files:**

- Test: `docs/catalog-review/catalog-package.template.json`

- [ ] Parse the JSON template with Node and assert the required top-level sections exist.
- [ ] Search the packet for accidental private contact fields or invented safety prose.
- [ ] Run `node scripts/check-whitespace.mjs` and `git diff --check`.
