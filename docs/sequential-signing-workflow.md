# Sequential Multi-Party Signing Workflow

**System:** Contract Management System  
**Module:** Multi-Party Signature Flow  
**Scope:** `externalSignatureService.ts` · `autoAdvance.ts` · `internal-sign/route.ts` · `sign-requests/[token]/complete/route.ts` · External signing page

---

## 1. Overview

The sequential signing workflow allows a contract to be signed by multiple parties — both internal users (employees on the platform) and external clients (signers outside the system) — in a defined order. When all parties at the current signing order complete their fields, the system automatically unlocks the parties at the next order and notifies external signers by email. This continues until all orders are done, at which point the contract is marked fully completed.

The feature replaces a manual "Unlock Next Order" button that previously required the contractor to intervene after each signing round.

---

## 2. Core Data Model

All signing state is stored in the `contracts` MongoDB collection alongside the contract document.

### 2.1 Signer Arrays

```typescript
// One entry per party assignment for internal users
interface InternalSigner {
    userId?: string;      // Platform user ID
    email: string;        // User's email
    name?: string;
    partyId: string;      // Which document party they fill
    partyLabel: string;
    order: number;        // Signing order (1, 2, 3 …)
    status: 'pending' | 'unlocked' | 'completed';
    assignedAt: string;
    unlockedAt?: string;
    completedAt?: string;
}

// One entry per party assignment for external clients
interface ExternalSigner {
    email: string;
    name?: string;
    partyId: string;      // Which document party they fill
    partyLabel: string;
    order: number;        // Signing order (1, 2, 3 …)
    token: string;        // Unique token for the signing URL
    status: 'pending' | 'unlocked' | 'viewed' | 'completed';
    sentAt: string;
    unlockedAt?: string;
    viewedAt?: string;
    completedAt?: string;
}
```

### 2.2 Flow Control Fields

| Field | Type | Purpose |
|---|---|---|
| `signatureFlowStatus` | `'draft' \| 'pending_signatures' \| 'all_completed' \| 'finalized'` | Macro-level state of the entire flow |
| `currentSigningOrder` | `number \| null` | The order number currently being processed; `null` after all done |
| `version` | `number` | Monotonically increasing counter for optimistic locking |

### 2.3 Party Completions

`partyCompletions[]` is a parallel tracking array — one entry per party — that records who was assigned, what order they belong to, and whether they have completed:

```typescript
{
    partyId: string;
    partyLabel: string;
    order?: number;
    assigneeType?: 'internal' | 'external' | 'contractor';
    assigneeEmail?: string;
    status: 'pending' | 'unlocked' | 'completed';
    completedBy?: string;
    completedByName?: string;
    completedAt?: string;
    isContractor?: boolean;
}
```

### 2.4 Signature Requests Collection

The separate `signature_requests` MongoDB collection stores one document per external signer, keyed by a unique `token`. Fields relevant to the workflow:

| Field | Purpose |
|---|---|
| `token` | URL-safe unique identifier; forms the external signing URL `/sign/[token]` |
| `contractId` | Reference to the parent contract |
| `assignedParty` | The `partyId` the signer must fill |
| `contractVersion` | Snapshot of `contract.version` at time of creation; used for optimistic locking |
| `status` | `'pending' \| 'viewed' \| 'signed' \| 'expired' \| 'cancelled'` |
| `savedXfdf` | XFDF saved during auto-save progress |

---

## 3. Workflow Initialization

When the contractor sends the contract for signing through the **"Assign Signers" dialog**, the function `sendMixedSignatureRequests()` in `src/services/externalSignatureService.ts` sets up the initial state.

### 3.1 Signer Assignment

Each signer is assigned to:
- One document **party** (e.g., "Client A", "Witness")
- A **type**: `internal` (platform user) or `external` (client)
- A **signing order**: integer starting from 1

### 3.2 Unlock Determination at Start

The first order to be active is determined by `effectiveCurrentOrder`:

```typescript
const minOrder = Math.min(...assignments.map(a => a.order));

const effectiveCurrentOrder = isFirstBatch
    ? minOrder           // First assignment: start at the lowest order
    : (contract.currentSigningOrder ?? minOrder);  // Subsequent: preserve pointer

const shouldUnlock = (order: number) => order === effectiveCurrentOrder;
```

