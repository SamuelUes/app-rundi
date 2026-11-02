#!/usr/bin/env bash
# database-v2/storage/deploy.sh — reglas de Cloud Storage (bucket default).
#
#   ./deploy.sh                  # proyecto por env o default
#   GCP_PROJECT_ID=x ./deploy.sh
#
# Requiere: firebase-tools + auth (firebase login).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${GCP_PROJECT_ID:-${FIREBASE_PROJECT_ID:-rundi-dev-2}}"

command -v firebase >/dev/null || {
  echo "ERROR: firebase-tools no instalado → npm i -g firebase-tools" >&2
  exit 1
}

echo "== Storage rules → $PROJECT =="
firebase deploy \
  --project "$PROJECT" \
  --only storage \
  --config "$DIR/../firebase.json"

echo "== Listo =="
