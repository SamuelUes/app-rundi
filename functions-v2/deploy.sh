#!/usr/bin/env bash
# functions-v2/deploy.sh — despliegue API (Cloud Run) + jobs (consumer/scheduler).
#
#   ./deploy.sh                 # todo el flujo (secrets se siembran desde .env)
#   ./deploy.sh api             # solo API
#   ./deploy.sh jobs            # solo jobs + triggers
#
# El .env de este directorio es la fuente: cada deploy carga sus variables,
# crea/actualiza las versiones en Secret Manager y solo referencia los
# secretos que tienen valor (LiveKit/PuntoExpress opcionales → skip si vacío).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Carga .env (override por vars ya exportadas en la shell) -----------------
if [[ -f "$DIR/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "$DIR/.env"; set +a
fi

PROJECT="${GCP_PROJECT_ID:-${PROJECT:-rundi-dev-2}}"
REGION="${REGION:-us-east1}"
INSTANCE="${INSTANCE:-rundi-db-sql}"
CONN="$PROJECT:$REGION:$INSTANCE"
REPO="rundi-v2"
API_SA="rundi-api@$PROJECT.iam.gserviceaccount.com"
WORKER_SA="rundi-worker@$PROJECT.iam.gserviceaccount.com"
SCHED_SA="rundi-scheduler@$PROJECT.iam.gserviceaccount.com"

build() { # $1 = api|consumer|scheduler
  gcloud builds submit --config cloudbuild.yaml \
    --substitutions "_SERVICE=$1,_REGION=$REGION" "$DIR"
}

# ensure_secret <env_var> <secret_name>: crea el secreto si no existe y
# añade una versión con el valor actual del .env (solo si no está vacío).
SECRETS_FLAGS=()
ensure_secret() {
  local var="$1" name="$2"
  local val="${!var:-}"
  [[ -z "$val" ]] && { echo "  $var vacío — $name skip"; return 0; }
  gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1 \
    || gcloud secrets create "$name" --project="$PROJECT" \
         --replication-policy=automatic --quiet
  echo "$val" | gcloud secrets versions add "$name" --project="$PROJECT" \
    --data-file=- --quiet
  SECRETS_FLAGS+=("$var=$name:latest")
  echo "  $name actualizado desde $var"
}

seed_secrets() {
  SECRETS_FLAGS=()
  ensure_secret DB_PASSWORD db-password
  ensure_secret RIDE_SHARE_SECRET ride-share-secret
  ensure_secret LIVEKIT_API_SECRET livekit-api-secret
  ensure_secret LIVEKIT_API_KEY livekit-api-key
  ensure_secret PUNTOEXPRESS_WEBHOOK_TOKEN puntoexpress-token
}

secrets_arg() {
  ((${#SECRETS_FLAGS[@]})) && printf -- "--set-secrets=%s" "$(IFS=,; echo "${SECRETS_FLAGS[*]}")"
}

do_setup() {
  gcloud config set project "$PROJECT" >/dev/null
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com \
    cloudscheduler.googleapis.com cloudtasks.googleapis.com --quiet
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location="$REGION" 2>/dev/null || true

  for sa in rundi-api rundi-worker rundi-scheduler; do
    gcloud iam service-accounts create "$sa" \
      --display-name="rundi-v2 $sa" 2>/dev/null || true
  done
  for r in roles/cloudsql.client roles/datastore.user \
           roles/secretmanager.secretAccessor roles/firebase.admin; do
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$API_SA" --role="$r" --quiet >/dev/null
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$WORKER_SA" --role="$r" --quiet >/dev/null
  done

  # Cloud Tasks: cola + permiso del agente de Tasks para firmar OIDC con el SA
  TASKS_SA="${CLOUD_TASKS_SA_EMAIL:-$API_SA}"
  TASKS_QUEUE="${CLOUD_TASKS_QUEUE:-rundi-tasks}"
  gcloud tasks queues create "$TASKS_QUEUE" --location="$REGION" 2>/dev/null || true
  gcloud tasks queues add-iam-policy-binding "$TASKS_QUEUE" --location="$REGION" \
    --member="serviceAccount:$API_SA" --role=roles/cloudtasks.enqueuer --quiet >/dev/null
  gcloud iam service-accounts add-iam-policy-binding "$TASKS_SA" \
    --member="serviceAccount:$API_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
  PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
  gcloud iam service-accounts add-iam-policy-binding "$TASKS_SA" \
    --member="serviceAccount:service-$PNUM@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
    --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null 2>&1 || true
  # Scheduler: el agente de Cloud Scheduler firma el OIDC con SCHED_SA — sin
  # este binding el tick sale sin token y el run API responde 401.
  gcloud iam service-accounts add-iam-policy-binding "$SCHED_SA" \
    --member="serviceAccount:service-$PNUM@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
    --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null 2>&1 || true
  echo "== Secretos desde .env ==" && seed_secrets
}

do_api() {
  seed_secrets
  build api
  gcloud run deploy rundi-api \
    --image "$REGION-docker.pkg.dev/$PROJECT/$REPO/api:latest" \
    --region="$REGION" --service-account="$API_SA" \
    --add-cloudsql-instances="$CONN" \
    --allow-unauthenticated \
    --min-instances=0 --max-instances=10 --concurrency=80 \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT,REGION=$REGION,INSTANCE_CONNECTION_NAME=$CONN,DB_NAME=${DB_NAME:-rundi},DB_USER=${DB_USER:-rundi_app},FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID:-},APP_CHECK_ENFORCE=${APP_CHECK_ENFORCE:-monitor},LOG_LEVEL=${LOG_LEVEL:-info},FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET:-},CLOUD_TASKS_QUEUE=${CLOUD_TASKS_QUEUE:-rundi-tasks},CLOUD_TASKS_SA_EMAIL=${CLOUD_TASKS_SA_EMAIL:-$API_SA},CLOUD_TASKS_OIDC_AUDIENCE=${CLOUD_TASKS_OIDC_AUDIENCE:-}" \
    $(secrets_arg)
  API_URL=$(gcloud run services describe rundi-api --region="$REGION" \
    --format='value(status.url)')
  # API_BASE_URL se auto-inyecta con la URL final (audience OIDC + task targets)
  if [[ -z "${API_BASE_URL:-}" && -n "$API_URL" ]]; then
    gcloud run services update rundi-api --region="$REGION" \
      --update-env-vars="API_BASE_URL=$API_URL" --quiet >/dev/null
  fi
  echo "API_URL=$API_URL"
}

do_jobs() {
  seed_secrets
  build consumer; build scheduler
  for j in consumer scheduler; do
    gcloud run jobs deploy "rundi-$j" \
      --image "$REGION-docker.pkg.dev/$PROJECT/$REPO/$j:latest" \
      --region="$REGION" --service-account="$WORKER_SA" \
      --set-cloudsql-instances="$CONN" --max-retries=1 \
      --set-env-vars="GCP_PROJECT_ID=$PROJECT,REGION=$REGION,INSTANCE_CONNECTION_NAME=$CONN,DB_NAME=${DB_NAME:-rundi},DB_USER=${DB_USER:-rundi_app},LOG_LEVEL=${LOG_LEVEL:-info}" \
      $(secrets_arg)
  done
  # Job dedicado a viajes programados: misma imagen del scheduler, solo el
  # sweep de promoción (gracia de 2 min — el tick general de 5 min no basta).
  gcloud run jobs deploy "rundi-programmed" \
    --image "$REGION-docker.pkg.dev/$PROJECT/$REPO/scheduler:latest" \
    --region="$REGION" --service-account="$WORKER_SA" \
    --set-cloudsql-instances="$CONN" --max-retries=1 \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT,REGION=$REGION,INSTANCE_CONNECTION_NAME=$CONN,DB_NAME=${DB_NAME:-rundi},DB_USER=${DB_USER:-rundi_app},LOG_LEVEL=${LOG_LEVEL:-info},SCHEDULER_ONLY=programmed" \
    $(secrets_arg)
  gcloud run jobs add-iam-policy-binding rundi-consumer \
    --member="serviceAccount:${CLOUD_TASKS_SA_EMAIL:-$API_SA}" \
    --role=roles/run.invoker --region="$REGION" --quiet >/dev/null
  for j in consumer scheduler programmed; do
    gcloud run jobs add-iam-policy-binding "rundi-$j" \
      --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker \
      --region="$REGION" --quiet >/dev/null
  done
  # OAuth (no OIDC): el target es la API de Google run.googleapis.com — para
  # endpoints Google se usa OAuth token con scope cloud-platform; OIDC con
  # audience custom es para invocar servicios propios (Cloud Run services).
  gcloud scheduler jobs create http rundi-consumer-tick \
    --location="$REGION" --schedule="* * * * *" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-consumer:run" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" 2>/dev/null \
    || gcloud scheduler jobs update http rundi-consumer-tick \
      --location="$REGION" --schedule="* * * * *" \
      --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-consumer:run" \
      --http-method=POST --oauth-service-account-email="$SCHED_SA"
  gcloud scheduler jobs create http rundi-scheduler-tick \
    --location="$REGION" --schedule="*/5 * * * *" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-scheduler:run" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" 2>/dev/null \
    || gcloud scheduler jobs update http rundi-scheduler-tick \
      --location="$REGION" --schedule="*/5 * * * *" \
      --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-scheduler:run" \
      --http-method=POST --oauth-service-account-email="$SCHED_SA"
  # Promoción de programados cada minuto (ventana +2min de gracia); el tick
  # de 5min sigue ejecutando el mismo Process como respaldo.
  gcloud scheduler jobs create http rundi-programmed-tick \
    --location="$REGION" --schedule="* * * * *" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-programmed:run" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" 2>/dev/null \
    || gcloud scheduler jobs update http rundi-programmed-tick \
      --location="$REGION" --schedule="* * * * *" \
      --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/rundi-programmed:run" \
      --http-method=POST --oauth-service-account-email="$SCHED_SA"
  echo "Jobs + triggers listos"
}

case "${1:-all}" in
  all)  do_setup; do_api; do_jobs ;;
  api)  do_api ;;
  jobs) do_jobs ;;
  *)    echo "uso: $0 [all|api|jobs]" >&2; exit 2 ;;
esac