- Signers at `effectiveCurrentOrder` receive `status: 'unlocked'` immediately and are emailed.
- Signers at higher orders receive `status: 'pending'` and are **not** emailed yet.

### 3.3 Contract Update

After creating all `signature_requests` records and sending first-round emails, the contract is patched with:

```typescript
{
    status: 'waiting_for_signature',
    signatureFlowStatus: 'pending_signatures',
    currentSigningOrder: effectiveCurrentOrder,
    internalSigners: [...existing, ...new],
    externalSigners: [...existing, ...new],
    partyCompletions: [...merged],
}
```

---

## 4. Signer Flow — Who Signs How

### 4.1 Internal Signers

Internal signers see pending contracts on the **Signatures page** (`/signatures`). Their entry appears in the list when their `status` is `'unlocked'`. They:
1. Click the contract to open `DocumentViewerDialog`
2. Fill the fields assigned to their party
3. Click **Submit** — triggers `POST /api/contracts/[id]/internal-sign`

### 4.2 External Signers

External signers receive an email containing a tokenised URL `https://…/sign/[token]`. They:
1. Open the link (no login required)
2. Fill the fields assigned to their party
3. Click **Submit** — triggers `PUT /api/sign-requests/[token]/complete`

---

## 5. Completion Routes

Two separate API routes handle signer completion. Both follow the same pattern: mark the signer done, then call `autoAdvanceWorkflow`.

### 5.1 `POST /api/contracts/[id]/internal-sign`

**File:** `src/app/api/contracts/[id]/internal-sign/route.ts`

| Step | Action |
|---|---|
| 1 | Validate: find the matching `InternalSigner` with `status === 'unlocked'` |
| 2 | Set signer `status → 'completed'`, record `completedAt` |
| 3 | Update corresponding `partyCompletions` entry |
| 4 | Save PDF (binary + base64), XFDF, merged `fieldValues`, merged `formFields` |
| 5 | Increment `contract.version` |
| 6 | **Sync version** to all pending `signature_requests` for this contract (prevents future VERSION_MISMATCH for other signers) |
| 7 | Call `autoAdvanceWorkflow(db, contractId)` |
| 8 | Include `unlockedExternalSigners` in the JSON response |

The response is then consumed by `signatures/page.tsx`, which calls `sendSignatureRequestEmail()` for each newly unlocked external signer.

### 5.2 `PUT /api/sign-requests/[token]/complete`

**File:** `src/app/api/sign-requests/[token]/complete/route.ts`

Handles both **auto-save** (progress checkpoint) and **final submit** modes, controlled by the `isAutoSave` FormData field.

#### Auto-Save Path

- Updates `signature_requests` with `lastSavedAt`, `savedXfdf`, and syncs `contractVersion`
- Saves PDF + XFDF to the contract **without** incrementing `version` or touching signer statuses
- Returns `{ success: true, message: 'Progress saved' }` — no auto-advance triggered

#### Final Submit Path

| Step | Action |
|---|---|
| 1 | Verify token and that request is still `'pending'` |
| 2 | **Version check** (optimistic locking): reject with `409 VERSION_MISMATCH` if `request.contractVersion ≠ contract.version` |
| 3 | Mark `signature_requests.status → 'signed'` |
| 4 | Save PDF (binary + base64), XFDF, merged `fieldValues`, merged `formFields` |
| 5 | Update matching `ExternalSigner.status → 'completed'` |
| 6 | Update `partyCompletions` for the signer's party |
| 7 | Increment `contract.version` |
| 8 | Sync new version to all **other** pending `signature_requests` |
| 9 | Call `autoAdvanceWorkflow(db, contractId)` |
| 10 | Include `unlockedExternalSigners` in the JSON response |

The response is consumed by `src/app/sign/[token]/page.tsx`, which sends emails to newly unlocked external signers.

---

## 6. Auto-Advance Engine

**File:** `src/lib/workflow/autoAdvance.ts`  
**Function:** `autoAdvanceWorkflow(db: Db, contractId: string): Promise<AutoAdvanceResult>`

This is the core of the sequential automation. It is called server-side immediately after any signer completes. It reads **fresh state from MongoDB** — never using in-memory data from the calling route — to ensure correctness when multiple signers at the same order complete close in time.

### 6.1 Return Type

