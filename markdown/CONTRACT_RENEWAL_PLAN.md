# Contract Renewal — Complete Implementation Reference

> **Status: Fully Implemented.** This document describes the current working system as-built.
> All sections reflect actual code, not plans.

---

## 1. Overview

Contract renewal allows a user to renew an expiring or expired contract. The renewal is a
**completely new contract document** with its own MongoDB `_id`. It goes through the full
workflow again: Draft → Review → Approval → Signature → Finalization.

The two contracts are linked together via a bidirectional pointer:
- **Original** stores `renewedContractId` (forward link) + `renewalStatus` + `renewalStartDate`
- **Renewal** stores `renewedFromId` (backward link)

When the renewal becomes active, the original expired card is **hidden client-side** on the
Contracts page. The History panel lets users walk the full version chain at any time.

---

## 2. Data Model — Renewal-Specific Fields

All fields live on the `Contract` interface in `src/types/contract.ts`.

### On the ORIGINAL contract (when renewal is created)

| Field | Type | Purpose |
|-------|------|---------|
| `renewalStatus` | `'in_progress' \| undefined` | Set when renewal draft is created. Used to show "Renewal in Progress" chip and hide the Renew button. Never explicitly cleared after finalization — visibility is handled client-side by checking the renewal's status. |
| `renewedContractId` | `string \| undefined` | Forward link — the MongoDB `_id` of the renewal draft. Used by the client-side visibility filter and the History chain walk. |
| `renewalStartDate` | `string \| undefined` | ISO date — the start date the user set for the renewal. Used only for the tooltip on the "Renewal in Progress" chip: *"Renewal starting on 05 Apr 2027"*. |

### On the RENEWAL contract (when created)

| Field | Type | Purpose |
|-------|------|---------|
| `renewedFromId` | `string \| undefined` | Backward link — the MongoDB `_id` of the original contract. Set at creation, never changes. Used by the History chain walk and to show the renewal badge on the card. |
| `renewalNotes` | `string \| undefined` | Optional text entered by user in Step 1 of the renewal dialog. Max 500 chars. Displayed in the History Detail Dialog. |

### Chain structure

```
[abc] ──renewedContractId──► [bbb] ──renewedContractId──► [ccc]
      ◄──renewedFromId──            ◄──renewedFromId──
```

Each node is a full, independent MongoDB document. The chain is walked bidirectionally by the
History API to reconstruct the full version list.

---

## 3. Renewal Creation — API

**Endpoint:** `POST /api/contracts/[id]/renew`
**File:** `src/app/api/contracts/[id]/renew/route.ts`

### Request Body

```typescript
{
  startDate:      string;              // ISO date — new contract start date
  endDate:        string;              // ISO date — new contract end date
  notes?:         string;              // Optional renewal notes (max 500 chars)
  documentSource: 'same' | 'template'; // Which PDF to use for the renewal
  templateId?:    string;              // Required if documentSource === 'template'
  createdBy:      string;              // Email of the user creating the renewal
}
```

### Validation Rules (in order)

1. `createdBy` must be present
2. `startDate` and `endDate` must be present
3. `documentSource` must be `'same'` or `'template'`
4. If `documentSource === 'template'`, `templateId` must be present
5. Both dates must be valid ISO format
6. `endDate` must be strictly after `startDate`
7. Original contract status must be `EXPIRING`, `EXPIRED`, or `ACTIVE`
8. No renewal already in progress: original must not have `renewalStatus === 'in_progress'` or `'renewed'`
9. `startDate` must be strictly after the original contract's `endDate` (compared at day boundary)

### Idempotency

Before creating a new document, the API checks if a draft renewal already exists:
```javascript
const existing = await db.collection('contracts').findOne({
    renewedFromId: id,
    status: 'draft'
});
if (existing) return { success: true, renewalId: existing._id.toString() };
```
This makes it safe for the user to click "Next" in the dialog multiple times.

