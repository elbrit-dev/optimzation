# ERP GraphQL Queries & Mutations — Full Inventory (with query text + variables)

Every ERP (Frappe GraphQL) query and mutation used across the repo — root app, `share/`, and `shared/` — with the actual GraphQL text **and the variables the app actually passes** (paste-ready for the GraphiQL variables pane), ordered by how often each fires and how much data it pulls.

**API shape:** everything goes through `frappe_graphql`, so **reads** are per-doctype connections (`Events`, `Leads`, `Employees`, …) and **writes** are always one of four generic mutations — `saveDoc`, `setValue`, `deleteDoc`, `uploadFile` — wrapped under different operation names.

> Note: the calendar queries are built with `${ERP_*_FIELDS}` placeholders from
> `shared/calendar/components/calendar/module/event/graphql/field-config.js`.
> The bodies below are shown **fully resolved** (placeholders replaced with the real field names).
> Values like emails, dates, and document names in the variables blocks are examples — the shape and field names are exact.

---

## 1. QUERIES — ranked by frequency × volume

### 1.1 `EventsByRange` — the heaviest, most frequent query

**File:** `shared/calendar/components/calendar/module/event/graphql/events.query.js`
**Fires:** every visible range change, after every local write, and on every live-sync probe hit.
**Volume:** window starts at 500 rows and **doubles up to 8000** until `hasNextPage` is false (`event.service.js:352-399`). Cursor pagination is deliberately avoided (ERP's `after` + `filter` combo is broken: "Filter must be a tuple or list").

```graphql
query EventsByRange(
  $first: Int!
  $after: String
  $filters: [DBFilterInput!]
) {
  Events(first: $first, after: $after, filter: $filters) {
    edges {
      node {
        name
        subject
        description
        starts_on
        ends_on
        color
        all_day
        status
        event_type
        event_category
        pob_given: custom_pob_given
        role_profile: custom_role_profile__name
        custom_doctor__name: custom_doctor__name
        doctor_latitude: custom_latitude
        doctor_longitude: custom_longitude
        custom_employee_id: custom_employee_id {
          name
          company_email
          user_id: user_id__name
          first_name
          middle_name
          last_name
        }
        reference_doctype__name
        reference_docname__name
        google_meet_link
        custom_meeting_location: custom_meeting_location
        custom_hq__name: custom_hq__name
        event_participants {
          reference_doctype__name
          custom_latitude
          custom_longitude
          custom_distance: custom_distance
          custom_visit_time: custom_visit_time
          custom_is_force_visit: custom_is_force_visit
          custom_force_visit_reason: custom_force_visit_reason
          reference_docname__name
          attending
          email
          role_profile: custom_role_profile {
            name
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Variables** (`after` is deliberately NEVER sent — absent means "no cursor"; only `starts_on <= rangeEnd` is filtered server-side, the range-start overlap check happens client-side; `first` retries at 500 → 1000 → 2000 → 4000 → 8000):

```json
{
  "first": 500,
  "filters": [
    { "fieldname": "starts_on", "operator": "LTE", "value": "2026-08-31T18:29:59.999Z" }
  ]
}
```

### 1.2 REST change probe (not GraphQL, but the most frequent ERP call)

**File:** `shared/calendar/lib/calendar/change-probe.js`
**Fires:** **every 10 seconds** (`useCalendarLiveSync.js:15`) for 4 doctypes: Event, Leave Application, ToDo, DocShare. It's what triggers `EventsByRange` refetches.

```
GET {erpBaseUrl}/api/resource/{doctype}
  ?limit_page_length=1
  &order_by=modified desc
  &fields=["modified"]  (aggregate-style count/latest probe)
```

### 1.3 `Doctors` (Leads) — 1000 rows + notes child table, uncached

**File:** `events.query.js` · **Fires:** `fetchDoctors()` (no cache), per territory change, and per search — `master-data.service.js:234-284`. **Top optimization candidate.**
⚠ Variable name here is `filter` (singular), unlike most other queries.

```graphql
query Doctors($first: Int, $filter: [DBFilterInput]) {
  Leads(first: $first, filter: $filter) {
    edges {
      node {
        name
        lead_name
        city
        custom_latitude
        custom_longitude
        custom_speciality
        email_id
        notes {
          name
          note
          creation
          idx
          doctype
          creation
          modified
        }
        custom_category3__name
        custom_category2__name
        custom_category1__name
        territory__name: territory__name
      }
    }
  }
}
```

**Variables** — `fetchDoctors()` (all):

```json
{ "first": 1000 }
```

`fetchDoctorsByTerritory(territory)`:

```json
{
  "first": 1000,
  "filter": [
    { "fieldname": "territory", "operator": "EQ", "value": "HQ-Coimbatore" }
  ]
}
```

`searchDoctors({ search, territory })` — both entries optional, pushed only when set:

```json
{
  "first": 1000,
  "filter": [
    { "fieldname": "territory", "operator": "EQ", "value": "HQ-Coimbatore" },
    { "fieldname": "lead_name", "operator": "LIKE", "value": "%kumar%" }
  ]
}
```

### 1.4 `GetEmployees` — 1000 rows, cached

**File:** `events.query.js` · **Fires:** bootstrap; cached via `getCached("EMPLOYEE_RAW")`.

```graphql
query GetEmployees($first: Int!, $filters: [DBFilterInput!]) {
  Employees(
    first: $first
    filter: $filters
  ) {
    edges {
      node {
        name
        employee_name
        company_email
        user_id: user_id__name
        idx
        leave_approver {
          name
        }
        designation {
          name
        }
        role_id: custom_role_profile__name
      }
    }
  }
}
```

**Variables** (`master-data.service.js:21-30`):

```json
{
  "first": 1000,
  "filters": [
    { "fieldname": "status", "operator": "EQ", "value": "Active" }
  ]
}
```

### 1.5 `Items` — 1000 rows, cached

**File:** `events.query.js` · **Fires:** POB item list; cached via `getCached("POB_ITEMS")`.

```graphql
query Items(
  $first: Int!
  $after: String
  $filters: [DBFilterInput!]
) {
  Items(first: $first, after: $after, filter: $filters) {
    edges {
      node {
        item_code
        item_name
        custom_last_mrp
        custom_department_details {
          valid_from
          valid_to
          elbrit_department__name
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Variables** (`master-data.service.js:83-94`):

```json
{
  "first": 1000,
  "filters": [
    { "fieldname": "custom_last_mrp", "operator": "GT", "value": "0" }
  ]
}
```

### 1.6 `LeaveApplications` (full detail) — `first: 500`, calendar overlay

**File:** `shared/calendar/components/calendar/module/leave/graphql/leave.query.js` (`LEAVE_QUERY`)
**Fires:** loaded alongside events, refetched on probe hits.

```graphql
query LeaveApplications($first: Int) {
  LeaveApplications(first: $first) {
    edges {
      node {
        name
        from_date
        to_date
        half_day
        half_day_date
        total_leave_days
        description
        posting_date
        status
        custom_attachement
        leave_approver {
          name
        }
        leave_approver_name
        custom_escalation_approver__name
        leave_balance
        employee_name
        employee {
          name
          company_email
          first_name
          middle_name
          last_name
        }
        leave_type__name
      }
    }
  }
}
```

**Variables** (`leave.service.js:239-241`):

```json
{ "first": 500 }
```

### 1.7 `ToDoes` — `first: 500`, calendar overlay

**File:** `shared/calendar/components/calendar/module/todo/graphql/todo.query.js`

```graphql
query ToDoes($first: Int!) {
  ToDoes(first: $first) {
    edges {
      node {
        name
        description
        date
        priority
        status
        assigned_by: assigned_by__name
        allocated_to__name
        custom_subject
        custom_assigned_to {
          employee__name
        }
      }
    }
  }
}
```

**Variables** (`todo.service.js:14-16`):

```json
{ "first": 500 }
```

### 1.8 `DocSharesByUser` / `DocSharesByEvent` — `first: 500` each

**File:** `events.query.js` · **Fires:** visibility resolution on load + per event open (`docshare.service.js`).

```graphql
query DocSharesByUser($first: Int!, $filters: [DBFilterInput!]) {
  DocShares(first: $first, filter: $filters) {
    edges {
      node {
        name
        share_name: share_name__name
      }
    }
  }
}
```

**Variables** (`docshare.service.js:18-30`):

```json
{
  "first": 500,
  "filters": [
    { "fieldname": "share_doctype", "operator": "EQ", "value": "Event" },
    { "fieldname": "user", "operator": "EQ", "value": "someone@elbrit.org" }
  ]
}
```

```graphql
query DocSharesByEvent($first: Int!, $filters: [DBFilterInput!]) {
  DocShares(first: $first, filter: $filters) {
    edges {
      node {
        name
        user {
          name
        }
      }
    }
  }
}
```

**Variables** (`docshare.service.js:47-59`):

```json
{
  "first": 500,
  "filters": [
    { "fieldname": "share_doctype", "operator": "EQ", "value": "Event" },
    { "fieldname": "share_name", "operator": "EQ", "value": "EV00123" }
  ]
}
```

### 1.9 `Customers` — `first: 500`, fetched twice per POB flow

**File:** `events.query.js` · **Fires:** POB customer dropdown (all + HQ-filtered).

```graphql
query Customers($first: Int, $filters: [DBFilterInput!]) {
  Customers(first: $first, filter: $filters) {
    edges {
      node {
        name
        territory__name
      }
    }
  }
}
```

**Variables** — all customers:

```json
{ "first": 500 }
```

HQ-filtered (`event.service.js:256-263`):

```json
{
  "first": 500,
  "filters": [
    { "fieldname": "territory", "operator": "EQ", "value": "HQ-Coimbatore" }
  ]
}
```

### 1.10 Leave-balance trio — per leave-form open (parallel, 5-min TTL cache)

**File:** `leave.query.js` · **Fires:** three requests in parallel per employee (`leave.service.js:426-440`).

```graphql
query LeaveAllocationsByEmployee(
  $first: Int!
  $filters: [DBFilterInput!]
) {
  LeaveAllocations(first: $first, filter: $filters) {
    edges {
      node {
        leave_type__name
        total_leaves_allocated
        from_date
        to_date
      }
    }
  }
}
```

**Variables** — allocations (`getLeaveAllocationFilters`):

```json
{
  "first": 20,
  "filters": [
    { "fieldname": "employee", "operator": "EQ", "value": "HR-EMP-00042" },
    { "fieldname": "docstatus", "operator": "EQ", "value": "1" }
  ]
}
```

```graphql
query LeaveApplications($first: Int!, $filters: [DBFilterInput!]) {
  LeaveApplications(first: $first, filter: $filters) {
    edges {
      node {
        leave_type__name
        total_leave_days
        from_date
      }
    }
  }
}
```

**Variables** — used leaves (`getLeaveUsedFilters`; ⚠ module code reads with `"APPROVED"`, the legacy `services/event.service.js` copy uses `"Approved"` — status casing differs between read paths, writes must be Title Case):

```json
{
  "first": 100,
  "filters": [
    { "fieldname": "employee", "operator": "EQ", "value": "HR-EMP-00042" },
    { "fieldname": "status", "operator": "EQ", "value": "APPROVED" },
    { "fieldname": "docstatus", "operator": "EQ", "value": "1" }
  ]
}
```

**Variables** — pending leaves (`getLeavePendingFilters`):

```json
{
  "first": 100,
  "filters": [
    { "fieldname": "employee", "operator": "EQ", "value": "HR-EMP-00042" },
    { "fieldname": "status", "operator": "EQ", "value": "OPEN" }
  ]
}
```

### 1.11 `RoleProfiles` (`ELBRIT_ROLEID`) — bootstrap, `first: 1000`

**File:** `events.query.js` · **Fires:** once at calendar bootstrap (`bootstrapping.js:28`).

```graphql
query RoleProfiles($first: Int) {
  RoleProfiles(first: $first) {
    edges {
      node {
        role_id: role_profile
        is_group
        custom_department {
          department_name
          lft
          rgt
          parent_department__name
        }
        parent_role_id: parent_role_profile {
          name
          is_group
        }
      }
    }
  }
}
```

**Variables:**

```json
{ "first": 1000 }
```

### 1.12 `GetHQTerritories` — bootstrap, `first: 1000`

**File:** `events.query.js`

```graphql
query GetHQTerritories($first: Int!) {
  Territorys(first: $first) {
    edges {
      node {
        name
      }
    }
  }
}
```

**Variables:**

```json
{ "first": 1000 }
```

### 1.13 `Quotations` (by names, with items) — POB summaries per event

**File:** `events.query.js` (`QUOTATIONS_BY_NAMES_QUERY`)
**Fires:** batched — the service builds one aliased `Quotations` block per quotation name in a single request, each `first: 1` with a `name EQ` filter (`event.service.js:60-80`). Standalone shape:

```graphql
query Quotations(
  $first: Int!
  $filters: [DBFilterInput!]
) {
  Quotations(first: $first, filter: $filters) {
    edges {
      node {
        name
        creation
        items {
          item_code { name }
          qty
          rate
          amount
        }
      }
    }
  }
}
```

**Variables** (per quotation name):

```json
{
  "first": 1,
  "filters": [
    { "fieldname": "name", "operator": "EQ", "value": "SAL-QTN-2026-00123" }
  ]
}
```

### 1.14 `GetTodoComments` — per todo/event open

**File:** `todo.query.js` (filters are hardcoded in the query body; only the reference name is a variable)

```graphql
query GetTodoComments($referenceName: String!) {
  Comments(
    first: 100
    filter: [
      { fieldname: "reference_doctype", operator: EQ, value: "ToDo" }
      { fieldname: "reference_name", operator: EQ, value: $referenceName }
      { fieldname: "comment_type", operator: EQ, value: "Comment" }
    ]
  ) {
    edges {
      node {
        name
        content
        comment_by
        comment_email
        creation
      }
    }
  }
}
```

**Variables:**

```json
{ "referenceName": "07f5b8c3a1" }
```

### 1.15 `GetDoctor` — single Lead by name (fallback outside the 1000-row cap)

**File:** `master-data.service.js:290-326`. NOTE: filtering the `Leads` LIST by `name` returns `[]` in frappe_graphql — the single-document `Lead(name:)` query must be used.

```graphql
query GetDoctor($name: String!) {
  Lead(name: $name) {
    name
    lead_name
    city
    custom_latitude
    custom_longitude
    custom_speciality
    email_id
    notes {
      name
      note
      creation
      idx
      doctype
      modified
    }
    custom_category3__name
    custom_category2__name
    custom_category1__name
    territory__name: territory__name
  }
}
```

**Variables:**

```json
{ "name": "CRM-LEAD-2025-00123" }
```

### 1.16 `GetLead` — lead notes read (before every note add/delete)

**File:** `shared/calendar/services/event.service.js:205-225`

```graphql
query GetLead($name: String!) {
  Lead(name: $name) {
    name
    notes {
      name
      note
      idx
      parentfield
      parenttype
      doctype
      creation
      modified
    }
  }
}
```

**Variables:**

```json
{ "name": "CRM-LEAD-2025-00123" }
```

### 1.17 `LeaveTypes` — leave form open (cached)

**File:** `leave.query.js` · cached via `getCached("LEAVE_TYPES")`.

```graphql
query LeaveTypes($first: Int!) {
  LeaveTypes(first: $first) {
    edges {
      node {
        name
      }
    }
  }
}
```

**Variables:**

```json
{ "first": 100 }
```

### 1.18 Google Calendar queries — auth flow only

**File:** `shared/calendar/components/calendar/google-auth/queries.js`

```graphql
query GoogleCalendars($first: Int, $filter: [DBFilterInput]) {
  GoogleCalendars(first: $first, filter: $filter) {
    edges {
      node {
        name
        calendar_name
        google_calendar_id
        refresh_token
        enable
        authorization_code
        user__name
      }
    }
  }
}
```

**Variables** (`event.service.js:285-291` — lookup by user):

```json
{
  "first": 1,
  "filter": [
    { "fieldname": "user", "operator": "EQ", "value": "someone@elbrit.org" }
  ]
}
```

```graphql
query GoogleCalendar($name: String!) {
  GoogleCalendar(name: $name) {
    name
    calendar_name
    google_calendar_id
    refresh_token
    enable
    authorization_code
  }
}
```

**Variables:**

```json
{ "name": "someone@elbrit.org-Google Calendar" }
```

### 1.19 `PrimaryStock` — the single biggest payload in the repo

**File:** `share/src/resource/offline/PrimaryStockOffline.js`
**Volume:** four connections in ONE request — Targets ×1000, SalesInvoices ×`$first` (10000) with full `items` child table, **Batches ×10000**, plus a 1-row postingDetails probe. Used for offline sync.

```graphql
query PrimaryStock(
  $first: Int
  $startDate: String!
  $endDate: String!
  $value: String!
  $operator: DBFilterOperator!
  $customer: [String] = ""
  $items: [String] = ""
  $status: [String] = ""
) {
  targets: Targets(
    filter: [
      { fieldname: "date", operator: GTE, value: $startDate }
      { fieldname: "date", operator: LTE, value: $endDate }
    ]
    first: 1000
  ) {
    edges {
      node {
        posting_date: date
        hq: hq__name
        name
        sales_team: salesteam__name
        target: value
      }
    }
  }
  primary: SalesInvoices(
    first: $first
    filter: [
      { fieldname: "status", operator: NOT_IN, values: $status }
      { fieldname: "fsl_sample", operator: EQ, value: "0" }
      { fieldname: "posting_date", operator: GTE, value: $startDate }
      { fieldname: "posting_date", operator: LTE, value: $endDate }
      { fieldname: "customer_name", operator: $operator, values: $customer }
    ]
  ) {
    edges {
      node {
        customer {
          name
          customer_name
        }
        invoice: name
        status
        fsl_purpose
        is_internal_customer
        customer_group__name
        posting_date
        is_return
        is_pos
        is_reverse_charge
        is_discounted
        whg_ebs_code
        whg_ignore_invoice
        company__name
        fsl_sample
        fsl_claim
        items {
          item: item_name
          brand
          qty
          amount
          is_free_item
          net_primary: taxable_value
          customer_item_code
          fsl_expiry
          fsl_return_batch
          fsl_sales_return__name
          fsl_ptr
          fsl_pts
          fsl_mrp
          warehouse: warehouse__name
          fsl_elbrit_sales_team__name
          discount_percentage
          discount_amount
        }
      }
    }
  }
  batches: Batches(
    first: 10000
    filter: [
      { fieldname: "status", operator: EQ, value: $value }
      { fieldname: "item_name", operator: $operator, values: $items }
    ]
  ) {
    edges {
      node {
        batch_stock_levels
        status
        item: item__name
        name
        batch_id
        batch_qty
      }
    }
  }
  postingDetails: SalesInvoices(
    first: 1
    filter: [
      { fieldname: "posting_date", operator: GTE, value: $startDate }
      { fieldname: "posting_date", operator: LTE, value: $endDate }
      { fieldname: "customer_name", operator: $operator, values: $customer }
      { fieldname: "status", operator: NOT_IN, values: $status }
    ]
    sortBy: { direction: DESC, field: CREATION }
  ) {
    edges {
      node {
        posting_date
        modified
        posting_time
        name
      }
    }
  }
}
```

**Variables** (the exact saved variables from the offline doc, `PrimaryStockOffline.js` `variables:` field):

```json
{
  "first": 10000,
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "operator": "NOT_IN",
  "status": ["CANCELLED", "DRAFT", "INTERNAL_TRANSFER"],
  "customer": ["Saviour Wellness Private Limited", "Elbrit Lifesciences Private Limited"],
  "items": [],
  "value": "ACTIVE"
}
```

### 1.20 `CustomReport` — dynamic report runner (SmartDataTable)

**File:** `share/src/components/SmartDataTable/reportSource.jsx:434-453`
The query is **built at runtime**: variable declarations come from `api.variableTypes` (or are inferred), all non-`filters` variables become direct args, `filters` goes into `run_report`. The server executes a whole ERP report per call. Template shape:

```graphql
query CustomReport($report_name: String!, $filters: JSON) {
  customReport(report_name: $report_name, run_report: [{ filters: $filters }]) {
    report_meta
    edges { node }
  }
}
```

**Variables** (example — the default variables map routes `controls.dateRange.start/end` → `filters.from_date/to_date`, `pagination.page/limit` → `page/limit` when present in base vars):

```json
{
  "report_name": "Operational Tracker",
  "filters": {
    "from_date": "2026-08-01",
    "to_date": "2026-08-31"
  }
}
```

### 1.21 `CustomFilter` — sidebar filter values (SmartDataTable)

**File:** `reportSource.jsx:650-705` · **Fires:** when the user types a search term in a sidebar filter.

```graphql
query CustomFilter($filters: JSON!) {
  customFilter(filter: $filters) {
    values {
      value
      distinct_count
      line_count
    }
  }
}
```

**Variables** (built in `graphqlFetchFilterValues`: `dimension` is the upper-cased/startcased key, `limit = page * pageLength`, `search` only when typed, plus one cascade entry per other active filter):

```json
{
  "filters": {
    "dimension": "HQ",
    "search": "coim",
    "limit": 20,
    "customer": "Apollo Pharmacy"
  }
}
```

### 1.22 Datatable app (DataProviderNew) — saved queries, not in code

`share/src/app/datatable/` executes saved queries pulled from **Firestore** through the graphql-playground pipeline/worker (`useQueryExecution` → `queryWorker`). Any heavy query there lives in the saved-query configs, not the repo. Same for the Plasmic-bound page queries consumed by `components/SecondaryDataSummary.jsx`.

---

## 2. MUTATIONS — full text + variables

All `saveDoc` mutations take **one variable `doc`, which is a JSON-STRINGIFIED document** (a string containing JSON, not a JSON object).

### 2.1 `saveDoc` family (create/update)

`SaveEvent` → Event — **the most-used write** (visits, meetings, force-visit, attendance). `events.query.js:261-269`:

```graphql
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Event", doc: $doc) {
    doc {
      name
    }
  }
}
```

**Variables** (create — omit `name`; update — include `name`):

```json
{
  "doc": "{\"doctype\":\"Event\",\"subject\":\"Dr Visit — Dr. Kumar\",\"starts_on\":\"2026-08-05 10:00:00\",\"ends_on\":\"2026-08-05 10:30:00\",\"event_type\":\"Public\",\"status\":\"Open\",\"custom_employee_id\":\"HR-EMP-00042\",\"custom_doctor\":\"CRM-LEAD-2025-00123\",\"event_participants\":[{\"reference_doctype\":\"Lead\",\"reference_docname\":\"CRM-LEAD-2025-00123\"}]}"
}
```

Same shape, different doctype:

```graphql
# POB save — events.query.js (SAVE_EVENT_QUOTATION)
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Quotation", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"Quotation\",\"quotation_to\":\"Customer\",\"party_name\":\"Apollo Pharmacy\",\"items\":[{\"item_code\":\"ITEM-001\",\"qty\":10,\"rate\":250}]}"
}
```

```graphql
# Todo save — todo.query.js (SAVE_EVENT_TODO)
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "ToDo", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"ToDo\",\"custom_subject\":\"Follow up stockist\",\"description\":\"<p>details…</p>\",\"date\":\"2026-08-10\",\"priority\":\"Medium\",\"status\":\"Open\",\"allocated_to\":\"someone@elbrit.org\"}"
}
```

```graphql
# Leave apply — leave.query.js (statuses MUST be Title Case on writes)
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Leave Application", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"Leave Application\",\"employee\":\"HR-EMP-00042\",\"leave_type\":\"Casual Leave\",\"from_date\":\"2026-08-10\",\"to_date\":\"2026-08-11\",\"status\":\"Open\",\"description\":\"Personal\"}"
}
```

```graphql
# Todo comments — todo.query.js (SAVE_COMMENT)
mutation SaveComment($doc: String!) {
  saveDoc(doctype: "Comment", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"Comment\",\"comment_type\":\"Comment\",\"reference_doctype\":\"ToDo\",\"reference_name\":\"07f5b8c3a1\",\"content\":\"<p>Done, called them today.</p>\"}"
}
```

```graphql
# Share events upward in hierarchy — events.query.js (SAVE_DOC_SHARE_MUTATION)
mutation SaveDocShare($doc: String!) {
  saveDoc(doctype: "DocShare", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"DocShare\",\"user\":\"manager@elbrit.org\",\"share_doctype\":\"Event\",\"share_name\":\"EV00123\",\"read\":1}"
}
```

```graphql
# Doctor notes add/edit — services/event.service.js:242-248
# doc = { name, notes } — the FULL notes array is re-saved every time
mutation SaveLead($doc: String!) {
  saveDoc(doctype: "Lead", doc: $doc) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"name\":\"CRM-LEAD-2025-00123\",\"notes\":[{\"note\":\"<p>Existing note kept as-is</p>\",\"name\":\"a1b2c3\"},{\"note\":\"<p>New note appended</p>\"}]}"
}
```

```graphql
# Google auth storage — google-auth/queries.js
mutation SaveGoogleCalendar($doc: String!) {
  saveDoc(
    doctype: "Google Calendar",
    doc: $doc
  ) {
    doc { name }
  }
}
```

```json
{
  "doc": "{\"doctype\":\"Google Calendar\",\"user\":\"someone@elbrit.org\",\"calendar_name\":\"Elbrit\",\"enable\":1,\"authorization_code\":\"4/0AX…\",\"refresh_token\":\"1//0g…\"}"
}
```

```graphql
# Primary attendance device — components/DevicePrimaryGuard.jsx:240-244
# (doctype + fieldname are interpolated at runtime; defaults shown)
mutation SaveAttendanceDevice($doc: String!) {
  saveDoc(doctype: "Employee", doc: $doc) {
    doc { name custom_attendance_device_id }
  }
}
```

```json
{
  "doc": "{\"name\":\"HR-EMP-00042\",\"custom_attendance_device_id\":\"c1f9e2ab-7d34-4e0a-9b1c-2f8d0e6a5b43\"}"
}
```

The datatable write path also generates `saveDoc`-style bulk payloads dynamically from the write schema for **any doctype** (`share/src/app/datatable/utils/formRowToApiPayload.js`).

### 2.2 `setValue` family (single field)

```graphql
# leave.query.js — approve/reject flow
mutation UpdateLeaveStatus(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "status"
    value: $value
  ) {
    name
  }
}
```

**Variables** (⚠ writes must use Title Case — `"Approved"` / `"Rejected"`, never `"APPROVED"`):

```json
{ "name": "HR-LAP-2026-00123", "value": "Approved" }
```

```graphql
# leave.query.js — link uploaded medical certificate
mutation UpdateLeaveAttachment(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "custom_attachement"
    value: $value
  ) {
    name
  }
}
```

```json
{ "name": "HR-LAP-2026-00123", "value": "/private/files/medical-certificate.pdf" }
```

```graphql
# services/event.service.js:607-628 — doctor date of birth
mutation UpdateLeadDOB(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Lead"
    name: $name
    fieldname: "fsl_dob"
    value: $value
  ) {
    name
  }
}
```

```json
{ "name": "CRM-LEAD-2025-00123", "value": "1980-06-15" }
```

### 2.3 `deleteDoc` family

```graphql
# services/event.service.js:478-484 — delete event (or linked doc via $doctype)
mutation DeleteEvent($doctype: String!, $name: String!) {
  deleteDoc(doctype: $doctype, name: $name) {
    name
  }
}
```

```json
{ "doctype": "Event", "name": "EV00123" }
```

```graphql
# services/event.service.js:485-497
mutation DeleteLeadNote(
  $doctype: String!,
  $name: String!
) {
  deleteDoc(
    doctype: $doctype,
    name: $name
  ) {
    name
  }
}
```

**Variables** (`doctype` comes from the note row's own `doctype` field returned by `GetLead`; note deletion also has a fallback path that re-saves the Lead with the filtered `notes` array via `SaveLead`):

```json
{ "doctype": "CRM Note", "name": "a1b2c3d4e5" }
```

### 2.4 `uploadFile` (multipart)

**File:** `shared/calendar/lib/file.service.js:8-27` — sent as **multipart form-data** (`operations` + `map` + file part per the GraphQL multipart spec), not plain JSON. Used for leave medical certificates.

```graphql
mutation UploadFile(
  $file: Upload!
  $attached_to_doctype: String
  $attached_to_name: String
  $fieldname: String
  $is_private: Boolean
) {
  uploadFile(
    file: $file
    attached_to_doctype: $attached_to_doctype
    attached_to_name: $attached_to_name
    fieldname: $fieldname
    is_private: $is_private
  ) {
    name
    file_url
  }
}
```

**Variables** (inside the `operations` form field; `file` stays `null` and is mapped to form part `"0"` via `map: { "0": ["variables.file"] }`):

```json
{
  "file": null,
  "attached_to_doctype": "Leave Application",
  "attached_to_name": "HR-LAP-2026-00123",
  "fieldname": "custom_attachement",
  "is_private": true
}
```

---

## 3. Top optimization candidates

1. **`EventsByRange`** — frequency × size. Refires on range change, local writes, and every 10-second probe hit; carries the full participants child table at up to 8000 rows.
2. **`Doctors` (Leads with notes)** — 1000 rows including a child table, uncached, refires per search and per territory.
3. **`PrimaryStock`** — raw payload size (4 connections, Batches ×10000, invoices with full items child table in one request).

Honorable mentions: `LeaveApplications first:500` + `ToDoes first:500` (probe-cadence refetch alongside events), and `Customers first:500` fetched twice per POB flow.