```typescript
interface AutoAdvanceResult {
    advanced: boolean;                    // Whether an order transition occurred
    newlyUnlockedExternal: UnlockedExternalSigner[];  // Signers who need emails
}
```

```typescript
interface UnlockedExternalSigner {
    email: string;
    token: string;
    name: string;
    partyLabel: string;
}
```

### 6.2 Decision Logic (Step by Step)

```
1. Load latest contract from MongoDB (exclude pdf binaries for speed)
   │
   ├── Contract not found → return { advanced: false, [] }
   ├── Already 'all_completed' or 'finalized' → return { advanced: false, [] }
   └── No currentSigningOrder → return { advanced: false, [] }

2. Filter signers at currentSigningOrder
   internalAtOrder = internalSigners.filter(s => s.order === currentOrder)
   externalAtOrder = externalSigners.filter(s => s.order === currentOrder)

3. Check completeness
   allInternalDone = internalAtOrder.every(s => s.status === 'completed')
   allExternalDone = externalAtOrder.every(s => s.status === 'completed')

   ├── Not all done → return { advanced: false, [] }
   └── All done → proceed to step 4

4. Find next order
   allOrders = unique sorted union of all internal + external orders
   nextOrder = first order > currentOrder

   ├── No next order → mark contract 'all_completed' + status 'signed_by_everyone'
   │       currentSigningOrder = null
   │       return { advanced: true, [] }
   │
   └── Next order found → unlock signers at nextOrder

5. Unlock signers at nextOrder
   - internalSigners: pending → unlocked (set unlockedAt)
   - externalSigners: pending → unlocked (set unlockedAt)
   - partyCompletions: pending → unlocked
   - contract.currentSigningOrder = nextOrder
   - Atomic $set update to MongoDB

6. Collect and return newly unlocked external signers
   → Used by calling route to send emails client-side
```

### 6.3 Fault Isolation

`autoAdvanceWorkflow` is always called inside a `try/catch` in both API routes:

```typescript
try {
    const advanceResult = await autoAdvanceWorkflow(db, id);
    unlockedExternalSigners = advanceResult.newlyUnlockedExternal;
} catch (advanceError) {
    // Auto-advance failure must never fail the signing response
    console.error('Auto-advance error (non-fatal):', advanceError);
}
```

A failure in auto-advance does **not** roll back the signer's completion. The signer's record remains `'completed'`. The contractor can still use the manual unlock fallback (the `POST /api/contracts/[id]/unlock-order` endpoint) if needed.

---

## 7. Email Notification Strategy

External signers at newly unlocked orders are notified by email. The architecture deliberately separates "who to notify" from "sending the email":

| Responsibility | Location |
|---|---|
| Determine newly unlocked signers | `autoAdvanceWorkflow` — server-side |
| Return signer list to client | API route JSON response (`unlockedExternalSigners`) |
| Send emails | Client-side (`sendSignatureRequestEmail` via `@emailjs/browser`) |

**Why client-side emails?**  
The app uses EmailJS for all transactional email. The `@emailjs/browser` SDK requires a browser context and uses a public key embedded in environment variables. Running EmailJS server-side would expose credentials in the server bundle. The client receives the list of signers who need emails and fires them off asynchronously after the save response succeeds.

```typescript
// In signatures/page.tsx and sign/[token]/page.tsx
if (result.unlockedExternalSigners?.length > 0) {
    for (const signer of result.unlockedExternalSigners) {
        sendSignatureRequestEmail({
            to_email: signer.email,
            contract_title: ...,
            sender_name: ...,
            sent_date: ...,
            expiry_date: ...,
            signing_url: `${baseUrl}/sign/${signer.token}`,
        });
    }
}
```

Email delivery is fire-and-forget (`.then()`/`.catch()` with logging only). Email failure does not block the signing flow.

---

## 8. Optimistic Locking (Version Control)

Multiple external signers may be editing the same PDF concurrently (different parties, same order). To prevent one party's save from silently overwriting another's:

1. At assignment time, each `signature_request` records `contractVersion = contract.version`
2. On **final submit**, the route compares `signRequest.contractVersion` vs the current `contract.version`
3. If they differ: `409 CONFLICT` is returned with `code: 'VERSION_MISMATCH'`
4. After a successful save, `contract.version` is incremented
5. All **other** pending `signature_requests` for the same contract are immediately updated to the new version

