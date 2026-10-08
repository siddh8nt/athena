# Deploying Athena to Cloud Run

Everything runs in the `athena-qloo` project on the Free Trial billing account (PRD §14). Never click
"Upgrade" or "Activate full account" in Billing: the trial then stops resources rather than charging a card.

## One-time setup

```bash
gcloud config set project athena-qloo
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com aiplatform.googleapis.com cloudscheduler.googleapis.com
gcloud firestore databases create --location=nam5
```

Secrets (values come from `.env`; they are never baked into the image):

```bash
for k in QLOO_API_KEY TICKETMASTER_API_KEY CENSUS_API_KEY; do
  printf %s "$(grep "^$k=" .env | cut -d= -f2-)" | gcloud secrets create "$k" --data-file=-
done
openssl rand -hex 32 | gcloud secrets create WARM_TOKEN --data-file=-
```

The Cloud Run service account needs `roles/secretmanager.secretAccessor`, `roles/datastore.user` and
`roles/aiplatform.user`.

## Deploy

```bash
gcloud run deploy athena --source . --region us-central1 \
  --min-instances 1 --max-instances 3 --cpu 1 --memory 1Gi --timeout 900 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=athena-qloo,GOOGLE_CLOUD_LOCATION=global,GEMINI_FLASH_MODEL=gemini-3.8-flash,GEMINI_PRO_MODEL=gemini-3.1-pro-preview,QLOO_BASE_URL=https://hackathon.api.qloo.com \
  --set-secrets QLOO_API_KEY=QLOO_API_KEY:latest,TICKETMASTER_API_KEY=TICKETMASTER_API_KEY:latest,CENSUS_API_KEY=CENSUS_API_KEY:latest,WARM_TOKEN=WARM_TOKEN:latest
```

`.gcloudignore` keeps `.env`, `.cache` and `node_modules` out of the upload.

## Daily warm-cache job (§14.9)

```bash
URL=$(gcloud run services describe athena --region us-central1 --format 'value(status.url)')
gcloud scheduler jobs create http athena-warm --location us-central1 --schedule "0 9 * * *" \
  --uri "$URL/api/warm" --http-method POST --attempt-deadline 900s \
  --headers "X-Warm-Token=$(gcloud secrets versions access latest --secret WARM_TOKEN)"
```

Run it once right after the first deploy so the demo brands are ready before anyone visits.

## Checks after deploy

- `GET /health` returns `{"ok":true,"mode":"live","qlooKeyConfigured":true}`.
- `/brightland` loads every block from the store in a few seconds; `/method` shows three comparisons.
- Billing → Reports after a day: spend matches §14.8, and the Gemini global-endpoint prices match the table.
