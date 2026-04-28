# Contract Termination Feature — Complete Implementation Plan

> **Status: Not yet implemented.** This document is the full specification and implementation
> guide for the Contract Termination feature. It must be read completely before any code is
> written.

---

## 1. Overview

Contract Termination is a **one-way, irreversible action** that permanently closes a contract
and its version chain. When a user terminates an expired (or expiring) contract:

- The contract's status changes to `terminated`
- The card disappears from the `/contracts` page
- The contract appears on the new `/terminated` page
- No further actions (renew, share, send for signature) are possible
- The full version History panel remains accessible in read-only mode

This feature co-exists with Renewal: **only expired** contracts offer two mutually exclusive
paths — **Renew** (continue the relationship) or **Terminate** (end it permanently).
Expiring contracts are not eligible for termination — the user must wait until the contract
fully expires.

---

## 2. Data Model Changes

### 2.1 `ContractStatus` Enum — `src/types/contract.ts`

Add `TERMINATED` to the existing enum:

```typescript
export enum ContractStatus {
    DRAFT = 'draft',
    IN_REVIEW = 'in_review',
    IN_APPROVAL = 'in_approval',
    APPROVED = 'approved',
    READY_FOR_SIGNATURE = 'ready_for_signature',
    WAITING_FOR_SIGNATURE = 'waiting_for_signature',
    SIGNED_BY_EVERYONE = 'signed_by_everyone',
    SIGNED = 'signed',
    ACTIVE = 'active',
    EXPIRING = 'expiring',
    EXPIRED = 'expired',
    TERMINATED = 'terminated',   // ← ADD THIS
    REJECTED_BY_APPROVER = 'rejected_by_approver',
}
```

### 2.2 `Contract` Interface — `src/types/contract.ts`

Add two optional audit fields:

```typescript
// Termination tracking
terminatedAt?: string;   // ISO datetime — when the contract was terminated
terminatedBy?: string;   // email of the user who performed the termination
```

These fields are set by the API on termination and are never modified after that.

### 2.3 No Schema Migration Required

MongoDB is schemaless. The new fields are optional and the API sets them atomically via
`$set`. Existing contracts are unaffected.

---

## 3. Termination API Route

### 3.1 New File: `src/app/api/contracts/[id]/terminate/route.ts`

**Method:** `POST /api/contracts/[id]/terminate`

**Request Body:**
```json
{ "terminatedBy": "user@example.com" }
```

**Response (success):**
```json
{ "success": true }
```
HTTP 201

**Response (already terminated — idempotent):**
```json
{ "success": true, "alreadyTerminated": true }
```
HTTP 200

### 3.2 Validation Rules (in order of check)

| # | Rule | Error response |
|---|------|----------------|
| 1 | `id` must be a valid MongoDB ObjectId | `400 { error: 'Invalid contract ID' }` |
| 2 | `terminatedBy` must be present in body | `400 { error: 'terminatedBy is required' }` |
| 3 | Contract must exist in DB | `404 { error: 'Contract not found' }` |
| 4 | If already `terminated` → idempotent success | `200 { success: true, alreadyTerminated: true }` |
| 5 | Status must be `expired` only | `400 { error: 'Cannot terminate a contract with status "..."' }` |
| 6 | `renewalStatus` must NOT be `'in_progress'` | `409 { error: 'Cannot terminate a contract that has an active renewal in progress' }` |

**Rule 5 rationale:** Only fully expired contracts can be terminated. Expiring contracts still
have time remaining and may recover; only contracts that have fully expired are eligible.
Active, draft, or signing contracts cannot be terminated — they must complete their lifecycle first.

**Rule 6 rationale:** If a renewal draft exists and is being processed, terminating the
original would orphan the renewal. The user must either let the renewal complete or delete the
renewal draft before terminating.

### 3.3 DB Write

```javascript
await db.collection('contracts').updateOne(
    { _id: new ObjectId(id) },
    {
        $set: {
            status: 'terminated',
            terminatedAt: new Date().toISOString(),
            terminatedBy: terminatedBy,
            updatedAt: new Date().toISOString(),
        }
    }
);
```

### 3.4 No Side Effects

Termination does NOT:
- Delete any contract document
- Modify any linked contract in the chain (`renewedFromId`, `renewedContractId`)
- Send emails
- Modify `renewalStatus` on the original (it stays `'in_progress'` only if you somehow bypassed Rule 6 — but Rule 6 blocks that)

The chain links (`renewedFromId`, `renewedContractId`) are preserved so the History panel
continues to walk the full chain correctly.

---

## 4. New: Terminate Confirmation Dialog

