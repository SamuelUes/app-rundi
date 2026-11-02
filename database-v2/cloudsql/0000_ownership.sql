-- ============================================
-- 0000_ownership.sql — pre-flight de ownership.
-- Las migraciones DDL (ALTER TYPE/TABLE) exigen ser owner del objeto o
-- MIEMBRO del rol owner. En Cloud SQL corre como postgres
-- (miembro de cloudsqlsuperuser).
--
-- Este archivo, por cada owner distinto a current_user en public:
--   1) si ya es miembro → ok
--   2) intenta GRANT owner → current_user
--   3) si falla por membresía circular (owner es miembro de current_user,
--      p.ej. rundi_app miembro de postgres) → REVOKE current_user FROM owner
--      (además corrige el exceso de privilegios) y reintenta el GRANT
--   4) fallback: ALTER ... OWNER TO current_user objeto por objeto
--   5) aborta con diagnóstico claro si quedan objetos ajenos.
-- Idempotente: si todo ya es accesible, es no-op.
-- ============================================
DO $$
DECLARE
  me        name := current_user;
  o         record;
  obj       record;
  missing   text := '';
  owners_q  text := $q$
    SELECT DISTINCT own AS owner FROM (
      SELECT c.relowner::regrole::text AS own
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r','p','S','v','m')
      UNION
      SELECT t.typowner::regrole::text
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typrelid = 0      -- excluye row types de tablas
         AND t.typelem = 0       -- excluye array types _t[]
      UNION
      SELECT p.proowner::regrole::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
    ) s
    WHERE own <> current_user
  $q$;
BEGIN
  FOR o IN EXECUTE owners_q
  LOOP
    IF pg_has_role(me, o.owner, 'member') THEN
      RAISE NOTICE 'owner %: % ya es miembro — ok', o.owner, me;
      CONTINUE;
    END IF;

    -- intento 1: membresía del rol owner (cubre TODOS los ALTER futuros)
    BEGIN
      EXECUTE format('GRANT %I TO %I', o.owner, me);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'GRANT % → % falló (%)', o.owner, me, SQLERRM;
      -- ¿circular? owner es miembro de current_user → revocar y reintentar
      IF pg_has_role(o.owner, me, 'member') THEN
        BEGIN
          EXECUTE format('REVOKE %I FROM %I', me, o.owner);
          RAISE NOTICE 'REVOKE % FROM % ok (le quita privilegios indebidos al rol)', me, o.owner;
          EXECUTE format('GRANT %I TO %I', o.owner, me);
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'REVOKE+GRANT circular falló (%)', SQLERRM;
        END;
      END IF;
    END;

    IF NOT pg_has_role(me, o.owner, 'member') THEN
      -- intento 2: transferir ownership objeto por objeto
      FOR obj IN
        SELECT 'TABLE' AS kind, format('%I.%I', n.nspname, c.relname) AS qname
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
           AND c.relowner::regrole::text = o.owner
        UNION ALL
        SELECT 'SEQUENCE', format('%I.%I', n.nspname, c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'S'
           AND c.relowner::regrole::text = o.owner
        UNION ALL
        SELECT 'TYPE', format('%I.%I', n.nspname, t.typname)
          FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public' AND t.typrelid = 0 AND t.typelem = 0
           AND t.typowner::regrole::text = o.owner
        UNION ALL
        SELECT 'FUNCTION', p.oid::regprocedure::text
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proowner::regrole::text = o.owner
      LOOP
        BEGIN
          EXECUTE format('ALTER %s %s OWNER TO %I', obj.kind, obj.qname, me);
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'ALTER % % OWNER: %', obj.kind, obj.qname, SQLERRM;
        END;
      END LOOP;
    END IF;
  END LOOP;

  -- verificación final: ¿quedan objetos que no puedo alterar?
  EXECUTE $v$
    SELECT string_agg(DISTINCT own, ', ' ORDER BY own) FROM (
      SELECT c.relowner::regrole::text AS own
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m')
      UNION
      SELECT t.typowner::regrole::text
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typrelid = 0 AND t.typelem = 0
      UNION
      SELECT p.proowner::regrole::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
    ) s
    WHERE own <> current_user
      AND NOT pg_has_role(current_user, own, 'member')
  $v$ INTO missing;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION E'0000: objetos en public son de otros roles sin membresía adoptable.\n  current_user = %\n  owners ajenos = %\n  Fix: corre las migraciones como uno de esos roles\n    CONN="host=127.0.0.1 port=5433 dbname=rundi user=<owner> sslmode=disable" ./deploy.sh\n  o como superuser: GRANT <owner> TO %;\n  (si el owner es cloudsqladmin: objetos creados por consola/import — dropea/recréalos como postgres)', me, missing, me;
  END IF;
END $$;
