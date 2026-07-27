# Project Little Plate V1 Specification

**Status:** ready-for-agent
**Product owner:** Brianna
**Specification date:** July 27, 2026
**Source:** Project Little Plate Product Brief and V1 PRD, repository guidance, and the approved V1 execution plan

## Problem Statement

Caregivers feeding a baby who is established on solid foods repeatedly need to decide what to serve, how to serve it, whether suitable food is already available, and whether a prepared portion is still within its reviewed storage window. Existing food libraries and meal planners provide ideas or education, but they do not reliably connect a practical weekly plan to prepared-food inventory, reviewed deadlines, and a clear answer at mealtime.

The caregiver currently carries this state mentally or across disconnected notes, containers, searches, and meal plans. That creates daily decision fatigue, repetitive meals, unnecessary preparation, food waste, and uncertainty about storage and serving.

The user needs a calm, trustworthy baby meal operations tool that answers:

> What can I safely and realistically feed next, using what I already have, before it expires?

The product must reduce work rather than introduce a detailed logging burden. It must also maintain a strict boundary between reviewed safety content and product convenience. It is not a medical system and must never invent or infer individualized feeding, allergen, reaction, choking, or storage guidance.

## Solution

Project Little Plate is a mobile-first web application for a U.S.-based caregiver of one active baby approximately 9-15 months old. It connects four workflows:

1. **Today** provides one clear next-meal recommendation, practical substitutions, use-soon inventory, and a minimal serving flow.
2. **Week** supports a seven-day component-based plan that can be assembled manually before deterministic generation is introduced.
3. **Kitchen** turns planned components into preparation tasks and maintains an auditable refrigerator/freezer portion inventory with source-backed deadlines.
4. **Foods** presents a deliberately small catalog of reviewed foods and skill-compatible preparations with source, allergen, exposure, and storage-support information.

The V1 core loop is:

> Plan -> Prepare -> Store -> Serve -> Learn -> Repeat

The first product proof is a narrow vertical slice in which a caregiver creates a baby profile, browses an approved preparation, adds it to tomorrow's meal, records two prepared portions, receives an explained deadline, sees the batch in Kitchen and Today, serves one portion, and is prevented from serving it after expiration.

After that loop is reliable, V1 adds manual week editing, preparation and grocery derivation, full inventory transitions, exposure and reaction handling, and finally a deterministic planner. The planner never relaxes a hard constraint and either returns a fully feasible plan or an actionable failure.

Safety-critical content is structured, cited, reviewed, versioned, and published through an explicit content lifecycle. Unsupported content remains visibly unsupported. The application stores the source and rule revision behind historical safety-relevant results.

## User Stories

### Account, household, and onboarding

1. As a caregiver, I want to sign in without creating another password, so that I can begin setup with little friction.
2. As a caregiver, I want my household data isolated from every other household, so that my baby's information remains private.
3. As a caregiver, I want login retries to be safe, so that a repeated callback does not create duplicate households or profiles.
4. As a caregiver, I want to enter a nickname rather than a legal name, so that the app collects less child data.
5. As a caregiver, I want my device time zone suggested but editable, so that meals and deadlines appear in the correct local time.
6. As a caregiver, I want to select one, two, or three solid-food meal slots, so that the plan matches our current routine.
7. As a caregiver, I want to select finger foods, spoon-fed foods, or mixed feeding, so that the app starts with relevant options.
8. As a caregiver, I want preparation eligibility based on observable feeding skills rather than birthday alone, so that suggestions fit what my baby can currently manage.
9. As a caregiver who is uncertain about a feeding skill, I want to choose "not sure," so that the app uses a conservative setup without pretending to diagnose my baby.
10. As a caregiver, I want to revise feeding skills later, so that preparation eligibility can change as my baby develops.
11. As a caregiver, I want to record confirmed allergies, directed exclusions, and temporary avoidances, so that blocked foods are not suggested.
12. As a caregiver, I want to seed exposure history from a short list, so that the app begins with useful context without a long questionnaire.
13. As a caregiver, I want to skip exposure setup, so that unknown history does not prevent me from reaching the product.
14. As a caregiver, I want unknown exposure distinguished from "not tried," so that the app does not falsely classify a food as a planned introduction.
15. As a caregiver, I want to choose a weekly new-food pace, so that suggested variety fits my comfort.
16. As a caregiver, I want to choose a typical preparation-time limit, so that plans avoid unrealistic work.
17. As a caregiver, I want to identify a small set of quick backups, so that the app can offer practical alternatives without maintaining a full pantry.
18. As a caregiver, I want onboarding to take less than three minutes, so that setup does not cost more effort than the app saves.

