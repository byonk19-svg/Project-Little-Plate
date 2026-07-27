# 03 - Browse one reviewed preparation

**What to build:** Let a caregiver browse and inspect one approved food preparation while proving that draft, retired, unsupported, or incomplete safety content cannot masquerade as published guidance.

**Blocked by:** 01 - Create a deployable mobile shell.

**Status:** ready-for-agent

- [ ] Model foods, tags, preparations, sources, content revisions, and storage rules as structured records with explicit lifecycle state.
- [ ] Approved revisions are append-only and retain source, reviewer role, approval, and next-review metadata.
- [ ] Normal application users cannot create, edit, approve, or retire curated safety content.
- [ ] A deterministic import accepts valid fixtures and rejects missing source, review, allergen, skill, or rule references.
- [ ] Running the import repeatedly produces the same content state without duplicates.
- [ ] Foods lists only active preparations backed by an approved revision.
- [ ] Food detail shows preparation context, skill prerequisites, allergen metadata, storage support state, source, and review provenance supplied by the content layer.
- [ ] Draft, in-review, retired, incomplete, and unpublished preparations remain unavailable through UI and direct application queries.
- [ ] Missing reviewed storage guidance displays an unsupported state and never receives a guessed deadline.
- [ ] Quality guidance is visibly distinct from a discard-after safety deadline.
- [ ] Browser coverage proves browse and detail behavior.
- [ ] Integration coverage proves role permissions and publication lifecycle behavior.
- [ ] Update this issue with verification evidence and the review status of all included fixtures.
