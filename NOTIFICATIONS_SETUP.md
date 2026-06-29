# Elbrit One — Notification Integration Runbook (ERPNext UAT ↔ Novu ↔ OneSignal)

> **Scope:** External / dashboard configuration only — ERPNext (UAT), Novu, OneSignal, and Raven.
> This document does **not** cover application source code. It is the operations checklist for whoever owns
> the Novu and OneSignal dashboards.
>
> **Goal:** When a billed-invoice snapshot is generated in ERPNext, the relevant team members receive the
> notification in **three** places — ERPNext bell, **Raven** chat, and the **Elbrit One app** (in-app bell +
> push via OneSignal). Clicking the app notification opens the **/chat** page.

---

## 0. Architecture at a glance

```
ERPNext UAT — Sales Invoice PDF attached  (DocType: File, event: After Insert)
        │
        ├─ Server Script "Snapshot Invoice"               ── ✅ DONE (no action needed)
        │        ├─► Raven chat        (posts PDF + caption to the team channel)
        │        └─► ERPNext Bell      (Notification Log for each active dept employee)
        │
        └─ Server Script "Snapshot Invoice Notification"  ── ✅ DONE in UAT (needs Novu + OneSignal config)
                 └─► POST https://api.novu.co/v1/events/trigger   (workflow: "snapshot-invoice")
                          │
                          ├─► Novu In-App step  ─► Elbrit One app bell  ─► click opens /chat
                          └─► Novu Push step    ─► OneSignal  ─► browser / mobile push
```

**Notification destinations and where each is configured**

| Destination | Configured in | Status |
|---|---|---|
| ERPNext Bell (Notification Log) | ERPNext Server Script | ✅ Done |
| Raven chat (team channel) | ERPNext Server Script + Raven channels | ✅ Done (verify channels exist) |
| Elbrit One app — In-App bell | **Novu** (this runbook) | ⬜ To do |
| Elbrit One app — Push | **Novu + OneSignal** (this runbook) | ⬜ To do |

---

## 1. Reference values

| Item | Value | Secret? |
|---|---|---|
| OneSignal App ID | `9cc963c3-d3c9-4230-b817-6860109d8f3f` | No (public) |
| OneSignal REST API Key (App API Key) | *Copy from OneSignal dashboard — see §3* | **Yes — never paste into docs/repo** |
| Novu Application Identifier (Production) | `pdnBD6k7fkMq` | No (public) |
| Novu API Key (used by ERPNext) | `851ed88…b4` (already stored in ERPNext webhook headers) | **Yes — masked here on purpose** |
| Novu trigger / workflow identifier to create | `snapshot-invoice` | No |
| Novu trigger endpoint | `https://api.novu.co/v1/events/trigger` | No |
| Subscriber ID convention | the user's **lowercase email** | No |

> 🔐 **Secret handling:** Do not write the OneSignal REST API Key or the full Novu API Key into this file,
> the repo, or chat. Copy them directly from the dashboards into the place that needs them.

---

## 2. ✅ What is ALREADY done in ERPNext (UAT) — for reference, no action needed

Both run on **DocType `File` → event `After Insert`** (i.e. the moment an invoice PDF is attached to a Sales Invoice). The PDF filename pattern is `<Department_with_underscores>_<InvoiceID>.pdf`.

### 2.1 Server Script: `Snapshot Invoice` (enabled)
Handles the two destinations that already work:
1. **Raven chat** — makes the PDF public, then posts the **PDF file** and a **caption** (Customer, EBS Code, Team, Invoice ID, Total, PDF link) to the team's Raven channel.
2. **ERPNext Bell** — creates a `Notification Log` for every **Active** employee in the invoice's department (whose User is enabled).