### 4.1 New File: `src/components/contracts/TerminateContractDialog.tsx`

A single-step dialog built with `BaseDialog` (`src/components/common/BaseDialog.tsx`) — no
wizard, no PDF editor, no form fields. BaseDialog provides the standard slide-up animation,
responsive full-screen on mobile, close button in the header, and consistent action bar styling.

**Props:**
```typescript
interface TerminateContractDialogProps {
    open: boolean;
    onClose: () => void;
    contractId: string;
    contractTitle: string;   // clean base title (no "(Renewal)" suffix)
    onSuccess: () => void;   // called after successful termination
}
```

**Internal State:**
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**UI Structure:**
```
┌────────────────────────────────────────────────────────┐
│  ⚠️  Terminate Contract?                          [✕]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  You are about to permanently terminate:               │
│  "IBM NDA Contract"                                    │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ⚠️ This action cannot be undone.                │  │
│  │    The contract will be archived as terminated  │  │
│  │    and cannot be renewed or modified.           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [error message if any]                                │
│                                                        │
├────────────────────────────────────────────────────────┤
│                          [Cancel]  [Terminate ✕]       │
└────────────────────────────────────────────────────────┘
```

**Submit flow:**
1. Set `loading = true`, clear `error`
2. `POST /api/contracts/{contractId}/terminate` with `{ terminatedBy: currentUser.email }`
3. On success → call `onSuccess()` + `onClose()`
4. On error → set `error` from response body, keep dialog open
5. Finally → set `loading = false`

---

## 5. ContractCard Changes

### 5.1 New Prop: `onTerminate`

```typescript
onTerminate?: (id: string) => void;
```

This is passed from the Contracts page and the Contract Detail page. Only shown when the
contract is `expiring` or `expired` AND has no `renewalStatus === 'in_progress'`.

### 5.2 New Prop: `onHistory` Signature Change

For the terminated variant, History is the only action. The prop needs to pass the anchor
element for the Popover:

```typescript
onHistory?: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
```

### 5.3 `variant` Extension

```typescript
variant?: 'draft' | 'contract' | 'terminated';
```

### 5.4 Status Label & Color for TERMINATED

```typescript
// In getStatusLabel:
case ContractStatus.TERMINATED:
    return 'Terminated';

// In getStatusColors:
case ContractStatus.TERMINATED:
    return { bg: '#f1f5f9', color: '#334155', border: '#94a3b8' };
```

### 5.5 Action Buttons for Terminated Variant

When `variant === 'terminated'`:
- **History button only** — shown when `contract.renewedFromId || contract.renewedContractId`
- View button: suppressed
- Download button: suppressed
- Share button: suppressed
- Renew button: suppressed (already excluded because status is not `expiring`/`expired`)
- "Renewal in Progress" chip: suppressed (status check already excludes terminated)

### 5.6 Terminate Button (Contract Variant)

The Terminate action button is added to the hover action buttons array. It is visible **only
when status is `expired`** (not `expiring`) and no renewal is in progress:

```typescript
{
    title: 'Terminate Contract',
    icon: <BlockOutlinedIcon sx={{ fontSize: '1.1rem' }} />,
    onClick: () => onTerminate?.(contract.id),
    color: '#dc2626',
    shadow: 'rgba(220, 38, 38, 0.2)',
    show: variant === 'contract'
        && !!onTerminate
        && contract.status === ContractStatus.EXPIRED   // expired only — not expiring
        && !contract.renewalStatus,                     // hide if renewal in progress
}
```

### 5.7 Mutual Exclusion: Renew ↔ Terminate

The two actions are mutually exclusive:
- If `renewalStatus === 'in_progress'` → Renew button is hidden AND Terminate button is hidden.
  The "Renewal in Progress" chip is shown instead.
- If a contract has been terminated (`status === 'terminated'`) → no Renew button is shown
  (Renew check already requires `EXPIRING | EXPIRED`, which `terminated` is not).

---

## 6. New: Terminated Contracts Page

### 6.1 New File: `src/app/terminated/page.tsx`

**Route:** `/terminated`

**Auth:** Same session check as all other pages (`cms_current_user` from sessionStorage).

