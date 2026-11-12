-- Schedule a fresh driver projection for existing accounts. The consumer
-- resolves the current capabilities from SQL when it processes each event.
INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'driver.updated', 'driver', d.user_id,
       jsonb_strip_nulls(jsonb_build_object(
         'userId', d.user_id,
         'accountStatus', d.account_status::text,
         'totalRides', d.total_rides,
         'averageRating', d.average_rating,
         'displayName', u.name,
         'photoUrl', d.profile_photo,
         'department', d.department,
         'municipality', d.municipality,
         'version', extract(epoch FROM clock_timestamp()) * 1000
       ))
FROM public.drivers d
LEFT JOIN public.users u ON u.id = d.user_id
WHERE d.deleted_at IS NULL;