### Document Resolution (what PDF and parties go into the renewal)

A helper `enrichFormFields(fields, parties)` runs in both branches. It backfills
`partyLabel` and `partyColor` onto each formField from the `parties` array, so the
`MultiPartySignatureDialog` always receives correctly labelled and coloured party chips:

```javascript
const enrichFormFields = (fields, parties) => {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  return fields.map(f => {
    const party = f.assignedParty ? partyMap.get(f.assignedParty) : null;
    return {
      ...f,
      value: '',                                           // always cleared
      partyLabel: f.partyLabel || party?.label || f.assignedParty || '',
      partyColor: f.partyColor || party?.color || '#888',
    };
  });
};
```

---

**If `documentSource === 'template'` (user chose a different template):**

1. Fetch the chosen template from `templates` collection by `templateId`
2. `renewalPdf` ← `template.pdf || template.fileData`
3. `renewalParties` ← `template.parties` (the party colour/label config of the new template)
4. `renewalFormFields` ← `enrichFormFields(template.formFields, renewalParties)`
   - Copies all field definitions with values cleared
   - Backfills `partyLabel` / `partyColor` from the new template's parties
5. `renewalXfdf` ← `null` (clean start)

**Critical:** `template.parties` must be read here. Without it, the `MultiPartySignatureDialog`
receives an empty parties array and shows no signer rows. The party dot colours also come from
this field — if it is missing, all dots render as grey.

---

**If `documentSource === 'same'` (keep the existing document):**

1. Try to fetch the original contract's source template (clean, unfilled PDF):
   - `original.templateId` → fetch from `templates` collection
   - `renewalParties` ← `sourceTemplate.parties || original.parties`
   - `renewalFormFields` ← `enrichFormFields(sourceTemplate.formFields || original.formFields, renewalParties)`
2. If source template was deleted:
   - Fall back to `original.pdf || original.fileData`
   - `renewalParties` ← `original.parties`
   - `renewalFormFields` ← `enrichFormFields(original.formFields, renewalParties)`
3. If no `templateId` at all (manually uploaded PDF):
   - Use `original.pdf || original.fileData`
   - `renewalParties` ← `original.parties`
   - `renewalFormFields` ← `enrichFormFields(original.formFields, renewalParties)`
4. `renewalXfdf` ← `null` always (no old annotations carry over)

---

### Created Renewal Document

```javascript
{
  title:         `${original.title} (Renewal)`,  // "(Renewal)" appended (stripped at display time)
  description:   original.description,
  client:        original.client,
  category:      original.category,
  teamId:        original.teamId,                 // same team
  startDate:     startDate,                       // new dates from user
  endDate:       endDate,
  expiresInDays: /* calculated from today to endDate */,
  pdf:           renewalPdf,
  fileData:      renewalPdf,
  formFields:    renewalFormFields,               // enriched with partyLabel/partyColor
  parties:       renewalParties,                  // copied from template or original
  xfdfData:      null,
  status:        'draft',                         // fresh workflow start
  renewedFromId: original._id.toString(),         // backward link
  renewalNotes:  notes || null,
  // All workflow state cleared:
  reviewStatus:          null,
  signatureFlowStatus:   null,
  internalSigners:       [],
  externalSigners:       [],
  partyCompletions:      [],
  currentSigningOrder:   null,
  createdBy:     createdBy,
  createdAt:     now,
  updatedAt:     now,
}
```

**Note:** `parties` was previously not stored on renewal documents. This caused the
`MultiPartySignatureDialog` to show an empty party dropdown and all party dots to appear
grey in the `SignatureProgressTimeline`. It is now always copied from the resolved source.

### Original Contract Update

The original is **NOT** marked immediately at draft creation time.
It is only marked after the user **actually saves** the renewal document:

