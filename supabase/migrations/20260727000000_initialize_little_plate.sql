-- Ticket 01 establishes a deterministic migration path without introducing
-- product-domain objects ahead of their vertical slices. Supabase records this
-- migration in its migration history when the local database is rebuilt.
select 'ticket-01-baseline' as migration_marker;