### Foods and reviewed content

19. As a caregiver, I want to browse a small, curated food catalog, so that I can find reviewed options without searching a giant library.
20. As a caregiver, I want to filter foods by category, allergen, familiarity, skill compatibility, preparation time, and storage support, so that I can find feasible options quickly.
21. As a caregiver, I want each food page to show only active, reviewed preparations, so that draft or retired guidance is never presented as approved.
22. As a caregiver, I want to see preparation method, shape or texture, skill prerequisites, allergen metadata, and source information together, so that serving context is understandable.
23. As a caregiver, I want unsupported storage guidance labeled clearly, so that the app does not manufacture a deadline.
24. As a caregiver, I want quality guidance distinguished from a safety deadline, so that normal quality changes are not presented as safety facts.
25. As a caregiver, I want meaningful image descriptions and licensed or original visuals where visuals are needed, so that guidance is accessible and lawful.
26. As a content reviewer, I want every safety-critical record to retain its source, revision, review role, approval date, and next review date, so that publication is auditable.
27. As a content reviewer, I want invalid or incomplete content rejected before publication, so that missing provenance cannot reach caregivers.
28. As a content reviewer, I want to retire a content revision without rewriting historical calculations, so that current safety can change while past outcomes remain explainable.
29. As a product operator, I want overdue or source-changed content flagged, so that safety records receive timely review.

### Week and manual planning

30. As a caregiver, I want a readable seven-day mobile plan, so that I can understand the week without using a spreadsheet interface.
31. As a caregiver, I want the configured number of meal slots per day, so that Week matches our feeding routine.
32. As a caregiver, I want to browse an approved preparation and add it to a future meal, so that I can build a week manually.
33. As a caregiver, I want restricted or skill-incompatible preparations blocked during manual planning, so that direct editing cannot bypass safety.
34. As a caregiver, I want to add one to three components to a meal, so that meals remain simple and component-based.
35. As a caregiver, I want to lock a meal or component, so that later generation or regeneration preserves my decisions.
36. As a caregiver, I want to swap one component or an entire meal, so that I can recover quickly when a plan is impractical.
37. As a caregiver, I want to undo my most recent swap, so that experimentation is low risk.
38. As a caregiver, I want to copy a meal to another day, so that repeating a successful plate is easy.
39. As a caregiver, I want to delete a component and mark a meal skipped or completed, so that Week reflects what happened.
40. As a caregiver, I want meal edits to update Kitchen tasks and grocery needs, so that the rest of the product stays synchronized.
41. As a caregiver, I want a supportive summary of recent variety, so that I can notice patterns without receiving a grade or streak.
42. As a caregiver, I want newly blocked foods in existing future meals surfaced for replacement, so that an old plan does not silently remain actionable.

### Kitchen, batches, and deadlines