```javascript
// Called by POST /api/contracts/[id]/mark-renewal
// Triggered by the dialog after handleSave() succeeds
await db.collection('contracts').updateOne(
  { _id: new ObjectId(id) },
  { $set: {
      renewalStatus:     'in_progress',
      renewedContractId: renewalId,
      renewalStartDate:  startDate,
      updatedAt:         now,
  }}
);
```

If the user closes the dialog without saving, the renewal draft is **deleted** via
`DELETE /api/contracts/{renewalId}` and the original contract is left untouched,
so its Renew button remains available.

### Response

```json
{ "success": true, "renewalId": "<new contract _id>" }
```

---

## 4. Renewal Finalization — API

**Endpoint:** `POST /api/contracts/[id]/finalize`
**File:** `src/app/api/contracts/[id]/finalize/route.ts`

### Renewal-Specific Logic

When finalizing a contract that has `renewedFromId` set (i.e., it is a renewal):

1. The API detects it is a renewal via `contract.renewedFromId`
2. It updates the **original contract's** `updatedAt` timestamp only:
   ```javascript
   await db.collection('contracts').updateOne(
     { _id: new ObjectId(contract.renewedFromId) },
     { $set: { updatedAt: now } }
   );
   ```
3. `renewalStatus` on the original is **NOT cleared** here — it is no longer needed once the
   renewal is active, because visibility is entirely driven by the renewal's status on the
   client side.

### Overall Finalization Flow

1. Validate all external signers have completed
2. Calculate final `status` based on today vs `startDate`/`endDate`:
   - If today < startDate → `'signed'`
   - If today between startDate and endDate and expires in ≤30 days → `'expiring'`
   - If today between startDate and endDate → `'active'`
   - If today > endDate → `'expired'`
3. Update contract: `status`, `signatureFlowStatus: 'finalized'`, `finalizedAt`, `finalizedBy`
4. If renewal: update original's `updatedAt`

After this step, the client-side visibility filter on the Contracts page will detect that the
renewal is now `active` or `expiring` and automatically hide the original expired card.

---

## 5. History Chain — API

**Endpoint:** `GET /api/contracts/[id]/history`
**File:** `src/app/api/contracts/[id]/history/route.ts`

### Purpose

Returns every contract in the version chain for any given contract ID. The caller can be
any node in the chain (original, first renewal, second renewal, etc.) and will always get
the full list.

### Chain Walking Algorithm

```javascript
// 1. Fetch starting contract
// 2. Walk BACKWARD via renewedFromId until null:
//    abc ← bbb ← ccc (if ccc is passed in, walks back to abc)
// 3. Walk FORWARD via renewedContractId until null:
//    abc → bbb → ccc (discovers newer renewals)
// 4. visited Set prevents infinite loops
// 5. Sort by startDate ascending (no startDate = draft, goes last)
```

### Lightweight Projection

Heavy fields are excluded from the response to keep it fast:
```javascript
const EXCLUDED = { pdf: 0, fileData: 0, formFields: 0, fieldValues: 0,
                   xfdfData: 0, signedPdfBase64: 0, templateDocxBase64: 0, content: 0 }
```

### Response Shape

```typescript
{
  success: true,
  chain: HistoryEntry[]  // sorted by startDate ascending
}

interface HistoryEntry {
  id:                string;
  title:             string;
  startDate:         string | null;
  endDate:           string | null;
  status:            string;
  createdAt:         string | null;
  finalizedAt:       string | null;
  renewedFromId:     string | null;
  renewedContractId: string | null;
  renewalStatus:     string | null;
  renewalStartDate:  string | null;
  renewalNotes:      string | null;
  client:            string;
  category:          string;
  templateName:      string;
  createdBy:         string;
  externalSigners:   { email, partyLabel, status, completedAt }[];
  internalSigners:   { email, partyLabel, status, completedAt }[];
}
```

---

## 6. Renewal Dialog — UI

**File:** `src/components/contracts/RenewContractDialog.tsx`

### Props

