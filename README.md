# QuoteDesk

Hebrew right-to-left quoting app for a field-service business: quote templates, quotes with customer e-signature and PDF export, signature documents, a digital business card, contacts, and an API for automations. React + Astryx Design System, one Node serverless function on Vercel, private Vercel Blob storage.

## Run locally

```sh
npm install
cp .env.example .env.local   # fill in the three values
npm run dev
```

Local data is written to `.data/`. PDF export uses the installed Google Chrome (override with `CHROME_PATH`).

## Deploy

Needs a **private** Vercel Blob store connected to the project, and the environment variables `APP_PASSWORD`, `API_KEY` and `SESSION_SECRET`. Without them the app refuses all access.

## API

Documented in the app under **API ותיעוד** and as OpenAPI at `/api/openapi.json`. Authenticate with `Authorization: Bearer <API_KEY>`.

## Privacy

This repository is public. Business details, templates, bank details, customers and signatures live only in the private store. Never commit them.

## Limits

- Nothing is sent automatically: WhatsApp and email buttons open the owner's own app with the message ready.
- Signatures are drawn signatures with name, time and IP address. They are not certified electronic signatures.
- One shared owner password; no separate staff accounts.
- Invoices, expenses, tasks, calendar sync and card payments are not included.