**Data loading:**
```typescript
const allContracts = await contractService.getAllContracts();
// Only show terminated contracts that are NOT themselves a renewal of another terminated
// contract — i.e. show only the "head" of each chain. This avoids listing intermediate
// contracts in the chain separately when the whole chain has been terminated.
// Simple rule: show terminated contracts whose renewedFromId either doesn't exist OR
// the parent contract is NOT terminated (meaning the parent is still in the main view).
const statusById = new Map(allContracts.map(c => [c.id, c.status]));
const terminated = allContracts.filter(c => {
    if (c.createdBy !== currentUser.email) return false;
    if (c.status !== ContractStatus.TERMINATED) return false;
    // If this is a renewal, only show it if the parent is also terminated
    // (otherwise the parent is the head and will appear on its own)
    if (c.renewedFromId) {
        const parentStatus = statusById.get(c.renewedFromId);
        // Hide this renewal if the parent is NOT terminated
        // (the parent will show itself; this is an older version)
        return parentStatus === ContractStatus.TERMINATED;
    }
    return true;
});
```

In practice, when a user terminates a contract, only ONE card from the entire version chain
will ever appear on the `/terminated` page — the contract they actually terminated. Prior
versions accessible through the History panel are not shown as separate cards.

**Filtering (client-side):**
- Search by title or client name
- Filter by category
- Filter by termination date range (`terminatedAt` field)

**Card rendering:**
```tsx
<ContractCard
    key={contract.id}
    variant="terminated"
    contract={contract}
    onHistory={(id, event) => {
        setHistoryContractId(id);
        setHistoryAnchorEl(event.currentTarget);
    }}
/>
```

**Card field layout for `variant="terminated"`:**

The `Expires` label and date is replaced by `Terminated` + the `terminatedAt` date:

```
Client   | Category   | Terminated
IBM      | NDA        | 06 Apr 2026
```

This is achieved by passing the contract to ContractCard and having `variant="terminated"`
trigger a different label/value for the third grid cell.

**History panel wiring** (same as `contracts/[id]/page.tsx`):
```tsx
<ContractHistoryPanel
    open={Boolean(historyAnchorEl)}
    anchorEl={historyAnchorEl}
    onClose={() => setHistoryAnchorEl(null)}
    contractId={historyContractId || ''}
    currentContractId={historyContractId || ''}
    onSelectEntry={(entry) => setHistoryDialogEntry(entry)}
/>

<ContractHistoryDialog
    open={!!historyDialogEntry}
    onClose={() => setHistoryDialogEntry(null)}
    entry={historyDialogEntry}
    currentContractId={historyContractId || ''}
/>
```

**Page Header:**
```
Terminated Contracts
X contracts terminated
```

**Empty State:**
```
[BlockOutlined icon]
No terminated contracts
Contracts you terminate will appear here.
```

**State variables:**
```typescript
const [contracts, setContracts] = useState<Contract[]>([]);
const [loading, setLoading] = useState(true);
const [searchQuery, setSearchQuery] = useState('');
const [startDate, setStartDate] = useState<Dayjs | null>(null);
const [endDate, setEndDate] = useState<Dayjs | null>(null);
const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
const [historyContractId, setHistoryContractId] = useState<string | null>(null);
const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);
```

---

## 7. Contract Detail Page Changes

### 7.1 File: `src/app/contracts/[id]/page.tsx`

**Change 1 — Extend History button condition:**
```typescript
// Before:
[ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED].includes(contract?.status)

// After:
[ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.EXPIRED, ContractStatus.TERMINATED]
    .includes(contract?.status)
```

**Change 2 — Terminate button in the expired banner:**

Inside the `No renewal yet` branch (where the Renew button is shown for expired contracts),
add a Terminate button. This button only renders when `contract.status === ContractStatus.EXPIRED`
AND `!contract.renewalStatus` (mutual exclusion: no renewal in progress):

```tsx
<Button
    size="small"
    variant="outlined"
    onClick={() => setTerminateDialogOpen(true)}
    sx={{
        color: '#991b1b',
        borderColor: '#fca5a5',
        fontSize: '0.8rem',
        '&:hover': { bgcolor: '#fef2f2', borderColor: '#ef4444' },
    }}
>
    Terminate Contract
</Button>
```

**Change 3 — Terminated status banner:**

When `contract.status === ContractStatus.TERMINATED`, render a red-grey info banner:

```tsx
{contract.status === ContractStatus.TERMINATED && (
    <Alert
        severity="error"
        icon={<BlockOutlinedIcon />}
        sx={{ mb: 2, bgcolor: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' }}
    >
        This contract was terminated on{' '}
        <strong>
            {new Date(contract.terminatedAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            })}
        </strong>{' '}
        by <strong>{contract.terminatedBy}</strong>. No further actions are available.
    </Alert>
)}
```

**Change 4 — Add state and dialog:**
```typescript
const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
```

```tsx
<TerminateContractDialog
    open={terminateDialogOpen}
    onClose={() => setTerminateDialogOpen(false)}
    contractId={contract.id}
    contractTitle={displayTitle}
    onSuccess={() => {
        setTerminateDialogOpen(false);
        router.push('/terminated');
    }}
/>
```