```typescript
{
  open:            boolean;
  onClose:         () => void;
  contractId:      string;
  contractTitle:   string;
  contractEndDate: string;   // ISO — used to enforce startDate > endDate
  onSuccess?:      (renewalId: string) => void;
}
```

### Step 1 — Renewal Details

Form fields:
- **New Start Date** — date picker, minimum = original endDate + 1 day
- **New End Date** — date picker, minimum = startDate + 1 day
- **Document Source** — radio group:
  - *"Keep existing document (fields cleared)"* → `documentSource='same'`
  - *"Use a different template"* → `documentSource='template'`
- **Template** — autocomplete (shown only when source='template'), loads from `/api/templates`
- **Renewal Notes** — optional textarea, max 500 chars

On clicking **Next**:
1. Client-side validation of all fields
2. `POST /api/contracts/{contractId}/renew` — creates the draft (does NOT mark original yet)
3. Sets `renewalId` state from response
4. Fetches the newly created renewal contract (`GET /api/contracts/{renewalId}`)
5. Builds `effectiveParties` from (in priority order):
   - `renewalContract.parties` (set by API from template or original)
   - `originalParties` fallback (fetched separately if renewal parties empty)
   - Derived from `formFields[].assignedParty` metadata as last resort
6. Advances to Step 2

All Step 1 fields remain editable even after a renewal draft is already created (no disabled
locks). If user goes back to Step 1 and clicks Next again, the API idempotency returns the
existing `renewalId` without creating a duplicate.

### `effectiveParties` — Priority Chain

Used throughout Step 2 and all sub-dialogs:

```typescript
const effectiveParties = useMemo(() => {
    if (renewalContract?.parties?.length) return renewalContract.parties;
    if (originalParties.length) return originalParties;
    // Final fallback: derive from formFields assignedParty metadata
    const seen = new Map();
    for (const f of renewalContract?.formFields || []) {
        if (f.assignedParty && !seen.has(f.assignedParty)) {
            seen.set(f.assignedParty, {
                id: f.assignedParty,
                label: f.partyLabel || f.assignedParty,
                color: f.partyColor || '#888',
            });
        }
    }
    return Array.from(seen.values());
}, [renewalContract?.parties, renewalContract?.formFields, originalParties]);
```

This ensures `MultiPartySignatureDialog` always receives a populated `parties` array with
correct `id`, `label`, and `color` — regardless of which template was chosen or whether
`parties` was stored on old renewal drafts.

### Step 2 — Edit Document

Full-screen PDF editor using `PDFViewerContainer`:
- File URL: `/api/file/{renewalId}?type=contract`
- Form fields loaded from the renewal contract
- Toolbar mode: `'forms'` (fill-only, no annotation tools)
- Single-party restriction: user (contractor) can only fill fields assigned to one party

**Action buttons:**
- **Back to Details** — returns to Step 1 (state preserved)
- **Save Contract** — exports PDF+XFDF, uploads via `contractService.updateContractSignedPdf()`,
  then calls `POST /api/contracts/{contractId}/mark-renewal` **on first save only** to mark
  the original as `renewalStatus: 'in_progress'`
- **Review & Approve** — saves first (same flow), then opens `RequestReviewDialog`
- **Signature** — saves first, then opens the correct dialog:

**Multi-party vs single-party detection:**
```typescript
// Counts unique assignedParty values directly from formFields — works even when
// effectiveParties is derived from metadata (new template path)
const uniqueAssignedParties = new Set(
    formFields.map(f => f.assignedParty).filter(Boolean)
);
if (uniqueAssignedParties.size > 1) {
    setMultiPartyDialogOpen(true);   // MultiPartySignatureDialog
} else {
    setSignatureDialogOpen(true);    // SubmitForSignatureDialog
}
```

Using `formFields` directly (not `effectiveParties.filter(...)`) is critical for the new
template path — where `effectiveParties` may be freshly derived and IDs might not match
what `effectiveParties.filter(p => formFields.some(...))` expects.

