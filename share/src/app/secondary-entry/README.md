# Secondary entry

A seat's month of stockist secondary figures, and the form to key them in.
Registered for Plasmic as **Secondary Entry**; dev harness at
[`/dev/secondary-entry`](../dev/secondary-entry/page.jsx).

## Composing it in Studio

```
Elbrit DataProvider (Views)   presetDataSource = SecondaryEntry, presetName = Default
└─ Elbrit DataView            viewId = entry
   └─ Secondary Entry         gqlToken = signed-in user's token, roleProfile = their seat
```

It reads rows from the provider's context — nothing to bind for data.
`productsQueryId` (default `Items`) is run through the same provider for
"+ Add product".

## Layout

```
components/
  SecondaryEntry   root: context, products, writes, list ↔ form
  EntryOverview    bulk entry, counts, status grid, filter chips, stockist table
  EntryForm        one stockist, sales + closing by item, Save draft / Submit
data/
  shape.js         THE CONTRACT — row normaliser, per-seat status
  selectors.js     every number, pure
  format.js        every string, pure
  writes.js        ERP writer (REST get → save) + the harness's mock writer
  csv.js           bulk sheet build / parse
  mockData.js      seeded fixture (20 stockists, 6 approved, 14 draft)
```

## Status is per seat

One `Secondary Data Entry` is one stockist-month shared by several seats. A
seat's status comes from its own lines' `custom_status` and its own
`custom_status_tracker` row — **not** the document's `workflow_state`:

| Seat state | Shown as |
|---|---|
| any of its lines `Draft`, or no tracker row yet | Draft |
| tracker "… Approval Waiting", "Waiting for Verification" | Pending |
| tracker "…Approved…", "…Verified" | Approved |
| tracker "…Rejected" | Rejected (editable again) |

So the `SecondaryEntry` query must select `items { custom_status
custom_role_profile__name … }` and `custom_status_tracker { role_profile__name
status__name … }`. `missingFields()` in shape.js names whichever are absent.

For the stockist cards' identity rail, also select `distributor { customer_name
whg_ebs_code whg_other_ebs_codes territory__name }` — the EBS codes and HQ
come off the Customer record. `whg_other_ebs_codes` is comma separated and
often just repeats the primary; `parseEbsCodes` cleans and de-duplicates it. Without it the card still renders: no code, and the HQ falls back to
the seat's own line (`custom_hq__name`).

## Writes

Save draft and Submit both re-read the entry with `frappe.client.get`, change
only this seat's lines, and `frappe.client.save` it back — see the header of
`data/writes.js` for why not GraphQL `saveDoc` (it would drop un-selected child
rows belonging to other seats). Submit writes the lines as `Submitted`; the
"Secondary tracker" Before-Save server script then creates the seat's
Operational Tracker and tracker row. Values are qty × PTS; the server sums the
header totals.

Writes run as `gqlToken`, required — without it the screen is read-only. In
the harness, Live mode is a dry run until **Allow live writes** is on.
