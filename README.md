# DeltaQuad NDA Generator

Mutual NDA self-service tool. Colleagues fill in a form, look up the counterparty
in the Dutch KvK (Netherlands) or OpenCorporates (140+ other countries), and download
a pre-filled `.docx`. Legal is notified via a pre-composed email.

## Project structure

```
nda-tool/
  api/
    kvk.js          ← Serverless proxy → api.kvk.nl
    oc.js           ← Serverless proxy → api.opencorporates.com
  public/
    index.html      ← Single-page app (all UI + docx generation)
  package.json
  vercel.json
  README.md
```

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial NDA tool"
gh repo create deltaquad-nda-tool --private --push --source=.
```

### 2. Import in Vercel

Go to https://vercel.com/new → Import the repo → Deploy (no build config needed).

### 3. Set environment variables (optional but recommended)

In Vercel dashboard → Settings → Environment Variables:

| Name | Value | Notes |
|------|-------|-------|
| `KVK_API_KEY` | your KvK key | Free at https://developers.kvk.nl/ — test key works but has rate limits |
| `OC_API_TOKEN` | your OC token | Optional — increases OpenCorporates rate limit |

Without these, the tool uses the public/demo keys which may be rate-limited.

### 4. Done

Your tool is live at `https://your-project.vercel.app`.

## Get a proper KvK API key

1. Go to https://developers.kvk.nl/
2. Register for a free account
3. Create an application → copy the API key
4. Add it as `KVK_API_KEY` in Vercel env vars

## Local development

```bash
npm i -g vercel
vercel dev
# → http://localhost:3000
```