**Raven channel routing (so you can verify channels exist):**
- Workspace: **`Elbrit Life Sciences`**
- Channel name = team name slug, lowercase, spaces → hyphens (e.g. `Elbrit Care` → `elbrit-care`)
- Fallback channel docname pattern: `uat.elbrit.org-<slug>---elpl`
- ➜ **Validate:** the Raven channel for each team must exist, or the Raven post is skipped (the bell + Novu still work).

### 2.2 Server Script: `Snapshot Invoice Notification` (enabled)
The new piece that pushes the same event into **Novu**:
- Resolves the **Active** employees of the invoice's department → their **lowercase emails** as Novu subscribers.
- Fires **one** Novu trigger to all of them:
  - `POST https://api.novu.co/v1/events/trigger`
  - Headers: `Authorization: ApiKey <Novu API Key>`, `Content-Type: application/json`
  - `name`: **`snapshot-invoice`**  ← must match the Novu workflow identifier you create in §4
  - `to`: array of `{ subscriberId, email }` (lowercase)
  - `payload` fields available to the Novu template:

    | Payload field | Example | Use in Novu template |
    |---|---|---|
    | `subject` | `Billed Invoice ACC-SINV-0001 - Elbrit Care - ₹1200.00` | In-App + Push title |
    | `body` | `Customer: ACME | Total: ₹1200.00` | In-App + Push body |
    | `team` | `Elbrit Care` | Push content |
    | `total` | `1200.00` | Push content |
    | `invoice` | `ACC-SINV-0001` | deep-link / display |
    | `pdf_url` | `https://uat.elbrit.org/files/...pdf` | "View PDF" action button |
    | `redirectTo` | `/chat` | In-App **Redirect URL** (where the click goes) |

- The Novu call is wrapped so a Novu/network failure **never** breaks the invoice PDF attachment. Failures are logged in **ERPNext → Error Log** under title `Snapshot Invoice Novu trigger failed`.

> ⚠️ **Validated caveat (Novu API):** a single trigger accepts a **maximum of 100 recipients**. If any
> department ever has >100 active employees, the trigger must be split into batches. (Not a concern today.)

### 2.3 Existing related Novu triggers in UAT (context only)
- **`Leave Pending → Novu`** — Webhook on `Leave Application` (status Open) → workflow `leave_pending`. ✅ live.
- **`sec_approve`** — Webhook on `Secondary Data Entry`. (Uses an older endpoint; out of scope here.)

✅ **Nothing more to do in ERPNext for the Snapshot Invoice flow.** The remaining work is in OneSignal and Novu.

---

## 3. ⬜ OneSignal — step by step

The Elbrit One web app already loads the OneSignal Web SDK and registers device tokens, so OneSignal needs only **verification** plus **handing one key to Novu**.

### Step 3.1 — Verify the Web platform is configured
1. OneSignal dashboard → select the app → **Settings → Push & In-App → Web**.
2. Confirm:
   - **Site URL / origin** matches the Elbrit One production domain (HTTPS).
   - **Service worker** filename/path is `OneSignalSDKWorker.js` and is reachable at the site root.
3. ✅ **Validate:** Open `https://<your-domain>/OneSignalSDKWorker.js` in a browser — it must load as JavaScript (not 404).

### Step 3.2 — Copy the credentials Novu needs
1. **Settings → Keys & IDs**.
2. Copy:
   - **App ID** — must equal `9cc963c3-d3c9-4230-b817-6860109d8f3f`.
   - **REST API Key (App API Key)** — the secret (new keys start with `os_v2_app_` and are shown **only once** on creation/rotation). Keep it for §4 Step 4.2.
3. ✅ **Validate:** App ID matches the value above. If you can't see the REST API Key value, rotate/create one and store it immediately.

### Step 3.3 — (Reference) How subscribers map
- Each browser/device that allows notifications gets a **Subscription ID** (player_id). The app registers this onto the matching Novu subscriber automatically.
- ➜ Push only reaches users who have **opened the app and allowed notifications**. In-App bell works for everyone regardless.