This ensures that if Party A and Party B are both at order 1, and A submits first, B's pending request gets the updated version number so B can still submit without a conflict error.

---

## 9. Contract Status State Machine

```
draft
  │
  └─ Contractor assigns signers (externalSignatureService)
       │
       ▼
pending_signatures          (signatureFlowStatus)
waiting_for_signature       (ContractStatus)
       │
       ├─ Each signer at order N completes
       │       │
       │       ▼
       │  autoAdvanceWorkflow checks order N
       │       │
       │       ├─ Not all done → wait
       │       │
       │       └─ All done + next order exists → unlock order N+1
       │               └─ loop
       │
       └─ All done + no next order
               │
               ▼
         all_completed           (signatureFlowStatus)
         signed_by_everyone      (ContractStatus)
               │
               └─ Contractor clicks Finalize
                       │
                       ▼
                  finalized              (signatureFlowStatus)
```

---

## 10. Signer Status Transitions

### Internal Signer

```
pending → unlocked → completed
           ↑              ↑
  (auto-advance     (POST /internal-sign)
   or initial
   assignment)
```

### External Signer

```
pending → unlocked → viewed → completed
           ↑           ↑          ↑
  (auto-advance    (link       (PUT /complete
   or initial       opened)     final submit)
   assignment)
```

The `viewed` transition happens when the external signer opens their signing link. It is recorded on the `signature_request` document but does not affect order progression.

---

## 11. Concurrent Completion Handling

When multiple signers share the same order (e.g., two parties at order 1), each signer's completion independently calls `autoAdvanceWorkflow`. The engine handles this safely because:

1. It reads fresh state from MongoDB every time
2. It checks ALL signers at the current order before advancing
3. If only Signer A has completed, the check `allInternalDone && allExternalDone` fails and the engine returns early
4. Only the last signer to complete will see all statuses as `'completed'` and trigger the advance

This means `autoAdvanceWorkflow` is idempotent for a given signing order — calling it multiple times is safe because after the first advance it reads `currentSigningOrder = nextOrder` and the prior order's check no longer applies.

---

## 12. Full Data Flow — Order Transition

```
Signer completes their fields
       │
       ▼
API Route (internal-sign or sign-requests/complete)
       │
       ├── 1. Validate signer is unlocked
       ├── 2. Mark signer status → 'completed'
       ├── 3. Save PDF, XFDF, fieldValues, formFields
       ├── 4. Increment contract.version
       ├── 5. Sync version → other pending signature_requests
       │
       ├── 6. Call autoAdvanceWorkflow(db, contractId)
       │           │
       │           ├── Load fresh contract state
       │           ├── Check: all signers at currentOrder done?
       │           │       │
       │           │       ├── No  → return { advanced: false, [] }
       │           │       │
       │           │       └── Yes → nextOrder?
       │           │                   │
       │           │                   ├── Yes → unlock nextOrder signers
       │           │                   │           return { advanced: true, [external list] }
       │           │                   │
       │           │                   └── No → mark all_completed
       │           │                           return { advanced: true, [] }
       │           │
       │           └── Return UnlockedExternalSigner[]
       │
       └── 7. Return response { success, unlockedExternalSigners }

Client receives response
       │
       └── For each signer in unlockedExternalSigners:
               sendSignatureRequestEmail(signer)
               → Signer receives email with unique signing URL
```

---

## 13. Key Files

| File | Role |
|---|---|
| `src/lib/workflow/autoAdvance.ts` | Core engine — checks order completion, advances state |
| `src/app/api/contracts/[id]/internal-sign/route.ts` | Handles internal user signing completion |
| `src/app/api/sign-requests/[token]/complete/route.ts` | Handles external signer completion (auto-save + final submit) |
| `src/services/externalSignatureService.ts` | Initialises signers and first-round emails at assignment time |
| `src/types/contract.ts` | Type definitions for `InternalSigner`, `ExternalSigner`, `SignatureFlowStatus` |
| `src/app/signatures/page.tsx` | Internal signer UI; sends unlocked-external emails after internal-sign |
| `src/app/sign/[token]/page.tsx` | External signing page; sends unlocked-external emails after sign-complete |
| `src/app/api/contracts/[id]/unlock-order/route.ts` | Manual fallback for contractor to force-unlock an order |
