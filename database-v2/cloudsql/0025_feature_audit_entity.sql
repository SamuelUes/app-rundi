BEGIN;
ALTER TYPE public.audit_entity_type ADD VALUE IF NOT EXISTS 'feature';
COMMIT;
