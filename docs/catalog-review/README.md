# Qualified catalog intake

This packet is for a qualified reviewer and the recorded release owner. It is
not a clinical worksheet, a feeding assessment, or a source of preparation,
allergen, choking, medical, or storage advice.

The production catalog remains empty until every record is supplied from
reviewed, source-backed material and the release owner records the required
authority evidence. Do not copy synthetic test fixtures into this packet.

## What to provide

Use `catalog-package.template.json` as the machine-shaped outline. Replace
every `REQUIRED_REVIEWER_INPUT` marker with reviewer-supplied data only after
the applicable review is complete. The completed file must still pass the
existing `import_catalog_fixture` boundary; a reviewer completing a field does
not by itself authorize publication.

The package must include:

- structured sources with publisher, title, URL, source date, and access date;
- controlled skill and allergen tags;
- foods and reusable preparations;
- revisions with source, reviewer role, review date, approval date, next-review
  date, preparation-time band, explicit visual requirement, and reviewed
  preparation content;
- explicit storage support or unsupported state for each reviewed revision;
- visual records when required, including rights basis, rights holder, alt
  text, and license fields when licensed; and
- no retirement records unless the release owner has an explicit retirement
  decision and evidence.

## Authority and privacy

Complete `reviewer-authority.template.md` with role mappings and evidence
locations. Record references to approval documents or systems, not private
reviewer contact details. Do not put exact birthdates, allergy details,
reaction descriptions, medical notes, caregiver notes, or credentials in this
repository.

## Release handoff

1. The release owner records the reviewer authority map and overdue-content
   policy.
2. Qualified reviewers supply or approve the structured records.
3. Codex validates the completed package from a clean local database and
   records rejected records and reasons.
4. Run `pnpm catalog:check-sources` and record the source report.
5. Run `get_catalog_release_report` as the service role and record the
   structural candidate count, overdue IDs, visual declarations, and final
   launch-ready count.
6. Exercise representative Foods search, filters, detail provenance, visuals,
   unsupported storage, and mobile layout.
7. Run `pnpm verify` and update Ticket 17 with evidence locations.

Until those steps are complete, the package is intake material only and must
not be copied into `supabase/seed.sql` or described as launch-ready content.