43. As a caregiver, I want Kitchen to consolidate preparation work by action, so that I can prepare efficiently rather than reading meal by meal.
44. As a caregiver, I want each preparation task traced to the meals it supports, so that I understand why the work is needed.
45. As a caregiver, I want quantities expressed as practical portions, so that the app avoids false-precision measurements.
46. As a caregiver, I want completing a preparation task to start batch creation with the food already selected, so that I do not enter the same information twice.
47. As a caregiver, I want to create a batch with preparation time, portion count, and initial refrigerator/freezer location, so that the app can track usable food.
48. As a caregiver, I want batch creation to default to now and finish in under 30 seconds, so that inventory logging remains worthwhile.
49. As a caregiver, I want to see the reviewed rule and calculated deadline before saving a batch, so that the result is understandable.
50. As a caregiver, I want unsupported preparation and storage combinations rejected, so that the app never guesses a deadline.
51. As a caregiver, I want each batch transition recorded with time and actor, so that corrections and outcomes remain auditable.
52. As a caregiver, I want to refrigerate, freeze, begin thawing, mark thawed, serve, return an untouched portion, discard, finish, or correct a batch where reviewed rules permit, so that inventory matches reality.
53. As a caregiver, I want correction to preserve the original event, so that audit history is not silently rewritten.
54. As a caregiver, I want portion counts prevented from becoming negative, so that concurrent taps or stale screens cannot create impossible inventory.
55. As a caregiver, I want refrigerator inventory ordered by earliest deadline, so that the most urgent food is visible first.
56. As a caregiver, I want each refrigerated batch to show remaining portions, relevant start time, exact discard deadline, status, and planned meals, so that I can act without recalculating.
57. As a caregiver, I want expired inventory separated and excluded from availability, so that it cannot be selected accidentally.
58. As a caregiver, I want to discard several expired items quickly, so that cleanup is not burdensome.
59. As a caregiver, I want freezer inventory to distinguish quality-by guidance from discard deadlines, so that the app does not overstate safety.
60. As a caregiver, I want thawing actions available only when reviewed thaw and post-thaw rules exist, so that frozen time is never treated as resetting an old refrigerator clock.
61. As a caregiver, I want food contacted by my baby or a used spoon excluded from returned inventory, so that contaminated leftovers are not offered again.
62. As a caregiver, I want untouched separately stored portions to remain available, so that safe food is not wasted unnecessarily.
63. As a caregiver, I want deadline calculations based on elapsed UTC hours and displayed in my selected time zone, so that daylight-saving transitions do not change the usable interval.
64. As a caregiver, I want a historical deadline to preserve the rule revision that produced it, so that later rule changes do not silently rewrite the past.

### Today and serving

65. As a caregiver, I want Today to show the current or next meal first, so that I can decide what to serve in under ten seconds.
66. As a caregiver, I want each component labeled ready, quick preparation, or thaw required, so that the recommendation is realistic.
67. As a caregiver, I want a plain-language reason for the recommendation, so that I can trust it without seeing internal scores.
68. As a caregiver, I want Today to prioritize valid inventory that expires soon, so that usable food is not wasted.
69. As a caregiver, I want Today never to offer expired, depleted, discarded, finished, excluded, reaction-blocked, unpublished, unavailable, or skill-incompatible food, so that convenience never overrides safety.
70. As a caregiver, I want to swap one component, the whole meal, or use a quick backup, so that I have a safe fallback.
71. As a caregiver, I want swaps to update Week, Kitchen, and grocery needs, so that the system remains coherent.
72. As a caregiver, I want use-soon refrigerator batches due within 24 hours ordered by deadline, so that I can act before they expire.
73. As a caregiver, I want relevant actions to use, freeze untouched portions, discard, or inspect the deadline, so that use-soon information is actionable.
74. As a caregiver, I want no more than three relevant near-term tasks, so that Today remains calm and focused.
75. As a caregiver, I want to dismiss a task without deleting the underlying meal requirement, so that hiding a reminder does not corrupt the plan.
76. As a caregiver, I want serving as planned to complete with one confirmation tap, so that logging is faster than ignoring the app.
77. As a caregiver, I want to record a changed serving or skipped meal, so that history can reflect reality without forcing detailed intake data.
78. As a caregiver, I want preference and an optional note recorded separately from inventory consumption, so that learning does not affect safety state accidentally.
79. As a caregiver, I want serving the final portion to succeed only once when two devices or taps race, so that inventory cannot become negative.
80. As a caregiver, I want a repeated network request to be idempotent, so that retrying does not consume another portion.
81. As a caregiver, I want the app to revalidate at serve time, so that a batch that expired while the screen was open is blocked safely.
82. As a caregiver, I want an actionable explanation when serving fails, so that stale or expired state can be recovered without manual database repair.

