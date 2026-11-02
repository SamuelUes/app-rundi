-- ============================================================================
-- 0010_driver_public_backfill.sql — Backfill de REALTIME_driver_public_profiles.
-- Un evento outbox 'driver.updated' por conductor: el consumer proyecta el
-- perfil público (displayName/photoUrl/averageRating/totalRides) con la misma
-- whitelist de emitDriverEvent. version=0 → aplica si el doc no tiene una
-- appliedVersion mayor; idempotente ante re-ejecución.
-- ============================================================================

BEGIN;

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, schema_version, status)
SELECT 'driver.updated', 'driver', d.user_id,
       jsonb_strip_nulls(jsonb_build_object(
         'userId',               d.user_id,
         'accountStatus',        d.account_status::text,
         'designatedRoleStatus', d.designated_role_status::text,
         'totalRides',           d.total_rides,
         'averageRating',        d.average_rating,
         'displayName',          u.name,
         'photoUrl',             d.profile_photo,
         'department',           d.department,
         'municipality',         d.municipality,
         'version',              0
       )),
       1, 'pending'
FROM public.drivers d
JOIN public.users u ON u.id = d.user_id
WHERE d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.outbox_events e
    WHERE e.aggregate_type = 'driver' AND e.aggregate_id = d.user_id
      AND e.status = 'pending'
  );

COMMIT;