**Change 5 — Status label/color for terminated:**

The local `getStatusLabel` and color helper functions in this file must handle `'terminated'`.

---

## 8. Contracts Page Changes

### 8.1 File: `src/app/contracts/page.tsx`

**No filter changes needed.** The `CONTRACT_PAGE_STATUSES` constant does not include
`TERMINATED`, so terminated contracts are automatically excluded from the main contracts view
once their status changes.

**Add terminate handler:**
```typescript
const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
const [contractForTermination, setContractForTermination] = useState<Contract | null>(null);

const handleTerminateContract = (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) return;
    setContractForTermination(contract);
    setTerminateDialogOpen(true);
};
```

**Pass `onTerminate` to ContractCard:**
```tsx
<ContractCard
    ...
    onTerminate={handleTerminateContract}
/>
```

**After successful termination:**
```typescript
onSuccess={() => {
    setTerminateDialogOpen(false);
    setContractForTermination(null);
    loadContracts(); // reload to remove terminated card
}}
```

---

## 9. Sidebar Navigation

### 9.1 File: `src/components/layout/Sidebar.tsx`

Add a "Terminated" menu item. Position: after "Contracts" or at the end of the main nav group.

```typescript
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';

// In menuItems array:
{
    text: 'Terminated',
    icon: <BlockOutlinedIcon />,
    path: '/terminated',
}
```

---

## 10. History Panel — Terminated Status Support

### 10.1 File: `src/components/contracts/ContractHistoryPanel.tsx`

Add `terminated` to the `STATUS_CONFIG` object so the status chip renders correctly inside the
History panel:

```typescript
terminated: {
    label: 'Terminated',
    color: '#334155',
    bg: '#f1f5f9',
    border: '#94a3b8',
},
```

The `classifyEntry` function already falls through to `'past'` for unknown statuses, so
terminated entries correctly appear as "Past" in the chain. No logic change needed there.

---

## 11. Full User Flow (End to End)

### Flow A: Terminate from Contracts Page

```
[Contracts Page] — C06576 card with status "Expired"
  User hovers card → action buttons appear
  "Terminate" button visible (red, BlockIcon) — only because status is 'expired' + no renewal
  User clicks "Terminate"
    → TerminateContractDialog opens
    → "You are about to terminate: C06576"
    → Warning: "This action cannot be undone"
  User clicks "Terminate ✕" button
    → POST /api/contracts/C06576/terminate
    → Validation: status is 'expired' ✓
    → Validation: no renewal in progress ✓
    → DB update: status='terminated', terminatedAt=now, terminatedBy=user@email
    → Dialog closes
    → loadContracts() called → C06576 no longer in EXPIRING list → card disappears
[Contracts Page] — C06576 card is gone

[Terminated Page] — C06576 now appears here
  Card shows status chip "Terminated" (grey)
  Only "History" action button in hover state
  User clicks History → ContractHistoryPanel opens (popover)
  Shows full chain: Past | Current (Terminated)
  User clicks "View details" on any entry → ContractHistoryDialog → read-only PDF viewer
```

### Flow B: Terminate from Contract Detail Page

```
[/contracts/C06576] — Status banner: "Expiring on 15 Apr 2026"
  Two buttons: [Renew →] and [Terminate Contract]
  User clicks "Terminate Contract"
    → TerminateContractDialog opens (same as Flow A)
  User confirms
    → POST /api/contracts/C06576/terminate
    → On success → router.push('/terminated')
[/terminated] — User lands on terminated page, C06576 is here
```

### Flow C: Mutual Exclusion — Renewal In Progress Blocks Termination (and vice versa)

```
[Contracts Page] — C06576 with "Renewal in Progress" chip
  "Terminate" action button: NOT shown (hidden by !contract.renewalStatus condition)
  "Renew" action button: also NOT shown (same condition)
  User cannot take either action — only the "Renewal in Progress" chip is shown.

  Conversely:
  If user already clicked "Renew" and the renewal draft was saved:
    → original contract gets renewalStatus='in_progress'
    → Terminate button disappears from the card immediately
  If user then cancels the renewal (dialog closed without saving):
    → renewal draft is deleted + mark-renewal was never called
    → renewalStatus stays unset → Terminate button reappears on next reload
```

### Flow D: Attempt to Terminate Non-Expired Contract (Blocked)

```
  Only expired contracts show the Terminate button in ContractCard
  → Expiring contract: Terminate button NOT rendered (expiring is not eligible)
  → Active contract: Terminate button not rendered
  → Even if user hits API directly:
    POST /api/contracts/abc/terminate (status='active' or 'expiring')
    → 400 { error: 'Cannot terminate a contract with status "active"' }
```