**`MultiPartySignatureDialog` receives:**
- `parties={effectiveParties}` — always populated via the priority chain above
- `formFields={renewalContract?.formFields}` — enriched with `partyLabel`/`partyColor` by API

**On close without saving:**
- `contractService.deleteContract(renewalId)` is called (fire-and-forget)
- Original contract is untouched — Renew button remains available

Save and action buttons are disabled if party validation is triggered and user has partially
filled another party's fields.

---

## 7. Client-Side Visibility Filtering

**File:** `src/app/contracts/page.tsx`

### Rule

An expired contract is hidden if and only if its renewal is currently `active` or `expiring`:

```typescript
// Build a quick status lookup from all loaded contracts
const statusById = new Map(allContracts.map(c => [c.id, c.status]));

// Filter: hide expired contracts whose renewal has gone live
const visible = allContracts.filter(c => {
  if (c.status === ContractStatus.EXPIRED && c.renewedContractId) {
    const renewalStatus = statusById.get(c.renewedContractId);
    if (renewalStatus === ContractStatus.ACTIVE ||
        renewalStatus === ContractStatus.EXPIRING) {
      return false;  // hide it — replacement is live
    }
  }
  return true;
});
```

### Visibility Table

| Original Status | Renewal Status | Original card shown? |
|-----------------|----------------|----------------------|
| Expiring | — | Yes |
| Expired | No renewal | Yes |
| Expired | Draft / Review / Signing | Yes (still needs to be visible) |
| Expired | Active or Expiring | **No** (hidden — replacement is live) |
| Active | — | Yes |

No API changes needed — this runs purely on the already-loaded contracts list.

---

## 8. Contract Card — Visual Indicators

**File:** `src/components/contracts/ContractCard.tsx`

### Title Display

All `(Renewal)` suffixes are stripped for display in all statuses:
```typescript
const displayTitle = contract.title.replace(/(\s*\(Renewal\))+$/i, '');
```
The raw title (e.g. `"C01 (Renewal)"`) is preserved in the database. Only the display is cleaned.

### Renewal Badge (corner icon)

A small amber circular badge with a custom `RenewalContractIcon` SVG is shown at the top-right
corner of the card **only for renewal drafts** (not once active/expiring/expired):

```typescript
{contract.renewedFromId &&
  !['active', 'expiring', 'expired'].includes(contract.status) && (
  <Tooltip title="Renewal contract" arrow placement="right">
    <Box sx={{ position: 'absolute', top: 12, right: 8, ... }}>
      <RenewalContractIcon size={13} color="#fff" />
    </Box>
  </Tooltip>
)}
```

The badge is `position: absolute` — it does not affect card height or layout.

### Renew Button (action icon)

Shown in the action buttons area on hover, only when:
- `variant === 'contract'`
- Status is `EXPIRING` or `EXPIRED`
- No renewal already started (`!contract.renewalStatus`)

Once `renewalStatus === 'in_progress'`, the Renew button disappears.

### "Renewal in Progress" Chip

Shown in the action buttons row for expiring/expired contracts:
```typescript
{contract.status === ContractStatus.EXPIRING || contract.status === ContractStatus.EXPIRED} &&
 contract.renewalStatus === 'in_progress' && (
  <Tooltip title={contract.renewalStartDate
    ? `Renewal starting on ${formatDate(contract.renewalStartDate)}`
    : 'A renewal contract is being prepared'}>
    <Chip label="Renewal in Progress" icon={<AutorenewOutlined />} />
  </Tooltip>
)}
```

---

## 9. Contract Detail Page

**File:** `src/app/contracts/[id]/page.tsx`

### History Button

Shown in the page header only when:
- Contract status is `active`, `expiring`, or `expired`
- Contract has at least one chain link (`renewedFromId` OR `renewedContractId`)

