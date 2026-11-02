#!/usr/bin/env bash
# database-v2/deploy.sh — Cloud SQL PG17 + migraciones v2.
#
#   ./deploy.sh                    # todo el flujo
#   MIGRATIONS_ONLY=1 ./deploy.sh  # solo aplicar migraciones (instancia existe)
#
# Requiere: gcloud (auth + proyecto), cloud-sql-proxy, psql.
#   brew install cloud-sql-proxy  |  gcloud components install cloud-sql-proxy
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-${PROJECT:-rundi-dev-2}}"
REGION="${REGION:-us-east1}"
INSTANCE="${INSTANCE:-rundi-db-sql}"
DB_NAME="${DB_NAME:-rundi}"
APP_USER="${APP_USER:-rundi_app}"
APP_PASSWORD="${APP_PASSWORD:?export APP_PASSWORD (secreto — no en el repo)}"
TIER="${TIER:-db-custom-1-3840}"
ROOT_PASSWORD="${ROOT_PASSWORD:?export ROOT_PASSWORD (admin postgres — Secret Manager)}"
DIR="$(cd "$(dirname "$0")" && pwd)"

gcloud config set project "$PROJECT" >/dev/null

if [[ "${MIGRATIONS_ONLY:-0}" != "1" ]]; then
  echo "== APIs =="
  gcloud services enable sqladmin.googleapis.com --quiet

  if ! gcloud sql instances describe "$INSTANCE" >/dev/null 2>&1; then
    echo "== Creando instancia $INSTANCE (PG17, $TIER) =="
    gcloud sql instances create "$INSTANCE" \
      --database-version=POSTGRES_17 \
      --tier="$TIER" --region="$REGION" \
      --root-password="$ROOT_PASSWORD" \
      --storage-type=SSD --storage-size=20GB --storage-auto-increase \
      --backup-start-time=03:00 --availability-type=ZONAL \
      --edition=ENTERPRISE --assign-ip
  else
    echo "Instancia $INSTANCE ya existe — skip"
  fi

  gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" 2>/dev/null || true
  # Sincroniza password de postgres (owner de migraciones) — la instancia ya
  # existía o el password pudo quedar viejo. Sin esto: auth failed en psql.
  gcloud sql users set-password postgres --instance="$INSTANCE" \
    --password="$ROOT_PASSWORD"
  gcloud sql users create "$APP_USER" --instance="$INSTANCE" \
    --password="$APP_PASSWORD" 2>/dev/null \
    || gcloud sql users set-password "$APP_USER" --instance="$INSTANCE" \
      --password="$APP_PASSWORD"
fi

command -v psql >/dev/null || {
  echo "ERROR: psql no instalado → brew install libpq && brew link --force libpq" >&2
  exit 1
}

if gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "== Proxy (ADC) + migraciones como postgres =="
  cloud-sql-proxy "$PROJECT:$REGION:$INSTANCE" --port 5433 &
  PROXY_PID=$!
  trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
  sleep 4
  CONN="host=127.0.0.1 port=5433 sslmode=disable dbname=$DB_NAME user=postgres"
else
  echo "== Sin ADC — conexión directa a IP pública =="
  IP=$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" \
       --format='value(ipAddresses[0].ipAddress)')
  echo "  host=$IP (requiere tu IP en authorized networks — si falla:"
  echo "  gcloud sql instances patch $INSTANCE --project=$PROJECT --authorized-networks=\$(curl -s ifconfig.me))"
  CONN="host=$IP port=5432 sslmode=disable dbname=$DB_NAME user=postgres"
fi

for f in "$DIR"/cloudsql/[0-9]*.sql; do
  base="$(basename "$f")"
  # Reanudar: FROM=0005 ./deploy.sh salta archivos previos
  [[ -n "${FROM:-}" && "$base" < "$FROM" ]] && { echo "--- skip $base"; continue; }
  echo "--- $base"
  PGPASSWORD="$ROOT_PASSWORD" psql "$CONN" -v ON_ERROR_STOP=1 -f "$f"
done

echo "== Listo =="
echo "INSTANCE_CONNECTION_NAME=$PROJECT:$REGION:$INSTANCE"
