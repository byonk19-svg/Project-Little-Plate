# 22 - Explain local passwordless email delivery

**What to build:** Tell local developers where Supabase captured the one-time
sign-in message without changing production authentication behavior.

**Blocked by:** 19 - Add account session controls.

**Status:** ready-for-agent

- [ ] Local setup supports an optional `NEXT_PUBLIC_LOCAL_MAIL_URL`.
- [ ] A configured value must be an absolute loopback HTTP(S) URL.
- [ ] After a successful local sign-in request, Login provides an `Open local
  inbox` link and explains that the message was captured locally.
- [ ] When the value is absent, production sign-in copy remains unchanged.
- [ ] The app never guesses a Mailpit address or links to an arbitrary external
  host.
- [ ] No email address, auth token, or one-time link is copied into application
  logs, analytics, or UI configuration.
- [ ] `.env.example` and local setup documentation describe the optional value.
- [ ] Unit and mobile-browser coverage prove configured, absent, and invalid
  cases.
- [ ] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes local developer guidance only. It does not change
authentication, production email delivery, or any feeding and safety content.

## Decisions

- Require explicit configuration and validate the destination as loopback.
- Keep the existing passwordless PKCE flow unchanged.

## Evidence

Pending implementation.
