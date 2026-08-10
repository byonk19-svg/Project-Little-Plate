# Project Little Plate context

This glossary records the product terms that shape reviewed catalog releases.
It stays separate from implementation details and safety guidance.

## Language

**Pilot release**:
A deliberately small first private-pilot catalog containing exactly 10 foods,
each supported by the complete qualified review and provenance required by the
release boundary. It is a validation release, not the eventual 40–60-food
catalog target.
_Avoid_: launch catalog, sample content, demo foods

**Balanced pilot mix**:
A pilot selection spread across the approved food categories and review
scenarios needed to exercise taxonomy, allergen, storage, preparation, and
conditional visual review. The mix is chosen for coverage, not popularity.
_Avoid_: popularity list, representative sample by assumption

**Role-based approval coverage**:
The pilot must identify qualified authority for every applicable review
dimension and retain only privacy-safe authority references and evidence
locations. A missing or unsupported role does not become an owner decision or
an inferred approval.
_Avoid_: named reviewer roster, owner approval as safety review

**Fail-closed pilot release**:
A pilot food is unavailable to public reads until every applicable review,
source, storage, and conditional visual-rights requirement has complete,
qualified evidence. Convenience, schedule, or owner preference cannot waive a
missing requirement.
_Avoid_: provisional publication, owner override, soft launch exception

**Private pilot**:
The first 10-food release is visible only to the owner and explicitly
authorized testers while content, workflow behavior, accessibility, and
performance evidence are gathered. It is not an external beta or public launch.
_Avoid_: public beta, open launch, production-by-default

**Pilot expansion gates**:
The private pilot can expand only after all 10 foods pass the parent-facing
read paths, no P0/P1 safety or core-workflow defect remains, qualified review
evidence is complete, populated accessibility and performance checks pass, and
the owner records an explicit expand/stop decision.
_Avoid_: time-based launch, green CI as the only release gate

**External release gate**:
External caregiver access remains blocked until the closed-beta evidence is
complete: real dogfood, qualified content/clinical approvals, privacy/legal
review, populated accessibility and representative performance evidence, and a
named go/no-go owner with rollback authority.
_Avoid_: public beta by schedule, synthetic evidence as a substitute, anonymous
go/no-go ownership

**Personal recipe**:
A household-owned food or recipe record supplied by a caregiver or imported
from a public recipe URL. It is planning content, not reviewed Little Plate
catalog content, and never makes a safety, storage, or feeding-eligibility
claim.
_Avoid_: reviewed preparation, approved food, public catalog item.

**Personal planning item**:
A personal recipe placed on a household baby's weekly day and meal slot. It is
visible to household caregivers in Week, carries a not-reviewed label, and is
excluded from Today, Kitchen, serving, storage, and eligibility decisions.
_Avoid_: meal component, eligible preparation, recommendation.
