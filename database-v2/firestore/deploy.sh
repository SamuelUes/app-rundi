#!/usr/bin/env bash
# database-v2/firestore/deploy.sh — reglas + índices + docs semilla.
#
#   ./deploy.sh                  # proyecto/db por env o defaults
#   GCP_PROJECT_ID=x FIRESTORE_DATABASE_ID=y ./deploy.sh
#   SEED=0 ./deploy.sh           # solo rules+indexes (sin semilla)
#
# Requiere: firebase-tools + auth (firebase login) para rules/indexes, y
# Application Default Credentials (gcloud auth application-default login)
# o GOOGLE_APPLICATION_CREDENTIALS para el seed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${GCP_PROJECT_ID:-${FIREBASE_PROJECT_ID:-rundi-dev-2}}"

command -v firebase >/dev/null || {
  echo "ERROR: firebase-tools no instalado → npm i -g firebase-tools" >&2
  exit 1
}

echo "== Rules + indexes → $PROJECT =="
firebase deploy \
  --project "$PROJECT" \
  --only firestore:rules,firestore:indexes \
  --config "$DIR/../firebase.json"

if [[ "${SEED:-1}" == "1" ]]; then
  if [[ ! -d "$DIR/node_modules/firebase-admin" ]]; then
    echo "== npm install (firebase-admin para seed.mjs) =="
    (cd "$DIR" && npm install --no-fund --no-audit --silent)
  fi
  echo "== Seed docs =="
  (cd "$DIR" && node seed.mjs)
fi

echo "== Listo =="