### Exposure, preference, and reactions

83. As a caregiver, I want to mark a food liked, neutral, disliked, tried, avoided, or not recorded, so that later plans can be practical.
84. As a caregiver, I want preference treated separately from medical safety, so that liking a food never proves it is safe.
85. As a caregiver, I want to report a reaction without the app interpreting symptoms, so that the food is blocked while the app stays outside clinical diagnosis.
86. As a caregiver, I want a reaction report to block future automatic suggestions immediately, so that stale recommendations cannot continue.
87. As a caregiver, I want reviewed direction to seek appropriate care after reporting a reaction, so that the app communicates its boundary safely.
88. As a caregiver, I want to resolve a reaction block only through an explicit action, so that ordinary preference editing cannot re-enable the food.
89. As a caregiver, I want free-text reaction or medical notes excluded from general analytics, so that sensitive details are not transmitted unnecessarily.

### Grocery

90. As a caregiver, I want a compact grocery list derived from the approved week, so that I can obtain what the plan actually requires.
91. As a caregiver, I want existing valid batches and available quick backups subtracted from grocery need, so that I do not buy food I already have.
92. As a caregiver, I want duplicate foods merged and grouped by practical store section, so that shopping is quick.
93. As a caregiver, I want to mark a food already available without creating a detailed pantry record, so that the list remains lightweight.
94. As a caregiver, I want to add, edit, check, and delete manual grocery items, so that the list can cover ordinary shopping.
95. As a caregiver, I want manual items preserved through plan edits, so that derived synchronization does not erase my own entries.
96. As a caregiver, I want plan-derived and manual items visually distinguished, so that I understand what will change automatically.

### Deterministic planning

97. As a caregiver, I want the app to generate a week from approved preparations, restrictions, skills, exposure history, new-food pace, valid inventory, quick backups, preparation preference, and meal count, so that the output fits my setup.
98. As a caregiver, I want every generated component to pass non-overridable hard constraints, so that scoring cannot purchase convenience with safety.
99. As a caregiver, I want existing refrigerated inventory used before it expires when feasible, so that the plan reduces waste.
100. As a caregiver, I want freezer inventory used when it reduces preparation or waste, so that frozen portions remain useful.
101. As a caregiver, I want a familiar component paired with a planned new food when possible, so that meals remain practical.
102. As a caregiver, I want the planner to rotate foods, produce, preparation methods, and textures without producing a parental score, so that variety remains supportive.
103. As a caregiver, I want ingredient and preparation reuse without identical repetitive plates, so that the week is efficient and usable.
104. As a caregiver, I want quick backups represented across the week, so that difficult days have a realistic fallback.
105. As a caregiver, I want generated choices explained in plain language, so that I can understand inventory, familiarity, and preparation tradeoffs.
106. As a caregiver, I want plan generation reproducible from the same inputs and rules, so that behavior can be tested and explained.
107. As a caregiver, I want stable results independent of database row order, so that identical inputs do not shuffle unexpectedly.
108. As a caregiver, I want the planner to allocate existing batches before proposing new preparation, so that inventory is used accurately.
109. As a caregiver, I want new batch portions split between refrigerator and freezer only when reviewed rules permit, so that later meals remain feasible.
110. As a caregiver, I want reviewed thaw tasks created for frozen portions, so that planned food becomes ready safely.
111. As a caregiver, I want the planner to refuse an infeasible week rather than relax a safety rule, so that failure is safer than plausible-looking output.
112. As a caregiver, I want infeasibility explained with actionable reason codes, so that I can change locks, preferences, or food availability.
113. As a caregiver, I want regeneration to preserve locked meals and components, so that automation respects my decisions.
114. As a caregiver, I want failed generation to avoid saving a partial plan, so that Week never contains a half-valid result.