**OneSignal checklist**
- [ ] Web platform origin = production domain, HTTPS
- [ ] `OneSignalSDKWorker.js` loads (no 404)
- [ ] App ID confirmed = `9cc963c3-…-8f3f`
- [ ] REST API Key copied (stored safely for Novu)

---

## 4. ⬜ Novu — step by step

> 🌐 **Environment first.** Top-right in the Novu dashboard, select the environment whose **Application
> Identifier is `pdnBD6k7fkMq`** (Production) — the same environment whose API Key (`851ed88…b4`) ERPNext
> uses. The workflow MUST be created in this environment, or the app bell will stay empty.

### Step 4.1 — Confirm you are in the right environment
1. Open Novu dashboard → check the environment switcher (top-right).
2. Settings → API Keys → confirm the **Application Identifier** reads `pdnBD6k7fkMq`.
3. ✅ **Validate:** environment = the one ERPNext triggers.

### Step 4.2 — Connect OneSignal as a Push integration
1. **Integrations Store → Connect provider → Push tab → OneSignal**.
2. Paste:
   - **App ID** = `9cc963c3-d3c9-4230-b817-6860109d8f3f`
   - **App API Key** = the OneSignal REST API Key from Step 3.2
3. Click **Create Integration** (it activates automatically).
4. Open the integration and confirm its **Identifier is exactly `onesignal`** (the app stores device tokens against this exact identifier — do not change it).
5. ✅ **Validate:** integration is **Active**, identifier = `onesignal`, only **one** active OneSignal integration in this environment.

### Step 4.3 — Create the workflow
1. **Workflows → Create Workflow** → name it `Snapshot Invoice`.
2. Open the workflow → confirm the **Trigger Identifier = `snapshot-invoice`** (lowercase, hyphenated, immutable after creation). Rename it now if it auto-generated anything else — it must match what ERPNext sends.
3. ✅ **Validate:** trigger identifier reads exactly `snapshot-invoice`.

### Step 4.4 — Add the In-App step (the app bell)
1. Add an **In-App** step.
2. Configure with payload variables:
   - **Subject / Title:** `{{payload.subject}}`
   - **Body:** `{{payload.body}}`
   - **Redirect URL:** `{{payload.redirectTo}}`  ← this is what routes the click to **/chat**
   - *(Optional)* Add an action button **"View PDF"** → URL `{{payload.pdf_url}}`
3. ✅ **Validate:** the Redirect URL field is set to `{{payload.redirectTo}}` (not blank, not hard-coded).

### Step 4.5 — Add the Push step (OneSignal)
1. Add a **Push** step → provider **OneSignal**.
2. Configure:
   - **Title:** `{{payload.subject}}`
   - **Content:** `{{payload.team}} • ₹{{payload.total}}`
3. ✅ **Validate:** the Push step's provider shows OneSignal and is enabled.

### Step 4.6 — Publish the workflow
1. Click **Update / Publish**. A draft workflow does **not** fire.
2. ✅ **Validate:** workflow status = **Active / Published**.

**Novu checklist**
- [ ] Correct environment (`pdnBD6k7fkMq`)
- [ ] OneSignal integration Active, identifier `onesignal`
- [ ] Workflow trigger id = `snapshot-invoice`
- [ ] In-App step: subject/body set, Redirect URL = `{{payload.redirectTo}}`
- [ ] Push step: OneSignal provider, title/content set
- [ ] Workflow Published

---

## 5. ✅ End-to-end test & validation

### Test A — Novu only (fastest, proves Novu + OneSignal without ERP)
1. Novu → open the `snapshot-invoice` workflow → **Trigger** tab.
2. Set **subscriberId = `it@elbrit.org`** and paste this payload:
   ```json
   {
     "subject": "Test invoice",
     "body": "Hello from Novu",
     "team": "Elbrit Care",
     "total": "1200.00",
     "invoice": "ACC-SINV-0001",
     "pdf_url": "https://uat.elbrit.org",
     "redirectTo": "/chat"
   }
   ```