```typescript
{['active', 'expiring', 'expired'].includes(contract?.status) &&
  (contract?.renewedFromId || contract?.renewedContractId) && (
  <Tooltip title="Contract History">
    <IconButton onClick={(e) => setHistoryAnchorEl(e.currentTarget)}>
      <HistoryIcon />
    </IconButton>
  </Tooltip>
)}
```

Draft / review / signing contracts do **not** show the History button.

### State for History

```typescript
const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
const historyPanelOpen = Boolean(historyAnchorEl);
const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);
```

### JSX

```tsx
<ContractHistoryPanel
  open={historyPanelOpen}
  anchorEl={historyAnchorEl}
  onClose={() => setHistoryAnchorEl(null)}
  contractId={contract.id}
  currentContractId={contract.id}
  onSelectEntry={(entry) => setHistoryDialogEntry(entry)}
/>

<ContractHistoryDialog
  open={!!historyDialogEntry}
  onClose={() => setHistoryDialogEntry(null)}
  entry={historyDialogEntry}
  currentContractId={contract?.id || ''}
/>
```

---

## 10. History Panel — ContractHistoryPanel

**File:** `src/components/contracts/ContractHistoryPanel.tsx`

### Rendering Mode

| Screen size | Component |
|-------------|-----------|
| Desktop (`sm` and up) | MUI `Popover` anchored to the History button element via `anchorEl` |
| Mobile (`xs`) | MUI `Drawer` with `anchor="bottom"` (bottom sheet with drag handle) |

Both share the same `HistoryContent` sub-component for the actual chain list.

### Data Loading

Fetches on panel open:
```typescript
useEffect(() => {
  if (open) fetchChain();
}, [open, fetchChain]);

// fetches GET /api/contracts/{contractId}/history
```

Shows skeleton loaders while fetching, error message on failure.

### Entry Classification

Each chain entry is classified relative to the **currently viewed contract**:

| Classification | Condition |
|----------------|-----------|
| `current` | `entry.id === currentContractId` |
| `upcoming` | Status is draft/in_review/in_approval/approved/ready_for_signature/waiting_for_signature/signed/signed_by_everyone, OR startDate is in the future |
| `past` | Everything else |

### Entry Display

Each entry shows:
- Icon: ✓ checkmark (current), ⌛ clock (upcoming), ○ empty circle (past)
- Vertical connector line between entries (colored teal for current, gray for others)
- `● Current` / `◷ Upcoming` / `○ Past` label
- Status chip with color coding
- Title (stripped of "(Renewal)" suffix)
- Date range: `DD MMM YYYY → DD MMM YYYY`
- Renewal notes (for upcoming entries that have `renewalNotes`)
- "View details" link

Clicking anywhere on the entry card calls `onSelectEntry(entry)` and closes the panel.

---

## 11. History Detail Dialog — ContractHistoryDialog

**File:** `src/components/contracts/ContractHistoryDialog.tsx`

Opens when user clicks "View details" on any entry in the History Panel.

### Header

Green gradient header showing:
- Kind label: *"Current Version"* / *"Upcoming Version"* / *"Past Version"*
- Title (stripped of "(Renewal)" suffix)
- Status chip

### Body Sections

**Period banner** — shows `startDate → endDate` or "Dates not set"

**Details** (only shown if values present):
- Client
- Category
- Finalized date (with green checkmark icon)
- Renewal Notes (if present on this entry)

**Signers section** — lists all internal + external signers:
- Green row if `status === 'completed'` with completion date
- Amber row if pending

**Document** — clickable box that opens `DocumentViewerDialog`:
- URL: `/api/file/{entry.id}?type=contract`
- `readOnly={true}` — view only, no editing
- `currentUserRole="contractor"`

---

## 12. Draft Page — Renewal Handling

**File:** `src/app/draft/page.tsx`

### Renewal Badge Title Lookup