### Accessibility, reliability, privacy, and learning

115. As a caregiver using one hand, I want primary controls to be large and reachable, so that I can operate the app while holding my baby.
116. As a keyboard or assistive-technology user, I want every action accessible without color-only status, so that the complete workflow is usable.
117. As a caregiver on a mobile connection, I want useful Today content visible quickly, so that the answer arrives at mealtime.
118. As a caregiver, I want optimistic actions used only when safe rollback is possible, so that failures do not leave misleading state.
119. As a caregiver, I want sensitive child information minimized and never exposed through public profiles, so that privacy risk remains narrow.
120. As a caregiver, I want to delete my account and household data before external beta, so that I retain control over collected data.
121. As a caregiver, I want dates and times expressed clearly in my locale and time zone, so that deadlines are not ambiguous.
122. As a product owner, I want privacy-conscious events for core workflow outcomes, so that usefulness can be evaluated without collecting sensitive notes.
123. As a product owner, I want failed planner events to use non-sensitive reason codes, so that reliability can be measured safely.
124. As a product owner, I want stale batch records to reach a served, frozen, finished, or discarded outcome when possible, so that inventory remains trustworthy.
125. As a product owner, I want dogfood feedback tied to real workflow friction, so that improvements solve observed problems rather than expand scope speculatively.
126. As a product owner, I want an emergency content retirement path, so that affected guidance can be removed without deleting its historical provenance.
127. As a product operator, I want backup, restore, environment promotion, and incident procedures, so that beta operation does not depend on manual improvisation.
128. As a beta reviewer, I want evidence that no known expired, restricted, unpublished, or skill-incompatible recommendation remains, so that the release gate is explicit.

## Implementation Decisions

### Product and release boundaries

- V1 is a standalone, mobile-first responsive web product for English-speaking U.S. caregivers.
- V1 exposes one caregiver account and one active baby in the interface while retaining a household boundary that permits later sharing.
- The primary navigation uses Today, Week, Kitchen, and Foods. Kitchen is the implementation name for the preparation, refrigerator, and freezer workflow described as "Prep & Store" in the source PRD.
- Components, not full recipes, are the central meal unit.
- Manual planning precedes automatic planning. The deterministic planner does not begin until a caregiver can operate a real week manually.
- The first engineering proof is one approved preparation completing the plan, batch, deadline, inventory, Today, serve, and expiration loop.
- Public-beta catalog expansion is gated on qualified safety/content review. Draft fixtures may exercise the pipeline but cannot be published as reviewed content.

### Application architecture

- Use the current stable Next.js App Router with strict TypeScript and a deliberately small styling system.
- Use Supabase/PostgreSQL for authentication, relational data, transactional commands, and row-level security.
- Manage database changes through committed migrations and deterministic seed/import inputs.
- Keep modules aligned to the product domains: catalog, safety, storage, planner, meals, grocery, and profiles.
- Keep UI rendering, application commands, domain calculations, and persistence concerns separate.
- Keep deadline calculation, eligibility, portion transitions, planner filtering, scoring, feasibility, and explanations pure and deterministic where they do not require transaction state.
- Use explicit clocks and explicit IANA time zones. Persist instants in UTC and render through the baby profile's selected time zone.
- Use typed unsupported and infeasible results rather than exceptions or guessed fallback values for expected domain failures.

### Identity, authorization, and privacy

- Use passwordless email authentication for private dogfood unless a later recorded decision changes it.
- Bootstrap the user profile and household through an idempotent transaction.
- Apply row-level security before any user-data workflow ships.
- Test access as anonymous, household A, household B, and privileged content roles.
- Keep birthdate and child profile information private.
- Never transmit exact birthdate, allergy details, reaction descriptions, or free-text medical notes to general-purpose analytics.
- Provide authenticated account and household deletion before external beta, with documented retention behavior for operational records.

