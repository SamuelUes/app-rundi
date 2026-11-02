#!/usr/bin/env bash
# database-v2/cloudsql/deploy.sh — aplica migraciones + seeds a Cloud SQL PG17.
#
# Uso (auto-contenido: levanta el proxy si hace falta):
#   export PGPASSWORD='tu_password_postgres'   # o ROOT_PASSWORD (mismo var que ../deploy.sh)
#   ./deploy.sh                                # proxy en :5433 + migraciones
#   CONN="host=... user=postgres dbname=rundi" PGPASSWORD=... ./deploy.sh
#
# Env vars:
#   CONN           — conn string psql completa. Si no se da, usa proxy en :5433
#                    (lo levanta solo vía cloud-sql-proxy + gcloud ADC).
#   GCP_PROJECT_ID / PROJECT / REGION / INSTANCE — para el proxy
#                    (defaults: rundi-dev-2 / us-east1 / rundi-db-sql)
#   DB_NAME        — default rundi
#   PGPASSWORD     — password del usuario postgres/owner (OBLIGATORIO;
#                    acepta ROOT_PASSWORD como fallback). Comillas si tiene #
#   FROM           — reanudar desde un archivo (ej. FROM=0005 ./deploy.sh)
#
# IMPORTANTE: correr como OWNER del esquema (postgres/cloudsqlsuperuser).
# 0009 aborta con error claro si current_user no es dueño de las tablas.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DB_NAME="${DB_NAME:-rundi}"
PROJECT="${GCP_PROJECT_ID:-${PROJECT:-rundi-dev-2}}"
REGION="${REGION:-us-east1}"
INSTANCE="${INSTANCE:-rundi-db-sql}"
PROXY_PORT="${PROXY_PORT:-5433}"

: "${PGPASSWORD:=${ROOT_PASSWORD:-}}"
: "${PGPASSWORD:?export PGPASSWORD='...' (o ROOT_PASSWORD — password del owner; comillas si tiene #)}"

command -v psql >/dev/null || {
  echo "ERROR: psql no instalado → brew install libpq && brew link --force libpq" >&2
  exit 1
}

if [[ -z "${CONN:-}" ]]; then
  # ¿ya hay algo escuchando en el puerto del proxy?
  if (echo >"/dev/tcp/127.0.0.1/$PROXY_PORT") 2>/dev/null; then
    echo "== Proxy ya corriendo en 127.0.0.1:$PROXY_PORT =="
  else
    command -v cloud-sql-proxy >/dev/null || {
      echo "ERROR: cloud-sql-proxy no instalado → brew install cloud-sql-proxy" >&2
      echo "  (o pasa CONN='host=IP port=5432 ...' para conexión directa)" >&2
      exit 1
    }
    echo "== Levantando proxy $PROJECT:$REGION:$INSTANCE → :$PROXY_PORT =="
    cloud-sql-proxy "$PROJECT:$REGION:$INSTANCE" --port "$PROXY_PORT" &
    PROXY_PID=$!
    trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
    sleep 4
  fi
  CONN="host=127.0.0.1 port=$PROXY_PORT sslmode=disable dbname=$DB_NAME user=postgres"
fi

echo "== Aplicando migraciones a $DB_NAME =="
for f in "$DIR"/[0-9]*.sql; do
  base="$(basename "$f")"
  [[ -n "${FROM:-}" && "$base" < "$FROM" ]] && { echo "--- skip $base"; continue; }
  echo "--- $base"
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$f"
done

echo "== Listo =="
echo "Verificar: psql \"\$CONN\" -c 'SELECT count(*) FROM public.services; SELECT count(*) FROM public.outbox_events WHERE status='"'"'pending'"'"';'"
