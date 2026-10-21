# verify-doc

Reads documents (bills, receipts, statements) with Gemini and scores them against the
data the caller expected. One service for every Elbrit feature: Expense Claims first,
Secondary next. Zero dependencies, Node 20+.

## Who can call it

| Caller | Headers |
|---|---|
| Signed-in user (from the app) | `Authorization: Bearer <Firebase ID token>` (Google or phone login) |
| Elbrit server | `Authorization: Bearer <client key>` (from `VERIFY_DOC_CLIENTS`) |

The Firebase token is checked against Google's certificates (project, expiry, signature).
Set `REQUIRE_ERP_TOKEN=true` to also demand `X-ERP-Token`, checked live on `ERP_URL` (cached 10 min). Browsers only from
`ALLOWED_ORIGINS`. 30 checks per caller per minute.

## `POST /v1/verify`

```json
{
  "documents": [{ "url": "https://erp.elbrit.org/private/files/bill.jpg", "headers": { "Authorization": "token k:s" } },
                { "data": "<base64>", "mimeType": "application/pdf", "name": "bill.pdf" }],
  "context": "Employee expense claim, India, INR",
  "fields": {
    "amount":   { "type": "number", "expected": 500, "weight": 70, "tolerance": "2%" },
    "date":     { "type": "date", "expected": "2026-10-21", "weight": 15, "toleranceDays": 3 },
    "category": { "type": "text", "expected": "Fuel", "match": "meaning", "weight": 15 },
    "vendor":   { "type": "text" },
    "items":    { "type": "table", "key": "item", "keyMatch": "meaning", "weight": 80,
                  "columns": { "sales_qty": { "type": "number", "weight": 60 } },
                  "expected": [{ "item": "Aura 10mg Tablet", "sales_qty": 120 }] }
  },
  "rules": ["The bill must not be a personal UPI transfer"],
  "bands": { "low": 90, "medium": 70 }
}
```

- Types: `number`, `date` (day-first), `month`, `text` (`match`: `exact` | `meaning`), `table`.
- A field without `expected` is only read, never scored. `weight` defaults to 1.
- `tolerance`: `"2%"` or an absolute amount. Numbers fall to 0 points at 50% off; dates at 30 days.
- Documents: photos (png/jpeg/webp/heic), PDF, `.xlsx`, CSV. URLs only from `ALLOWED_DOC_HOSTS`, https, no redirects. Max 10 docs, 15 MB each. Nothing is stored.

Response:

```json
{
  "score": 89, "risk": "Medium",
  "fields": { "amount": { "found": 450, "expected": 500, "ok": false, "points": 58.8, "weight": 70, "confidence": 0.98,
                          "reason": "Document shows 450, expected 500 (-50, 10% off)" } },
  "rules": [{ "rule": "…", "pass": true, "reason": "…" }],
  "summary": "A fuel receipt. Differences: amount: …",
  "document": { "readable": true, "kind": "receipt", "language": "en" },
  "meta": { "model": "gemini-2.5-flash", "ms": 2400, "documents": 1, "tokens": 1830 }
}
```

`confidence` is how sure the model is it read the value; `points`/`score` are how well it
matches — computed in `lib/score.mjs`, never by the model. The model is never shown the
expected numbers, dates or exact text, only what it must judge by meaning.

## Run, test, deploy

```sh
npm test                                   # node --test, everything faked
GEMINI_API_KEY=… VERIFY_DOC_CLIENTS='{"dev":"k"}' npm start
firebase deploy --only apphosting          # from this folder, as it@elbrit.org
```

First deploy: `firebase apphosting:backends:create --backend verify-doc --primary-region asia-southeast1`
(root directory `services/verify-doc`), then the secrets:
`firebase apphosting:secrets:set verify-doc-gemini-key` and `verify-doc-clients`
(JSON `{"elbrit-app":"<long random key>"}`), granted to the backend.