When drafts are loaded, the page builds a lookup map of original contract titles:
```typescript
const renewalIds = drafts
  .filter(c => c.renewedFromId)
  .map(c => c.renewedFromId as string);

// fetches all contracts once, builds id → title map
setContractTitleById(map);
```

This is used to pass `renewalOfTitle` to ContractCard — though as of the current build,
the tooltip on the renewal corner badge shows a fixed string ("Renewal contract") rather than
the original title.

### PDF Viewer Title Stripping

When a renewal draft is opened in the editor, the title is stripped of "(Renewal)":
```typescript
fileName={`${selectedContract.title.replace(/(\s*\(Renewal\))+$/i, '')}.pdf`}
title={selectedContract.title.replace(/(\s*\(Renewal\))+$/i, '')}
```

---

## 13. Custom Icon — RenewalContractIcon

**File:** `src/components/common/RenewalContractIcon.tsx`

A custom inline SVG component showing a document with a pencil inside circular renewal arrows,
matching the visual concept of "re-signing a contract".

Props:
```typescript
{ size?: number; color?: string }
// defaults: size=16, color='#fff'
```

Used in ContractCard's renewal corner badge at `size={13}`.

---

## 14. Title Normalization — Where "(Renewal)" Is Stripped

The raw title in MongoDB always contains `(Renewal)` suffix. It is stripped at display time
in every location that shows the title to users:

| Location | Usage |
|----------|-------|
| `ContractCard.tsx` | Title text and tooltip |
| `ContractHistoryPanel.tsx` | Entry title in timeline (line 189) |
| `ContractHistoryDialog.tsx` | Dialog header title (line 97) |
| `draft/page.tsx` | PDF viewer dialog title and fileName |

Regex used everywhere: `/(\s*\(Renewal\))+$/i` — strips all stacked occurrences.

---

## 15. Status Transitions for a Renewal Contract

```
Created          → status: 'draft'
Submit for Review → status: 'in_review'
All reviewed      → status: 'in_approval'
Approved          → status: 'approved'
Sent for sigs     → status: 'waiting_for_signature'
All signed        → status: 'signed_by_everyone'
Finalized         → status: calculated ('active' | 'expiring' | 'signed' | 'expired')
```

After finalization, the client-side filter on the Contracts page checks if the finalized
renewal is `active` or `expiring` and hides the original expired contract automatically.

---

## 16. Complete Renewal Journey (End to End)

```
[abc] status='expiring', no renewalStatus
  ↓
User clicks Renew → RenewContractDialog opens
  Step 1: Set dates (e.g. 05 Apr 2027 → 04 Apr 2028), pick document source, optional notes
  Click "Next"
  POST /api/contracts/abc/renew
    → Creates [bbb] with status='draft', renewedFromId='abc', title='C01 (Renewal)'
    → Updates [abc]: renewalStatus='in_progress', renewedContractId='bbb',
                     renewalStartDate='2027-04-05'
  Step 2: Fill PDF fields → Save

[abc] card: "Renewal in Progress" chip with tooltip "Renewal starting on 05 Apr 2027"
            Renew button hidden
[bbb] card: visible on Draft page with amber renewal corner badge

[bbb] goes through: draft → review → approved → signatures → finalized
  POST /api/contracts/bbb/finalize
    → [bbb] status='active' (calculated from dates)
    → [abc] updatedAt updated (no renewalStatus change)

Contracts page loads:
  statusById = { abc: 'expired', bbb: 'active' }
  abc: expired + renewedContractId='bbb' + statusById['bbb']='active' → HIDDEN
  bbb: active → SHOWN as the live card

[bbb] card: History icon visible (has renewedFromId link, status is active)
User clicks History → Popover opens showing:
  ● Current   C01   05 Apr 2027 → 04 Apr 2028   [Active]
  ○ Past      C01   03 Apr 2025 → 04 Apr 2027   [Expired]
User clicks "View details" on [abc] → ContractHistoryDialog opens
  Shows: dates, client, category, signers, PDF viewer link

[bbb] eventually expires → user renews again → [ccc] created
[ccc] finalized → active
  abc: expired, renewedContractId='bbb', bbb is expired → SHOWN again? No:
       abc is hidden only if its DIRECT renewal (bbb) is active.
       bbb is now expired, so abc becomes visible in history but not on main page
       because bbb is also hidden (bbb's renewal ccc is active)
  bbb: expired, renewedContractId='ccc', ccc is active → HIDDEN
  ccc: active → SHOWN

History on ccc:
  ● Current   C01   05 Apr 2028 → 04 Apr 2029   [Active]
  ○ Past      C01   05 Apr 2027 → 04 Apr 2028   [Expired]
  ○ Past      C01   03 Apr 2025 → 04 Apr 2027   [Expired]
```

