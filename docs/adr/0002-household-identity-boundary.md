# ADR 0002: Household identity boundary

- Status: Accepted
- Date: 2026-07-27
- Scope: Ticket 02 authenticated baby profile

## Context

Project Little Plate needs passwordless caregiver authentication before it can
store private child data. A repeated auth callback must not create duplicate
accounts, setup failures must not leave partial baby records, and every access
path must preserve the household boundary.

## Decision

- Use Supabase passwordless email authentication with the SSR PKCE flow.
- Represent ownership through `households` and `user_profiles`; the V1 UI has
  one caregiver and one active baby, while the relational boundary can support
  later household sharing.
- Bootstrap a caregiver through an authenticated, idempotent database function.
  Serialize retries per auth user and create the household and user profile in
  one transaction.
- Complete baby setup through a second authenticated database function. Validate
  IANA time zones, feeding style, and one to three distinct meal slots at this
  boundary, and make retries update the existing active baby.
- Expose household-owned tables as authenticated read models only. Keep all
  writes behind narrowly granted functions, enable row-level security on every
  table, and grant no anonymous table or function access.
- Treat nickname as optional and keep birth date private. Birthday does not
  establish preparation eligibility; later reviewed skill data will do that.

## Consequences

- Callback retries and setup retries are deterministic and cannot create a
  second household, profile, or active baby.
- A failed setup statement rolls back without a partial baby; an already
  bootstrapped household and user profile remain a valid incomplete-onboarding
  state rather than orphaned data.
- Future profile edits should reuse the transactional command instead of adding
  direct table-write grants.
- Integration tests require a live local Supabase stack because mocked clients
  cannot prove grants, RLS policies, rollback, or authenticated RPC behavior.

## Safety boundary

This decision stores caregiver-entered profile context only. It does not publish
feeding, preparation, allergen, storage, or medical guidance, and no eligibility
decision is derived from birth date.

## Reversal conditions

Revisit this boundary before adding caregiver invitations, multiple active
babies, or a write path that cannot be expressed safely through a transactional
database command. Any replacement must preserve retry idempotency, failure
atomicity, private child data, and household isolation.