### Reviewed content lifecycle

- Separate globally readable curated content from household-owned data.
- Model food, preparation, tags, source, content revision, and storage rule as structured records.
- Use draft, in-review, approved, and retired states.
- Make approved revisions append-only. A correction creates a new revision.
- Require source publisher, title, URL, source date, accessed/reviewed date, reviewer role, approval date, and next-review date where applicable.
- Prevent normal users from writing curated safety content.
- Exclude unapproved, retired, incomplete, and non-active content from selectable catalog queries.
- Treat an overdue record as an operational review condition governed by recorded policy; do not silently rewrite or delete historical outcomes.
- Validate seed/import data for referential integrity, required metadata, allergen metadata, skill eligibility, and storage support.
- Preserve the precise rule revision used by every historical deadline.

### Household and baby profile

- Model household, user profile, baby, observed feeding skills, restrictions, quick backups, and exposure history separately.
- Represent skill status explicitly, including unknown/not-sure, rather than treating absence as ability.
- Represent preference separately from safety status.
- Treat confirmed allergy, directed exclusion, temporary avoidance, and reaction-reported food as automatic-suggestion blocks.
- Application behavior limits V1 to one active baby while avoiding a schema design that prevents later multiple-baby support.

### Meal and plan model

- Represent a plan window, dated meal slots, and one to three preparation components per meal.
- Allow locks on meals and individual components.
- Represent planned, skipped, and completed lifecycle states explicitly.
- Revalidate eligibility when attaching or serving a component. Do not trust eligibility that was true only when the meal was first created.
- Model undo of a recent swap as a bounded compensating command rather than deletion of audit history.
- When a food becomes newly blocked, flag affected future meals for replacement and exclude them from actionable Today recommendations.

### Batch event ledger and inventory

- Store a batch identity and append-only batch events for prepared/opened, refrigerated, frozen, moved-to-refrigerator, thawed, served, returned-untouched, discarded, finished, and corrected.
- Treat the event ledger as authoritative.
- A cached remaining portion count may exist only as a transactionally maintained projection with reconciliation tests.
- Never delete prior events during correction.
- Record actor and UTC occurrence time for every event.
- Link deadline records to the governing content rule revision and the event that starts the clock.
- Enforce household/baby ownership and preparation validity at the persistence boundary.
- Prohibit negative remaining portions through transactional database enforcement.

### Storage rules and deadlines

- Distinguish discard-after, quality-by, and informational deadlines.
- Use the shorter approved endpoint when an authoritative reviewed source supplies a range and no more specific reviewed rule supersedes it.
- Compute deadlines using elapsed hours from the applicable UTC event.
- Never extend a deadline because the app was opened late, a meal was edited, or a rule changed later.
- Represent missing reviewed rules as unsupported.
- Require explicit reviewed thaw method, post-thaw clock start, post-thaw deadline, refreezing policy, and reheating/serving guidance where relevant.
- Do not treat freezing as resetting a previous refrigerator clock unless an approved rule explicitly defines the transition.
- Exclude saliva-exposed or served-dish leftovers from returnable inventory while preserving untouched separately stored portions.

### Atomic commands and concurrency

- Use one transactional serve command to validate caller household, baby, preparation approval, current restriction state, batch lifecycle, deadline, remaining quantity, and planned component before appending a serve event.
- Use a caller-stable idempotency key so a network retry cannot consume a second portion.
- Serialize or otherwise safely arbitrate concurrent attempts to consume the last portion.
- Evaluate expiration against trusted server/database time at command execution.
- Return stable, non-sensitive reason codes for expected failures and leave inventory unchanged on failure.
- Apply the same transaction and idempotency principles to other quantity-changing or high-risk lifecycle commands.