3. **Expected:**
   - In the Elbrit One app (logged in as it@elbrit.org) the **bell shows the notification**.
   - **Clicking it navigates to `/chat`.**
   - If browser notifications were allowed, a **push** also arrives.

### Test B — Full chain from ERPNext
1. In UAT, attach an invoice PDF (correct `<Dept>_<InvoiceID>.pdf` name) to a Sales Invoice.
2. **Expected:** Raven post + ERPNext bell (as before) **and** Novu in-app + push for that department's employees.

### Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| App bell empty after trigger | Wrong Novu environment, or trigger id ≠ `snapshot-invoice` | Re-check §4.1 and §4.3 |
| In-App works, no push | OneSignal integration not Active / wrong identifier, or user never allowed notifications | Re-check §4.2; have user allow notifications in the app |
| Click does nothing / wrong page | In-App Redirect URL not set to `{{payload.redirectTo}}` | §4.4 |
| Nothing fires from ERPNext | Check **ERPNext → Error Log** → `Snapshot Invoice Novu trigger failed` | Read the logged error |
| Raven post missing | Team's Raven channel doesn't exist | Create the channel (see §2.1 naming) |
| Some users miss it | Employee not Active, or User disabled, or email case mismatch | Subscriber id must be **lowercase email** |

---

## 6. ➕ Pattern: adding a NEW notification type later

The system is **data-driven** — to add another notification (e.g. a new approval), repeat the same shape; no app code changes are needed:

1. **ERPNext** — in the Server Script / Webhook that fires the event, POST to `https://api.novu.co/v1/events/trigger` with:
   - `name`: a new workflow identifier (e.g. `purchase-approval`)
   - `to`: array of recipient **lowercase emails**
   - `payload`: include a **`redirectTo`** pointing at the right page (e.g. `/chat`, `/leave/APP-0001`, `/chat?invoice=SINV-1`)
2. **Novu** — create a workflow with that identifier, add In-App (Redirect URL = `{{payload.redirectTo}}`) and/or Push (OneSignal) steps, and Publish.
3. **OneSignal** — nothing new (the one integration serves all push workflows).

> The "where does the click go" decision lives in the **`redirectTo`** payload from ERPNext — change the data, not the app.

---

## 7. Master validation checklist

- [ ] **ERPNext** — `Snapshot Invoice` and `Snapshot Invoice Notification` server scripts enabled (✅ done)
- [ ] **Raven** — team channels exist under workspace `Elbrit Life Sciences`
- [ ] **OneSignal** — Web platform verified, App ID confirmed, REST API Key copied
- [ ] **Novu** — correct environment (`pdnBD6k7fkMq`)
- [ ] **Novu** — OneSignal integration Active, identifier `onesignal`
- [ ] **Novu** — workflow `snapshot-invoice` created, In-App + Push steps, Redirect URL = `{{payload.redirectTo}}`, Published
- [ ] **Test A** — Novu Trigger tab → app bell + click → /chat + push
- [ ] **Test B** — real invoice PDF in UAT → all destinations fire

---

## 8. Sources (validated against official documentation)

- Novu — OneSignal integration: https://docs.novu.co/platform/integrations/push/onesignal
- Novu — Trigger event API (`/v1/events/trigger`, `Authorization: ApiKey`, max 100 recipients): https://docs.novu.co/api-reference/events/trigger-event
- Novu — Trigger a workflow / identifier rules: https://docs.novu.co/platform/workflow/trigger-workflow
- Novu — Create a workflow: https://docs.novu.co/platform/workflow/create-a-workflow
- OneSignal — Keys & IDs (App ID, REST API Key): https://documentation.onesignal.com/docs/keys-and-ids
- OneSignal — Web Push setup (origin, service worker, subscription id): https://documentation.onesignal.com/docs/web-push-quickstart