### Flow E: Terminated Contract — Navigation to Detail Page

```
[/contracts/C06576/detail] — Contract status is 'terminated'
  Shows red banner: "This contract was terminated on 06 Apr 2026 by user@example.com"
  No Renew button
  No Terminate button
  History icon visible (contract has chain links)
  No signature progress section shown (no signers active)
  Documents tab still works → view PDF read-only
```

---

## 12. Validation Summary Table

| Validation | Layer | Details |
|---|---|---|
| Only `expired` can be terminated (not `expiring`) | API + UI | API returns 400; UI only shows button for `expired` status |
| Cannot terminate if renewal in progress | API + UI | API returns 409; UI hides Terminate button AND Renew button is already hidden — "Renewal in Progress" chip shown instead |
| Termination is permanent (no un-terminate) | By design | No API endpoint to reverse; no UI affordance |
| Cannot renew a terminated contract | Implicitly | Renewal API `renewableStatuses` does not include `terminated` |
| Cannot send terminated contract for signature | Implicitly | Signature flow checks status; terminated is not in eligible statuses |
| `terminatedBy` required in API body | API | Returns 400 if missing |
| Valid ObjectId required | API | Returns 400 if invalid |
| Contract must exist | API | Returns 404 if not found |
| Terminated contracts hidden from /contracts | Client-side filter | `CONTRACT_PAGE_STATUSES` does not include `terminated` |
| Terminated contracts only on /terminated | By page filter | `c.status === ContractStatus.TERMINATED` filter |
| History panel accessible on terminated | Allowed | History button shown on terminated cards and detail pages |
| No actions on terminated cards | Client-side | `variant='terminated'` suppresses all buttons except History |

---

## 13. Files to Create (New)

| File | Purpose |
|------|---------|
| `src/app/api/contracts/[id]/terminate/route.ts` | POST endpoint for termination |
| `src/app/terminated/page.tsx` | Terminated contracts listing page |
| `src/components/contracts/TerminateContractDialog.tsx` | Confirmation dialog |

---

## 14. Files to Modify (Existing)

| File | Changes |
|------|---------|
| `src/types/contract.ts` | Add `TERMINATED` to enum; add `terminatedAt`, `terminatedBy` to interface |
| `src/components/contracts/ContractCard.tsx` | Add `terminated` variant; `onTerminate`/`onHistory` props; status label/color; action buttons |
| `src/components/contracts/ContractHistoryPanel.tsx` | Add `terminated` to `STATUS_CONFIG` |
| `src/app/contracts/page.tsx` | Add terminate handler, state, `TerminateContractDialog` |
| `src/app/contracts/[id]/page.tsx` | Terminate button in banner; terminated banner; extend History condition; `TerminateContractDialog` |
| `src/components/layout/Sidebar.tsx` | Add "Terminated" nav item |

---

## 15. What Does NOT Change

- Renewal flow — entirely unchanged
- History panel chain-walking logic — unchanged (chain links preserved on terminated contracts)
- PDF viewer — unchanged (read-only viewing still works via existing routes)
- `/api/file/[id]` route — unchanged
- Auto-advance workflow (`autoAdvance.ts`) — unchanged
- Email/notification system — no emails sent on termination
- MongoDB — no migration needed (schemaless, optional new fields)
- Signing flow — signing cannot be initiated on terminated contracts (status check)
- Draft page — terminated contracts never appear there (they were never drafts)

---

## 16. Implementation Order

```
Step 1 — src/types/contract.ts
         Add TERMINATED to enum + terminatedAt/terminatedBy to interface
         (Dependency: everything else compiles against this)

Step 2 — src/app/api/contracts/[id]/terminate/route.ts
         New POST handler — can be tested independently via curl

Step 3 — src/components/contracts/TerminateContractDialog.tsx
         New dialog component — no page dependencies

Step 4 — src/components/contracts/ContractCard.tsx
         Add terminated variant, onTerminate prop, action button changes

Step 5 — src/components/contracts/ContractHistoryPanel.tsx
         Add 'terminated' to STATUS_CONFIG — small, safe change

Step 6 — src/app/contracts/page.tsx
         Wire handleTerminateContract + TerminateContractDialog

Step 7 — src/app/contracts/[id]/page.tsx
         Add Terminate button, terminated banner, extend History condition

Step 8 — src/app/terminated/page.tsx
         New page — builds on all components being ready

Step 9 — src/components/layout/Sidebar.tsx
         Add nav item — purely additive, no risk
```