### Derived work and grocery state

- Derive Kitchen preparation needs from the committed plan and trace each need to supporting meals.
- Completing a derived task may seed batch creation without duplicating food selection.
- Dismissing a task hides the reminder instance but does not delete its underlying plan requirement.
- Derive grocery need from the committed plan after accounting for assigned valid inventory, available quick backups, and user-marked already-have state.
- Persist manual grocery items separately from derived grocery needs.
- Keep user checks and manual items stable when a plan is edited.

### Deterministic planner

- Snapshot all relevant planner inputs: eligible approved preparations, skills, restrictions, exposure state, valid inventory, quick backups, meal count, preparation preference, new-food pace, locks, rule revisions, time zone, and clock.
- Hard constraints are boolean disqualifiers and cannot be outweighed by scores.
- Use stable tie-breaking so output is independent of database row order.
- Apply soft goals only after hard filtering.
- Prioritize usable refrigerator inventory by valid deadline, then ready/frozen inventory, practical familiarity, preparation reuse, variety, and caregiver preferences.
- Generate plain-language explanations from reason codes rather than numeric scores or generative AI.
- Run a storage feasibility pass that allocates valid batches, calculates needed preparation, assigns only supported refrigerator/freezer transitions, and creates reviewed thaw tasks.
- Return either a fully feasible plan or an actionable typed failure. Do not persist partial unsafe output.
- Preserve locked meals and components during regeneration.
- Store enough planner input/rule version information or a reproducibility hash to explain generated output.

### Accessibility, performance, and operations

- Target WCAG 2.2 AA.
- Make all actions keyboard accessible and avoid color-only status.
- Use at least 44 by 44 CSS-pixel targets for primary mobile actions.
- Make Today's useful authenticated content visible within the PRD's 1.5-second target on a typical mobile connection.
- Use optimistic UI only where rollback cannot misrepresent safety or inventory.
- Keep primary failures recoverable through refresh/retry or an explicit correction flow rather than manual database repair.
- Add privacy-safe core workflow events and non-sensitive planner failure codes.
- Add emergency content retirement, backup/restore, environment promotion, and incident procedures before closed beta.

## Testing Decisions

### General philosophy

- Test external behavior and domain guarantees rather than implementation details.
- Prefer the highest credible seam for each behavior.
- Use three complementary test seams because no single seam can prove the safety boundary:
  1. Mobile browser flows for complete caregiver behavior.
  2. Pure domain tests for deterministic rule combinations and boundary conditions.
  3. Supabase integration tests for authorization, constraints, atomicity, and concurrency.
- Keep tests deterministic through controlled clocks, explicit time zones, stable fixtures, and repeatable database reset/import.
- Every defect in a lifecycle or safety rule receives a regression test at the narrowest seam that fully demonstrates the failure.
- The repository is greenfield, so there is no prior test implementation to preserve. The first scaffold establishes the conventions subsequent tickets must reuse.

### Mobile browser seam

- Use Playwright against narrow mobile viewports for onboarding, Foods browsing, manual meal placement, batch creation, Today, serving, expiration, reaction blocking, Week edits, Kitchen transitions, grocery synchronization, planner generation, and account deletion.
- The primary Milestone 2 flow is the first full E2E contract.
- Test visible unsupported, empty, stale, expired, excluded, error, rollback, and recovery states, not only happy paths.
- Verify keyboard navigation and accessible names for all primary actions.
- Retain traces, screenshots, and logs on failure without committing generated artifacts.

### Pure domain seam

- Test storage rule selection, conservative range endpoint, deadline calculation, rule precedence, unsupported states, and frozen/thawed transitions.
- Test UTC elapsed-hour behavior across spring-forward and fall-back daylight-saving boundaries.
- Test skill-to-preparation eligibility, restriction precedence, exposure/safety state separation, and reaction blocking.
- Test batch transition legality and portion projections with property-based or table-driven cases where useful.
- Test planner hard filtering, stable tie-breaking, scoring priorities, explanation reason codes, locked-item preservation, and feasibility.
- Use golden planner fixtures for normal, restricted, no-inventory, expiring-inventory, locked, and infeasible weeks.
- Prove with generative/property cases that a disqualified candidate cannot be reintroduced by scoring.

