# fx-engine (Cloud Run, 21 Nov 2026)

Re-runs the TA/DA engine for a month and saves the days whose figures changed to
Field Expense Day: it opens https://erp.elbrit.org/field-expenses?month=M&fxsave=1
headless as the ERP user `fx-engine@elbrit.org` (role "Field Expense Engine" — no
DocType rights; allowed by the Data / Days Save / Days Prune server scripts). Same
engine, same save as the dashboard: only changed days (calc_hash), claimed days never.

- Service: `fx-engine`, project `elbrit-sso-d01d9`, region `asia-southeast1`,
  one instance, CPU always on (runs after answering 202).
- Secrets: `fx-engine-erp-token` (ERP key:secret), `fx-engine-call-key` (x-fx-key).
- Callers: ERP "Field Non-Reported Day API" on approval (API Settings fx_engine_url /
  fx_engine_key); Cloud Scheduler `fx-engine-nightly` 01:30 IST (`{"months":"auto"}`:
  this month, and last month in its first 7 days).

```
POST /recalc  {"month":"2026-10","reason":"..."}  (or "months":[...]|"auto")   header x-fx-key
GET  /status                                                                    header x-fx-key
```

Deploy: `gcloud run deploy fx-engine --source . --project elbrit-sso-d01d9 --region asia-southeast1`
Local dry run (writes blocked): `ERP_TOKEN=key:secret DRY=1 node server.js --once 2026-10`