---

## 17. What Does NOT Change (Unchanged Systems)

- `autoAdvance.ts` — sequential signing auto-advance engine
- `PDFViewerContainer.tsx` — PDF editor core
- Review & Approval flow — fully reused by renewal
- Email/notification system — fully reused by renewal
- External signing page `/sign/[token]` — works for renewal signers too
- `/api/file/[id]` route — serves PDF for any contract ID, including renewals
- Teams — `teamId` is inherited by the renewal; renewal appears in same team workspace
- `effectiveParties` fallback — already in place for renewal contracts with empty `parties[]`

---

## 18. Known Behaviors & Edge Cases

**Multi-level hiding:** If abc→bbb→ccc all exist and ccc is active, both abc and bbb are hidden.
The filter only checks each contract's direct `renewedContractId`, but since both abc(expired)
→bbb(expired, renewal active) and bbb(expired)→ccc(active) are filtered out, all originals
are hidden correctly.

**Abandoned renewals:** If a renewal draft is deleted before becoming active, the original's
`renewalStatus` stays `'in_progress'` indefinitely (orphaned marker). This edge case is not
currently handled — a cleanup job or "Cancel Renewal" feature would be needed.

**Date overlap guard:** The server strictly requires `newStartDate > originalEndDate`. Same-day
renewals are blocked (`>` not `>=`).

**Title stacking:** If somehow the DB title already has `(Renewal)` and the API appends another,
the display regex `/(\s*\(Renewal\))+$/i` strips ALL of them in one pass, showing only the
clean base title.

**Party fields on old renewals:** Old renewal contracts may have empty `parties[]` arrays.
The `effectiveParties` pattern (used in SignatureProgressTimeline, sign/[token] page, and
contracts/page.tsx) derives party configs from `formFields[].assignedParty` metadata as a
fallback.

**New template party colours:** When a user selects a different template in Step 1, the renewal
API now reads `template.parties` and stores it as `parties` on the renewal document. It also
runs `enrichFormFields()` which backfills `partyLabel` and `partyColor` onto every formField
from the template's party config. Without this, the `MultiPartySignatureDialog` showed an
empty party dropdown and all dots in `SignatureProgressTimeline` rendered grey.

**Multi-party detection uses formFields, not parties:** `openSignatureDialog()` in
`RenewContractDialog` counts unique `assignedParty` values from `formFields` directly rather
than filtering `effectiveParties`. This is necessary because on the new template path the
parties array is derived — party IDs are guaranteed to match `formFields[].assignedParty`
values but `effectiveParties.filter(p => formFields.some(...))` could silently return 0
if called before the derivation settles.

**`(Renewal)` in contract detail page:** The contract detail page (`contracts/[id]/page.tsx`)
now derives `displayTitle` once at the top by stripping all stacked `(Renewal)` suffixes.
This is used for the page header, document viewer title/fileName, document list entry names,
download filename, and the `contractTitle` prop passed to `RenewContractDialog`. Previously
the raw DB title was used everywhere, causing `(Renewal) (Renewal) (Renewal)` to appear in
headers and PDF viewer tabs on second-generation renewals.