### Supabase integration seam

- Reset and seed the local database from committed inputs for migration and integration runs.
- Verify every household-owned table as anonymous, household A, household B, and service/content roles.
- Verify content draft, approval, publication, retirement, and historical revision behavior.
- Test household bootstrap retry and failure atomicity.
- Test manual meal placement bypass attempts for restricted, skill-incompatible, unpublished, and cross-household preparations.
- Test batch creation and every event transition at the persistence boundary.
- Test exact expiration at, immediately before, and immediately after the trusted command time.
- Test two concurrent attempts to consume the final portion and require exactly one success.
- Test repeated idempotency keys and require one resulting event.
- Test stale clients, newly blocked foods, depleted inventory, and transaction rollback.
- Reconcile cached inventory projection against the event ledger.

### Quality gates

- Every code change runs applicable lint, typecheck, unit/integration tests, production build, and diff whitespace checks.
- Every migration is rebuilt from a local database reset and receives RLS/constraint coverage.
- Every safety-content change runs schema/import validation and source/review metadata checks.
- Every user-visible workflow change runs its focused browser flow.
- The eventual repository-level `verify` command becomes the single complete gate.
- No command is reported passing unless it was actually executed successfully.

## Out of Scope

- Diagnosis, treatment, growth assessment, calorie targets, therapeutic nutrition, or clinical records.
- Interpretation of allergic reactions, choking events, swallowing symptoms, or emergency severity.
- Automatic allergen-introduction or allergen-maintenance protocols.
- AI-generated safety content, storage rules, meal safety validation, or V1 meal planning.
- A general recipe platform, user-created recipes, or family meal adaptation.
- Macro/micronutrient accounting or plate-completion scoring.
- Breast milk, formula, bottle, sleep, diaper, medication, growth, or milestone tracking.
- Full pantry inventory, barcode scanning, receipt scanning, photo recognition, or retailer checkout.
- Community content, ratings, comments, social feeds, or creator profiles.
- Native iOS or Android applications.
- Push notifications in private dogfood.
- Multiple active babies, caregiver invitations, or shared multi-caregiver editing in the V1 interface.
- Paid subscriptions, billing, or a finalized business model.
- Final product naming and brand identity.
- Post-15-month toddler expansion.
- International safety guidance, localization, or non-U.S. content policy.
- A large catalog before the first-ten-food review pipeline and core loop prove reliable.
- Polished automatic planning before the manual week and inventory loop survive dogfood.

## Further Notes

- The source PRD remains the detailed product-definition reference. This specification converts it into an agent-consumable delivery contract and resolves the implementation sequence.
- The repository is greenfield. At specification time it contains repository guidance, workflow configuration, and an execution plan but no Git repository, application, package manifest, schema, or tests.
- Safety-content review is a parallel human workstream and a release gate. Engineering may build the content lifecycle with clearly marked drafts, but no agent may manufacture reviewed production values.
- The initial ten foods are egg, chicken, black beans, plain yogurt, oatmeal, sweet potato, broccoli, avocado, banana, and pear. Final preparation and safety records still require qualified review.
- The preferred first reviewed preparation should exercise a short refrigerator deadline, batch portioning, Today selection, and expiration blocking. It should be chosen from records actually approved by the reviewer rather than selected by an agent from general knowledge.
- Local issues use tracer-bullet vertical slices and declare blocking edges. Each ticket must fit one fresh implementation context, remain independently demoable or verifiable, update its issue with evidence, and finish with the repository-defined quality gate.
- Product implementation must not begin with planner scoring. The manual prepare-store-serve-expire loop is the first proof.
