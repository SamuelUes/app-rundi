-- Keep at most one active quick-login credential per user and device.
BEGIN;

WITH ranked AS (
  SELECT device_id, user_id,
    row_number() OVER (PARTITION BY device_id ORDER BY last_seen_at DESC, user_id) AS device_rank,
    row_number() OVER (PARTITION BY user_id ORDER BY last_seen_at DESC, device_id) AS user_rank
  FROM public.user_devices
  WHERE revoked_at IS NULL
)
UPDATE public.user_devices AS d
SET revoked_at = NOW()
FROM ranked AS r
WHERE d.device_id = r.device_id AND d.user_id = r.user_id
  AND (r.device_rank > 1 OR r.user_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS user_devices_one_active_per_device
  ON public.user_devices (device_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_one_active_per_user
  ON public.user_devices (user_id) WHERE revoked_at IS NULL;

COMMIT;
