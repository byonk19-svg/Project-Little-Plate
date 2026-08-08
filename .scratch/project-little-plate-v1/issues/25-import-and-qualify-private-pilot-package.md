# 25 — Import and qualify the reviewed private-pilot package

**What to build:** Accept one complete ten-food candidate package through the
existing candidate and qualified-review boundaries, leaving incomplete,
synthetic, contradictory, or unsupported records unavailable and preserving
all review evidence needed for later private-pilot testing.

**Blocked by:** 24 — Record the ten-food private-pilot scope

**Status:** needs-info

Ticket 25 is blocked on externally supplied qualified review evidence. The
repository contains the packet, source map, and research-only draft, but no
agent may manufacture the required safety decisions or authority references.

- [ ] The package contains exactly the ten scoped candidates and stable
      non-test identifiers.
- [ ] Candidate values and review evidence are supplied by qualified,
      source-backed inputs; the implementation does not infer or rewrite
      safety-critical guidance.
- [ ] Every applicable review dimension has qualified authority coverage,
      evidence references, review date, and a deterministic decision.
- [ ] Missing or unsupported source, storage, allergen/developmental, or
      conditional visual-rights/alt-text evidence produces a fail-closed
      rejection with machine-readable reasons.
- [ ] Fixture, seed, demo, synthetic, blocked, retired, and superseded records
      cannot become publicly visible through import or retry behavior.
- [ ] Repeating an identical valid package is idempotent; corrections preserve
      immutable history and require a new candidate revision where applicable.
- [ ] Integration coverage proves candidate/review isolation from every
      parent-facing read path, including Foods, Today, Week, eligibility,
      planner, and manual meal planning.
- [ ] Validation results and any externally missing qualified evidence are
      recorded in the local issue before handoff.

## Intake packet prepared

- Reviewer packet: `docs/catalog-review/private-pilot-review-packet.md`.
- Reviewer handoff: `docs/catalog-review/private-pilot-reviewer-request.md`.
- Evidence map: `docs/research/2026-08-06-private-pilot-evidence-map.md`.
- Research-only draft: `docs/catalog-review/private-pilot-research-draft.md`.
- The packet pre-fills only the ten PRD candidate identities and the required
  six-dimension evidence matrix. It contains no safety guidance or approval.
- Ticket 25 remains blocked until qualified reviewers supply stable candidate
  identifiers, source-backed values, privacy-safe authority references, and
  complete decisions/evidence for every applicable dimension.

## Current blocker

- **Needs information:** a qualified reviewer must return the completed packet
  before any candidate can be imported or published.
- The private runtime can proceed independently through Ticket 26A; the
  populated pilot remains downstream of this content gate.
