# Review & Approval Workflow

**Document Type:** Technical Reference  
**System:** Contract Management System (CMS)  
**Module:** Review & Approval Pipeline  
**Frontend Stack:** Next.js 16 · React 19 · TypeScript · MUI v7  
**Backend:** Spring Boot REST API (`localhost:8080`) — proxied via `/api/backend/*`  
**Auth:** JWT (resolved by backend from `Authorization` header on every action call)  
**Status:** Production  
**Last Updated:** 2026-06-11

---

## Table of Contents

1. [Overview](#1-overview)
2. [Workflow Modes](#2-workflow-modes)
3. [Data Models](#3-data-models)
   - 3.1 [ReviewerInfo (Backend)](#31-reviewerinfo-backend)
   - 3.2 [ApproverInfo (Backend)](#32-approverinfo-backend)
   - 3.3 [ModificationRequest](#33-modificationrequest)
   - 3.4 [ContractResponse Fields](#34-contractresponse-fields)
   - 3.5 [Frontend Contract Type](#35-frontend-contract-type)
4. [Contract Status Lifecycle](#4-contract-status-lifecycle)
   - 4.1 [Status Values](#41-status-values)
   - 4.2 [Status Transition Diagram](#42-status-transition-diagram)
5. [Per-Actor Status Values](#5-per-actor-status-values)
6. [Backend API Endpoints](#6-backend-api-endpoints)
7. [Frontend Architecture](#7-frontend-architecture)
   - 7.1 [Service Layer](#71-service-layer)
   - 7.2 [HTTP Client](#72-http-client)
8. [Contractor Flow — Submitting for Review](#8-contractor-flow--submitting-for-review)
   - 8.1 [RequestReviewDialog — Sections](#81-requestreviewdialog--sections)
   - 8.2 [Workflow Mode Selection](#82-workflow-mode-selection)
   - 8.3 [Reviewer Assignment](#83-reviewer-assignment)
   - 8.4 [Approver Assignment](#84-approver-assignment)
   - 8.5 [Validation Rules](#85-validation-rules)
   - 8.6 [Submit Logic](#86-submit-logic)
   - 8.7 [Read-Only Mode](#87-read-only-mode)
9. [Resubmission After Rejection](#9-resubmission-after-rejection)
   - 9.1 [What Can Change](#91-what-can-change)
   - 9.2 [UI Restrictions on Resubmission](#92-ui-restrictions-on-resubmission)
   - 9.3 [Review-Skip Behavior](#93-review-skip-behavior)
10. [Inbox Page — Classification Logic](#10-inbox-page--classification-logic)
    - 10.1 [Data Loading](#101-data-loading)
    - 10.2 [Role Determination — getCallerRole()](#102-role-determination--getcallerrole)
    - 10.3 [Inbox Tab (Pending Actions)](#103-inbox-tab-pending-actions)
    - 10.4 [Sendbox Tab (Completed Actions)](#104-sendbox-tab-completed-actions)
    - 10.5 [Local State Update After Action](#105-local-state-update-after-action)
    - 10.6 [File URL Resolution](#106-file-url-resolution)
11. [Reviewer Flow](#11-reviewer-flow)
    - 11.1 [ReviewConfirmationDialog — Optional Message](#111-reviewconfirmationdialog--optional-message)
    - 11.2 [Mark as Reviewed](#112-mark-as-reviewed)
    - 11.3 [Forward for Further Review](#113-forward-for-further-review)
    - 11.4 [Reject (as Reviewer)](#114-reject-as-reviewer)
12. [Approver Flow](#12-approver-flow)
    - 12.1 [Approve Contract — Confirmation Dialog](#121-approve-contract--confirmation-dialog)
    - 12.2 [Reject (as Approver)](#122-reject-as-approver)
13. [ReviewApprovalCard — UI Logic](#13-reviewapprovalcard--ui-logic)
    - 13.1 [Status Chip Labels & Colors](#131-status-chip-labels--colors)
    - 13.2 [Action Button Visibility Rules](#132-action-button-visibility-rules)
    - 13.3 [Rejection Reason Input (Inline)](#133-rejection-reason-input-inline)
    - 13.4 [Assigned for Review & Approve Tooltip](#134-assigned-for-review--approve-tooltip)
14. [FurtherReviewDialog](#14-furtherreviewdialog)
15. [Edge Cases & Guards](#15-edge-cases--guards)
16. [File Reference](#16-file-reference)

---

## 1. Overview

The Review & Approval workflow is a mandatory gate that a contract must pass through before it can proceed to the signature stage. Once a contractor submits a contract for review and/or approval, the workflow is **fully owned by the Spring Boot backend** — the frontend only calls REST endpoints and renders the resulting state.

### High-Level Flow

```
Contractor creates contract (DRAFT)
  │
  └── Submits for Review/Approval (selects WorkflowMode + assigns reviewers/approver)
        │
        ├── ONLY_REVIEW ──────────────────────────────────────────────────────────────────────┐
        │     Each Reviewer: reviews / forwards / rejects                                     │
        │     When ALL reviewers done → READY_FOR_SIGNATURE                                   │
        │                                                                                     │
        ├── ONLY_APPROVE ─────────────────────────────────────────────────────────────────────┤
        │     Approver: approves / rejects                                                    │
        │     Approve → READY_FOR_SIGNATURE                                                   │
        │                                                                                     │
        └── REVIEW_AND_APPROVE ──────────────────────────────────────────────────────────────┘
              Each Reviewer: reviews / forwards / rejects
              When ALL reviewers done → IN_APPROVAL
              Approver: approves / rejects
              Approve → READY_FOR_SIGNATURE
```

### Key Design Principles

- **Backend owns all state.** Every status transition is performed by the Spring Boot API. The frontend never computes new statuses — it only reads what the backend returns.
- **JWT-resolved actor identity.** All action endpoints (`/review/complete`, `/approval/approve`, etc.) resolve the actor from the JWT token. The frontend does **not** pass email addresses in action payloads.
- **Inbox driven by backend.** The inbox endpoint (`GET /contracts/inbox`) returns only contracts where the authenticated user has a pending action. The frontend classifies by role using data in the response.
- **Optimistic local state.** After every action, the backend returns the full updated `ContractResponse`. The frontend merges it into local state immediately — no full re-fetch needed.
- **Modification requests are append-only.** Every rejection is stored permanently in `modificationRequests[]`. History is never deleted.
- **All user fetches use httpClient.** `userService.getAllUsers()` and `authService.getAllRegisteredUsers()` both call Spring Boot's `/users` endpoint through `httpClient` (not the old internal `/api/users` route).

---

## 2. Workflow Modes

Three modes are available, selected by the contractor when submitting. The mode is set in the `ToggleButtonGroup` in `RequestReviewDialog`.

| Mode | Value | Reviewer Phase | Approval Phase | Skip Condition |
|---|---|---|---|---|
| Review Only | `ONLY_REVIEW` | Required — all reviewers must complete | None | — |
| Review & Approve | `REVIEW_AND_APPROVE` | Required — all reviewers must complete | Required — approver acts after all reviewers done | If rejected by approver and resubmitted, review phase is skipped |
| Approve Only | `ONLY_APPROVE` | None | Required — approver acts immediately | — |

### Mode Rules

- Once submitted, **the mode is permanently frozen**. The backend returns `400` if the mode field changes on resubmission.
- The frontend enforces this by disabling the mode `ToggleButtonGroup` during resubmission (`modeIsLocked === true`).
- A contract's `workflowMode` field in the response always reflects the originally chosen mode.

---

## 3. Data Models

### 3.1 ReviewerInfo (Backend)

Defined in Spring Boot as `ReviewerInfo.java`. Serialised into `ContractResponse.reviewers[]`.

```typescript
// Frontend mapping (src/types/contract.ts)
interface ReviewerInfo {
    email: string;
    status: 'pending' | 'reviewed' | 'forwarded' | 'rejected';
    reviewedAt?: string;          // ISO-8601 — set when status → reviewed
    rejectedAt?: string;          // ISO-8601 — set when status → rejected
    comments?: string;            // Reviewer's notes (on rejection)
    submissionMessage?: string;   // Message from contractor at assignment time
    sentAt?: string;              // ISO-8601 — when the review request was sent
    sentBy?: string;              // Email of contractor who assigned this reviewer
}
```

**Status semantics:**

| Status | Meaning | Action Buttons Shown |
|---|---|---|
| `pending` | Reviewer has not acted yet | Mark as Reviewed, Reject |
| `reviewed` | Reviewer completed their review | None (action done) |
| `forwarded` | Reviewer forwarded to additional reviewer(s) | None (action done) |
| `rejected` | Reviewer rejected the contract | None (action done) |

> **Note:** `forwarded` and `reviewed` are both treated as "action complete" on the frontend. Both display as "Reviewed" on card chips. The distinction is only visible inside the Assigned for Review & Approve tooltip.

---

### 3.2 ApproverInfo (Backend)

Defined in Spring Boot as `ApproverInfo.java`. Serialised into `ContractResponse.approver`.

```typescript
// Frontend mapping (src/types/contract.ts)
interface ApproverInfo {
    email: string;
    status: 'pending' | 'approved' | 'rejected';
    approvedAt?: string;          // ISO-8601 — set when status → approved
    rejectedAt?: string;          // ISO-8601 — set when status → rejected
    comments?: string;            // Approver's notes (on rejection)
    submissionMessage?: string;   // Message from contractor at assignment time
    sentAt?: string;              // ISO-8601 — when the approval request was sent
    sentBy?: string;              // Email of contractor who assigned this approver
}
```

---

### 3.3 ModificationRequest

Stored as an append-only array on the contract. Every rejection creates a new entry — entries are never deleted.

```typescript
interface ModificationRequest {
    requestedBy: string;                                         // Email of the person who rejected
    role: 'reviewer' | 'approver' | 'contractor';              // Their role at time of rejection
    message: string;                                             // Rejection reason / feedback  ← field is "message" not "comments"
    requestedAt: string;                                         // ISO-8601 timestamp
}
```

> **Important:** The field name is `message` (not `comments`). The old frontend code used `request.comments`; the new code uses `request.message`. This aligns with the Spring Boot model.

---

### 3.4 ContractResponse Fields

The Spring Boot backend returns a `ContractResponse` object. Key fields relevant to the review/approval workflow:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Contract identifier |
| `status` | `string` | Overall contract lifecycle status (see Section 4.1) |
| `workflowMode` | `WorkflowMode` | Frozen mode chosen at submission |
| `reviewers` | `ReviewerInfo[]` | All reviewers with per-reviewer status |
| `approver` | `ApproverInfo \| null` | Single assigned approver |
| `reviewStatus` | `ReviewStatus` | Aggregate review phase status |
| `approvalStatus` | `ApprovalStatus` | Aggregate approval phase status |
| `modificationRequests` | `ModificationRequest[]` | Full history of rejections |
| `fileUploaded` | `boolean` | When `true`, file is in MinIO — use presigned URL to view |

> **Inbox endpoint note:** `GET /contracts/inbox` returns the full `ContractResponse` including `reviewers[]` and `approver{}`. This is required for per-role classification on the frontend.

---

### 3.5 Frontend Contract Type

```typescript
// src/types/contract.ts

export type WorkflowMode = 'ONLY_REVIEW' | 'ONLY_APPROVE' | 'REVIEW_AND_APPROVE';
export type ReviewStatus  = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Contract {
    id: string;
    title: string;
    status: ContractStatus;
    workflowMode?: WorkflowMode;
    reviewers?: ReviewerInfo[];
    approver?: ApproverInfo;
    modificationRequests?: ModificationRequest[];
    fileUploaded?: boolean;         // true = MinIO-stored, requires presigned URL
    reviewStatus?: ReviewStatus;
    approvalStatus?: ApprovalStatus;
    // ... other fields
}
```

---

## 4. Contract Status Lifecycle

### 4.1 Status Values

```typescript
// src/types/contract.ts
enum ContractStatus {
    DRAFT                 = 'DRAFT',
    IN_REVIEW             = 'IN_REVIEW',
    IN_APPROVAL           = 'IN_APPROVAL',
    READY_FOR_SIGNATURE   = 'READY_FOR_SIGNATURE',
    IN_SIGNATURE          = 'IN_SIGNATURE',         // formerly WAITING_FOR_SIGNATURE
    SIGNED_BY_EVERYONE    = 'SIGNED_BY_EVERYONE',
    SIGNED                = 'SIGNED',
    ACTIVE                = 'ACTIVE',
    EXPIRING              = 'EXPIRING',
    EXPIRED               = 'EXPIRED',
    TERMINATED            = 'TERMINATED',
    REJECTED_BY_REVIEWER  = 'REJECTED_BY_REVIEWER',
    REJECTED_BY_APPROVER  = 'REJECTED_BY_APPROVER',
}
```

**Removed statuses** (old MongoDB-era values no longer used):

| Removed | Replaced by |
|---|---|
| `REVIEW_APPROVAL` | `IN_REVIEW` / `IN_APPROVAL` |
| `REVIEWED` | per-reviewer `ReviewerInfo.status === 'reviewed'` |
| `APPROVED` | `READY_FOR_SIGNATURE` (approval → immediately ready) |
| `WAITING_FOR_SIGNATURE` | `IN_SIGNATURE` |

### 4.2 Status Transition Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   DRAFT                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
         │                     │                              │
   [ONLY_REVIEW]        [REVIEW_AND_APPROVE]           [ONLY_APPROVE]
   reviewers assigned   reviewers + approver assigned   approver only
         │                     │                              │
         ▼                     ▼                              ▼
    IN_REVIEW             IN_REVIEW                     IN_APPROVAL
         │                     │                              │
    [all reviewed]        [all reviewed]               [approve]   [reject]
         │                     │                         │               │
         ▼                     ▼                         ▼               ▼
  READY_FOR_SIGNATURE    IN_APPROVAL          READY_FOR_SIGNATURE  REJECTED_BY_APPROVER
                              │                                         │
                     [approve]   [reject]                         [resubmit → IN_APPROVAL]
                         │           │                                  (review skipped)
                         ▼           ▼
              READY_FOR_SIGNATURE  REJECTED_BY_APPROVER
                         │
                [submitForSignature]
                         │
                    IN_SIGNATURE
                         │
                [all signers complete]
                         │
                SIGNED_BY_EVERYONE → ACTIVE


── Rejection re-entry paths ──────────────────────────────────────────────────────

  REJECTED_BY_REVIEWER ──[resubmit, new reviewers]──► IN_REVIEW
  REJECTED_BY_APPROVER ──[resubmit]─────────────────► IN_APPROVAL  (REVIEW_AND_APPROVE: review skipped)
                                                     ► IN_APPROVAL  (ONLY_APPROVE: direct)

── Reviewer-level events (do NOT change contract status) ─────────────────────────

  IN_REVIEW:
    reviewer.status: pending ──[review/complete]──► reviewed
    reviewer.status: pending ──[review/forward]───► forwarded  (new reviewers added, stay IN_REVIEW)
    reviewer.status: pending ──[review/reject]────► rejected   → contract: REJECTED_BY_REVIEWER
```

---

## 5. Per-Actor Status Values

These are individual statuses on `ReviewerInfo.status` and `ApproverInfo.status` — distinct from the overall contract `status`.

### Reviewer Status Flow

```
pending ──[POST /contracts/{id}/review/complete]──► reviewed
pending ──[POST /contracts/{id}/review/forward]───► forwarded   (+ new reviewers added to contract)
pending ──[POST /contracts/{id}/review/reject]────► rejected    (+ contract → REJECTED_BY_REVIEWER)
```

### Approver Status Flow

```
pending ──[POST /contracts/{id}/approval/approve]──► approved   (+ contract → READY_FOR_SIGNATURE)
pending ──[POST /contracts/{id}/approval/reject]───► rejected   (+ contract → REJECTED_BY_APPROVER)
```

---

## 6. Backend API Endpoints

All calls go through `httpClient` in `src/lib/httpClient.ts` which injects the JWT `Authorization` header automatically.

| Method | Path | Actor from | Payload | Frontend service method |
|---|---|---|---|---|
| `POST` | `/contracts/{id}/submit` | — (contractor only) | `{ mode, reviewerEmails?, approverEmail?, reviewerMessage?, approverMessage? }` | `contractService.submitForWorkflow()` |
| `GET` | `/contracts/inbox` | JWT | — | `contractService.getInboxContracts()` |
| `GET` | `/contracts/{id}` | — | — | `apiService.getContractDetails()` |
| `POST` | `/contracts/{id}/review/complete` | JWT | `{ comments? }` | `contractService.markAsReviewed()` |
| `POST` | `/contracts/{id}/review/forward` | JWT | `{ additionalReviewerEmails, message? }` | `contractService.addAdditionalReviewers()` |
| `POST` | `/contracts/{id}/review/reject` | JWT | `{ message }` (required) | `contractService.rejectByReviewer()` |
| `POST` | `/contracts/{id}/approval/approve` | JWT | `{ comments? }` | `contractService.approveContract()` |
| `POST` | `/contracts/{id}/approval/reject` | JWT | `{ message }` (required) | `contractService.rejectByApprover()` |
| `GET` | `/contracts/{id}/file/view-url` | — | — | `apiService.getContractViewUrl()` |
| `GET` | `/users` | JWT | — | `userService.getAllUsers()` · `authService.getAllRegisteredUsers()` |

### Response Contract

Every action endpoint (`/review/complete`, `/review/forward`, `/review/reject`, `/approval/approve`, `/approval/reject`) returns the **full updated `ContractResponse`** on success. This includes the freshest `reviewers[]`, `approver{}`, `status`, and `modificationRequests[]`. The frontend merges this into local state via `updateContractInState()`.

### Rejection Message Requirements

`/review/reject` and `/approval/reject` require a non-empty `message` body field. The backend returns `400` if the field is blank. The frontend enforces this with the inline rejection reason input in `ReviewApprovalCard`.

---

## 7. Frontend Architecture

### 7.1 Service Layer

```
contractService.ts          — All review/approval actions + submission
    └── httpClient.ts       — Spring Boot HTTP client (adds JWT header)
    └── apiService.ts       — Higher-level API helpers (detail fetch, file URL, inbox)
        └── httpClient.ts
userService.ts              — User listing (Spring Boot /users via httpClient)
authService.ts              — Session + getAllRegisteredUsers (Spring Boot /users via httpClient)
```

**Key service methods:**

```typescript
// Submit contract for review/approval (initial or resubmit)
// Replaces the old submitForReview() — mode is now required as first param
contractService.submitForWorkflow(contractId, mode, reviewerEmails, approverEmail, reviewerMsg?, approverMsg?)

// Reviewer actions — _email parameter is IGNORED; actor resolved from JWT
contractService.markAsReviewed(contractId, _email, comments?)      // → { success, message, contract? }
contractService.addAdditionalReviewers(contractId, emails[], message?)
contractService.rejectByReviewer(contractId, _email, message)      // message REQUIRED → { success, message, contract? }

// Approver actions — _email parameter is IGNORED; actor resolved from JWT
contractService.approveContract(contractId, _email, comments?)     // → { success, message, contract? }
contractService.rejectByApprover(contractId, _email, message)      // message REQUIRED → { success, message, contract? }

// Inbox
contractService.getInboxContracts()                                 // → Contract[]

// Backward-compat wrapper (kept for call-site compatibility)
contractService.requestModification(contractId, email, role, comments)
    // Delegates to rejectByReviewer or rejectByApprover internally
```

> **Removed methods:** `submitForReview()` (replaced by `submitForWorkflow()`), `removeReviewer()`, `removeApprover()`. These were part of the old MongoDB-direct implementation where the frontend owned workflow state. The Spring Boot backend now owns all of this.

### 7.2 HTTP Client

`src/lib/httpClient.ts` wraps all Spring Boot calls with:
- `Authorization: Bearer <token>` header (JWT from `authService`)
- Base URL pointing to `localhost:8080` (via proxy)
- Returns `{ ok: boolean, data: T | null, message: string }` normalised response

---

## 8. Contractor Flow — Submitting for Review

**File:** [src/components/contracts/RequestReviewDialog.tsx](src/components/contracts/RequestReviewDialog.tsx)

The dialog is opened from the contract list page (context menu) or contract detail page (action button). It serves two purposes:
1. **Initial submission** — select mode, assign reviewers/approver, optionally attach messages
2. **Resubmission after rejection** — with enforced restrictions (see Section 9)

On open, `loadExistingReviewData()` calls `apiService.getContractDetails(contractId)` (NOT the list endpoint — the list endpoint omits `reviewers[]` and `approver{}`). This loads the full `ContractResponse` including `workflowMode`, `reviewers[]`, `approver{}`, and `modificationRequests[]`.

### 8.1 RequestReviewDialog — Sections

```
┌─────────────────────────────────────────────────────────┐
│ Contract: <title>                                        │
├─────────────────────────────────────────────────────────┤
│ [STATUS BANNER] — read-only non-rejection states         │
│   "Currently In Review", "Currently In Approval", etc.   │
├─────────────────────────────────────────────────────────┤
│ [REJECTION BANNER] — when isRejected (merged section)    │
│   "Rejected by Reviewer / Approver"    [resubmit hint]  │
│   ┌── Modification card ──────────────────────────────┐ │
│   │ [REVIEWER] r1@gmail.com              01/06/2026   │ │
│   │ "Please update clause 3..."                        │ │
│   └────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ [VALIDATION ERROR]                                       │
├─────────────────────────────────────────────────────────┤
│ Workflow Type  [🔒 Locked chip]                          │
│ [Review Only] [Review & Approve] [Approve Only]          │
│ (disabled when modeIsLocked)                             │
├─────────────────────────────────────────────────────────┤
│ Assigned Reviewers  [Review Skipped chip / Will be       │
│   replaced chip]                                         │
│   ── Info/Warning alert when applicable ──               │
│   [r1@gmail.com (reviewed)]                              │
│   [r2@gmail.com (pending)]                               │
├─────────────────────────────────────────────────────────┤
│ New Reviewers (or "Add More Reviewers" or "Reviewers")   │
│   [Autocomplete] Message to Reviewers (optional)         │
│   (hidden when isReadOnly / reviewWillBeSkipped)         │
├─────────────────────────────────────────────────────────┤
│ ── Divider ──  (shown only when showApproverSection)     │
├─────────────────────────────────────────────────────────┤
│ Approver  [🔒 Cannot be changed]                         │
│   [approver@gmail.com (pending)]                         │
│   🔒 Same approver will be notified again                │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Workflow Mode Selection

```tsx
<ToggleButtonGroup
    value={workflowMode}
    exclusive
    disabled={modeIsLocked}
    onChange={(_, val) => { if (val && !modeIsLocked) setWorkflowMode(val); }}
>
    <ToggleButton value="ONLY_REVIEW">
        <RateReviewIcon /> Review Only
    </ToggleButton>
    <ToggleButton value="REVIEW_AND_APPROVE">
        <RateReviewIcon /> <ThumbUpIcon /> Review & Approve
    </ToggleButton>
    <ToggleButton value="ONLY_APPROVE">
        <ThumbUpIcon /> Approve Only
    </ToggleButton>
</ToggleButtonGroup>
```

- **First submission:** All three options selectable. Default is `REVIEW_AND_APPROVE`.
- **Read-only state (not rejected):** Mode shown as a read-only `Chip` with icon.
- **Resubmission after rejection:** `disabled={true}` + orange "Locked" chip. Backend enforces this; UI prevents the attempt.

### 8.3 Reviewer Assignment

**Label context (dynamic):**

| State | Label |
|---|---|
| First submission, no existing reviewers | `Reviewers` |
| First submission, existing reviewers present | `Add More Reviewers` |
| Resubmission after reviewer rejection | `New Reviewers (replaces current list)` |

**Filtering — `getAvailableReviewers()`:**

```typescript
const replacingList = contractStatus === ContractStatus.REJECTED_BY_REVIEWER;
// When replacingList === true, existing reviewer emails are allowed back into the pool
// (contractor can re-assign the same person after addressing feedback)
```

Excluded in all cases: current logged-in user, selected approver.
Excluded only when NOT replacing: existing reviewers (to prevent duplicates on initial add).

**Hidden when:** `isReadOnly || reviewWillBeSkipped`

### 8.4 Approver Assignment

- **When no approver is assigned:** Autocomplete shown to select one.
- **When approver already exists:** Displayed as a read-only chip with status.
- **When `approverIsLocked === true`:** Autocomplete hidden entirely. A lock note reads: "Same approver will be notified again — cannot be changed on resubmission".

### 8.5 Validation Rules

```typescript
const needsReviewers = (workflowMode === 'ONLY_REVIEW' || workflowMode === 'REVIEW_AND_APPROVE')
    && (!isRejected || canChangeReviewers);

const needsApprover = workflowMode === 'ONLY_APPROVE' || workflowMode === 'REVIEW_AND_APPROVE';

// Fails if:
if (needsReviewers && selectedReviewers.length === 0) → 'Please select at least one Reviewer'
if (needsApprover && !selectedApprover && !existingApprover) → 'Please select an Approver'
if (selectedApprover && selectedReviewers.map(r => r.email).includes(selectedApprover.email))
    → 'The approver cannot also be a reviewer'
```

### 8.6 Submit Logic

```typescript
// POST /contracts/{id}/submit
const body = {
    mode,                                          // 'ONLY_REVIEW' | 'REVIEW_AND_APPROVE' | 'ONLY_APPROVE'
    reviewerEmails: [...],                         // omitted if ONLY_APPROVE or review skipped
    approverEmail: '...',                          // omitted if ONLY_REVIEW
    reviewerMessage?: '...',
    approverMessage?: '...',
};
```

The `onSubmit` callback signature across all dialog callers:
```typescript
onSubmit: (mode: WorkflowMode, reviewers: string[], approver: string, reviewerMsg?, approverMsg?) => Promise<void>
```

All callers (`ContractsContent`, `CreateContractDialog`, `RenewContractDialog`) were updated to pass `mode` as the first argument and call `contractService.submitForWorkflow()`.

### 8.7 Read-Only Mode

When `contractStatus` is any of:

```typescript
const READ_ONLY_STATUSES: string[] = [
    ContractStatus.IN_REVIEW,
    ContractStatus.IN_APPROVAL,
    ContractStatus.READY_FOR_SIGNATURE,
    ContractStatus.IN_SIGNATURE,
    ContractStatus.SIGNED,
    ContractStatus.SIGNED_BY_EVERYONE,
    ContractStatus.ACTIVE,
];
```

Note: `REJECTED_BY_REVIEWER` and `REJECTED_BY_APPROVER` are **not** in `READ_ONLY_STATUSES` — the dialog is editable in rejected states so the contractor can resubmit.

---

## 9. Resubmission After Rejection

When a contract is rejected, the contractor edits the contract and opens the Request Review dialog again. The dialog pre-loads the existing state and enforces backend-mandated resubmission rules.

### 9.1 What Can Change

| Aspect | Rejected by Reviewer | Rejected by Approver |
|---|---|---|
| Workflow Mode | ❌ Frozen | ❌ Frozen |
| Reviewers | ✅ Fully replaceable (new list) | ❌ Locked (preserved server-side) |
| Approver | ❌ Frozen (same approver notified) | ❌ Frozen (same approver notified) |
| Review phase on resubmit | Runs again with new reviewers | ⏭ Skipped (goes directly to IN_APPROVAL) |

### 9.2 UI Restrictions on Resubmission

```typescript
const isRejected = contractStatus === ContractStatus.REJECTED_BY_REVIEWER
                || contractStatus === ContractStatus.REJECTED_BY_APPROVER;

const isRejectedByReviewer = contractStatus === ContractStatus.REJECTED_BY_REVIEWER;
const isRejectedByApprover = contractStatus === ContractStatus.REJECTED_BY_APPROVER;

const modeIsLocked       = isRejected;
const canChangeReviewers = isRejectedByReviewer;
const approverIsLocked   = isRejected;
const reviewWillBeSkipped = isRejectedByApprover && workflowMode === 'REVIEW_AND_APPROVE';
```

| Element | Condition | Behavior |
|---|---|---|
| Mode toggle | `modeIsLocked` | `disabled={true}` + orange "Locked" chip |
| Reviewer input | `canChangeReviewers` | Label changes to "New Reviewers (replaces current list)" |
| Reviewer input | `reviewWillBeSkipped` | Entire input hidden; "Review Skipped" info chip shown on header |
| Assigned reviewers panel | `reviewWillBeSkipped` | Info alert: "Review was already completed..." |
| Approver autocomplete | `approverIsLocked` | Hidden; existing approver shown as read-only chip with lock note |

### 9.3 Review-Skip Behavior

When mode is `REVIEW_AND_APPROVE` and the contract was rejected by the approver:
- The review phase has already been completed once
- On resubmission, the contract goes **directly to IN_APPROVAL**
- Reviewers are not re-notified; their previous completion is preserved by the backend
- The frontend hides the reviewer input entirely and shows a "Review Skipped" chip on the Assigned Reviewers header

---

## 10. Inbox Page — Classification Logic

**File:** [src/app/inbox/page.tsx](src/app/inbox/page.tsx)

### 10.1 Data Loading

```typescript
// loadContracts() — runs on mount and after each action
const [inboxContracts, ownedContracts] = await Promise.all([
    contractService.getInboxContracts(),    // GET /contracts/inbox — returns full ContractResponse[]
    contractService.getAllContracts(),       // GET /contracts — for signature tasks
]);
```

> **Polling removed.** The previous implementation polled every 15 seconds using a `setInterval`. This has been removed. The inbox updates via `updateContractInState()` after each action, and on page mount.

Signature contracts are sourced from the owned contracts list (filtered by `internalSigners[].email` or `signer.email`). The inbox endpoint is used exclusively for review/approval items.

### 10.2 Role Determination — getCallerRole()

Priority rule: approver check always takes precedence over reviewer check.

```typescript
const isApprover = approver?.email?.toLowerCase() === currentUser.email.toLowerCase();

const myReviewerEntry = !isApprover
    ? reviewers?.find(r => r.email.toLowerCase() === currentUser.email.toLowerCase())
    : undefined;   // Don't search reviewers[] if already identified as approver
```

**Why approver takes priority:** If the same email appeared in both `reviewers[]` and `approver{}` (e.g., error on resubmission), the approver role must take precedence. The backend enforces separation, and the frontend follows the same priority.

### 10.3 Inbox Tab (Pending Actions)

A contract appears in the inbox for a **reviewer** when:
```typescript
myReviewerEntry &&
c.status === ContractStatus.IN_REVIEW &&
myReviewerEntry.status === 'pending'
→ role: 'reviewer'
```

A contract appears in the inbox for an **approver** when:
```typescript
isApprover &&
c.status === ContractStatus.IN_APPROVAL &&
approver!.status === 'pending'
→ role: 'approver'
```

**Fallback** (old response format — no `reviewers[]` / `approver{}`):
```typescript
c.status === IN_REVIEW   → role: 'reviewer'
c.status === IN_APPROVAL → role: 'approver'
```

**Signature items** — condition updated from `WAITING_FOR_SIGNATURE` to `IN_SIGNATURE`:
```typescript
c.signer?.email === currentUser.email && c.status === ContractStatus.IN_SIGNATURE
```

### 10.4 Sendbox Tab (Completed Actions)

The sendbox uses the `workflowMode` field as a guard to only classify contracts that actually went through the R&A workflow:

```typescript
const isRAContract = !!wfMode;   // contracts without workflowMode are not R&A items

// Reviewer in sendbox: acted (status is no longer pending)
isApprover === false && myReviewerEntry && myReviewerEntry.status !== 'pending'

// Approver in sendbox: acted
isApprover && approver!.status !== 'pending'
```

**Fallback** (no role data — infers from `approvalStatus`):
```typescript
!stillPending && approvalStatus === 'APPROVED' | 'REJECTED' → role: 'approver'
!stillPending && (no approvalStatus)                         → role: 'reviewer'
```

### 10.5 Local State Update After Action

After every action, the endpoint returns the full updated `ContractResponse`. The frontend merges it:

```typescript
const updateContractInState = (updatedContract: any) => {
    if (!updatedContract?.id) return;
    setAllContracts(prev =>
        prev.map(c => c.id === updatedContract.id ? { ...c, ...updatedContract } : c)
    );
};
```

- After merge, `inboxItems` and `sendboxItems` memos re-compute automatically
- If the action endpoint doesn't return a contract (network error fallback), `loadContracts()` is called instead

All action handlers (`handleMarkAsReviewed`, `handleApproveConfirm`, `handleReject`) follow this pattern:
```typescript
if (result.success) {
    showNotification(result.message, 'success');
    if (result.contract) {
        updateContractInState(result.contract);   // ← preferred path
    } else {
        await loadContracts();                     // ← fallback
    }
}
```

### 10.6 File URL Resolution

Contracts stored in MinIO (Spring Boot) have `fileUploaded === true`. Viewing these requires fetching a time-limited presigned URL from the backend:

```typescript
const resolveFileUrl = async (contract: Contract): Promise<string> => {
    if ((contract as any).fileUploaded === true) {
        const url = await apiService.getContractViewUrl(contract.id);
        if (url) return url;
    }
    // Legacy fallbacks (old MongoDB contracts)
    if (contract.fileUrl) return contract.fileUrl;
    if (contract.fileData) return contract.fileData;
    if (contract.signedPdfBase64) return `data:application/pdf;base64,${contract.signedPdfBase64}`;
    return '';
};
```

`handleViewReview` and `handleViewSignature` are now async — they call `resolveFileUrl()` before opening the viewer, storing the result in `viewerFileUrl` state. The `DocumentViewerDialog` receives this resolved URL via `fileUrl={viewerFileUrl}`.

---

## 11. Reviewer Flow

### 11.1 ReviewConfirmationDialog — Optional Message

**File:** [src/components/contracts/ReviewConfirmationDialog.tsx](src/components/contracts/ReviewConfirmationDialog.tsx)

Before choosing between "Mark as Reviewed" and "Forward for Further Review", the reviewer sees an optional message `TextField`:

```
┌─────────────────────────────────────────────────────────┐
│ Review Action                                            │
├─────────────────────────────────────────────────────────┤
│ Contract: <contractTitle>                                │
│                                                          │
│ [Message (optional) ─────────────────────────────────] │
│ [Add a brief message to reviewers              0/500  ] │
│ [                                                      ] │
│ [                                                      ] │
├─────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ ✓ Mark as Reviewed                                 │  │
│ └────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────┐  │
│ │ ➤ Mark and Forward for Further Review              │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

The message is passed as an optional `comments` parameter to whichever action is chosen:
```typescript
onMarkAsReviewed: (comments?: string) => void;
onMarkAndSendForFurtherReview: (comments?: string) => void;
```

### 11.2 Mark as Reviewed

1. Reviewer opens contract from inbox
2. Clicks **Mark as Reviewed** in card header → opens `ReviewConfirmationDialog`
3. Reviewer optionally enters a message → selects "Mark as Reviewed"
4. Calls `contractService.markAsReviewed(contractId, _email, comments?)`
5. Backend: `POST /contracts/{id}/review/complete` → sets `ReviewerInfo.status = 'reviewed'`
6. Backend auto-advances:
   - If all reviewers done and `REVIEW_AND_APPROVE` → contract: `IN_APPROVAL`
   - If all reviewers done and `ONLY_REVIEW` → contract: `READY_FOR_SIGNATURE`
   - If more reviewers pending → contract stays `IN_REVIEW`
7. Response includes updated `ContractResponse` → frontend merges into state

### 11.3 Forward for Further Review

**File:** [src/components/contracts/FurtherReviewDialog.tsx](src/components/contracts/FurtherReviewDialog.tsx)

The forwarding operation is a **single atomic API call** — it marks the caller as `forwarded` AND adds the new reviewers in one step. The old implementation called `markAsReviewed()` first, then separately updated the contract. This was replaced by:

```typescript
contractService.addAdditionalReviewers(contractId, additionalEmails, message?)
// → POST /contracts/{id}/review/forward
//   Body: { additionalReviewerEmails: [...], message?: '...' }
```

**Flow:**
1. Reviewer sees "Mark and Forward for Further Review" in `ReviewConfirmationDialog`
2. Reviewer optionally enters a message in `ReviewConfirmationDialog` → clicks the option
3. `handleMarkAndSendForFurtherReview(comments?)` is called — this **no longer** pre-calls `markAsReviewed`. It stores the message and opens `FurtherReviewDialog`
4. `FurtherReviewDialog` opens with `initialMessage` pre-populated from the confirmation message
5. Reviewer selects additional reviewer(s) and optionally edits/extends the message
6. On submit: `contractService.addAdditionalReviewers(contractId, selectedEmails, message?)`
7. Backend: marks caller as `forwarded`, creates new `ReviewerInfo` entries with `status = 'pending'`
8. Contract stays `IN_REVIEW` — new reviewers now appear in their own inboxes

**Why forwarding stays `IN_REVIEW`:** The contract cannot advance until ALL reviewers (including newly added ones) have completed. Forwarding expands the reviewer list while marking the forwarding reviewer as done.

### 11.4 Reject (as Reviewer)

1. Reviewer clicks the **×** (cancel/reject) icon on the card → inline rejection reason input appears in the card
2. Reviewer types rejection reason (required — button stays red but is labelled "Reject")
3. On submit: `contractService.rejectByReviewer(contractId, _email, message)`
4. Backend: `POST /contracts/{id}/review/reject` with `{ message }` → sets `ReviewerInfo.status = 'rejected'`
5. Backend: contract `status → REJECTED_BY_REVIEWER`
6. A `ModificationRequest` is appended with `role: 'reviewer'` and `message: <reason>`
7. Card disappears from reviewer's inbox
8. Contractor must edit and resubmit with a new reviewer list

> **Terminal state.** One reviewer rejection blocks the entire contract.

---

## 12. Approver Flow

### 12.1 Approve Contract — Confirmation Dialog

Approvers do **not** approve immediately on button click. A confirmation dialog is shown first:

```
┌─────────────────────────────────────────────────────────┐
│ Approve Contract                                         │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ <contractTitle>                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ [Message (optional) ─────────────────────────────────] │
│ [Add a brief message to include with approval  0/500  ] │
│ [                                                      ] │
│ [                                                      ] │
├─────────────────────────────────────────────────────────┤
│                         [Cancel]  [Approve]              │
└─────────────────────────────────────────────────────────┘
```

State variables:
```typescript
const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
const [contractForApproveConfirm, setContractForApproveConfirm] = useState<Contract | null>(null);
const [approveComment, setApproveComment] = useState('');
```

Flow:
1. Approver clicks approve icon on card → `handleApprove(contractId)` opens the dialog
2. Approver optionally enters a message → clicks "Approve"
3. `handleApproveConfirm()` calls `contractService.approveContract(contractId, _email, approveComment?)`
4. Backend: `POST /contracts/{id}/approval/approve` → `ApproverInfo.status = 'approved'`
5. Backend: contract `status → READY_FOR_SIGNATURE`
6. Response merged into local state → card moves to sendbox with "Approved" chip

### 12.2 Reject (as Approver)

Same inline rejection flow as reviewer — the reject icon on the card opens an inline message input, then calls:

```typescript
contractService.rejectByApprover(contractId, _email, message)
// → POST /contracts/{id}/approval/reject  { message: '...' }
```

Backend: `ApproverInfo.status = 'rejected'` + contract `status → REJECTED_BY_APPROVER`. On resubmission, review phase is **skipped** for `REVIEW_AND_APPROVE` mode.

---

## 13. ReviewApprovalCard — UI Logic

**File:** [src/components/contracts/ReviewApprovalCard.tsx](src/components/contracts/ReviewApprovalCard.tsx)

The card receives:
- `contract` — full `ContractResponse` (with `reviewers[]` and `approver{}`)
- `userRole` — `'reviewer' | 'approver'`
- `onView`, `onMarkAsReviewed`, `onApprove`, `onReject` callbacks

> **`onRequestModification` removed.** The old prop is gone. Modification requests and rejections are now unified — both are handled by `onReject(id, message)`. The `requestModification()` service method still exists as a backward-compat wrapper that delegates to the appropriate reject endpoint.

> **Card-level click removed.** The old `onClick={() => onView(contract.id)}` on the outer `Box` was removed. The View button in the header is the only way to open the viewer.

### 13.1 Status Chip Labels & Colors

**Aggregate fallback helpers** — when `reviewers[]` / `approver{}` are absent, the card falls back to `aggregateReviewStatus` / `aggregateApprovalStatus`:

```typescript
const aggregateReviewStatus   = (contract as any).reviewStatus  as string | undefined;
const aggregateApprovalStatus = (contract as any).approvalStatus as string | undefined;
```

#### Reviewer chip

| `myReviewerStatus` | Chip Label | Color |
|---|---|---|
| `null` / `'pending'` | **Pending Review** | Orange |
| `'reviewed'` | **Reviewed** | Teal green |
| `'forwarded'` | **Reviewed** | Teal green (forwarding = action complete) |
| `'rejected'` | **Rejected** | Red |

#### Approver chip

Reads directly from `contract.approver.status` when available:

| `approver.status` | Chip Label | Color |
|---|---|---|
| `'pending'` | **Pending Approval** | Orange (needs action) |
| `'approved'` | **Approved** | Emerald green |
| `'rejected'` | **Rejected** | Red |

### 13.2 Action Button Visibility Rules

#### Reviewer action buttons

```typescript
// Shown when: user is reviewer AND has not yet acted
userRole === 'reviewer' &&
myReviewerStatus !== 'reviewed' &&
myReviewerStatus !== 'rejected' &&
myReviewerStatus !== 'forwarded'     // ← forwarded also hides buttons
→ Show: [Mark as Reviewed icon] [Reject icon]
```

#### Approver action buttons

```typescript
// Shown when: user is approver AND all reviewers done AND approver hasn't acted
userRole === 'approver' &&
allReviewersComplete() &&
!isApproved() &&
!isRejectedByApprover()
→ Show: [Approve icon] [Reject icon]
```

#### `allReviewersComplete()` logic

```typescript
const allReviewersComplete = () => {
    if (contract.reviewers?.length > 0)
        return contract.reviewers.every(
            r => r.status === 'reviewed' || r.status === 'forwarded'
        );
    // Aggregate fallback
    return aggregateReviewStatus === 'COMPLETED' ||
           contract.status === ContractStatus.IN_APPROVAL ||
           contract.status === ContractStatus.READY_FOR_SIGNATURE;
};
```

### 13.3 Rejection Reason Input (Inline)

When the reviewer/approver clicks the reject icon, `showCommentInput` is set to `true` and an inline `textarea` appears within the card body:

```
[Enter rejection reason (required)...          ]
[                                               ]
                           [Cancel]  [Reject ×] ← red "error" variant
```

The "Reject" button calls `handleRejectWithMessage()`:
```typescript
const handleRejectWithMessage = () => {
    if (!comments.trim()) {
        alert('Please enter a rejection reason');
        return;
    }
    onReject(contract.id, comments);   // passes message to inbox page handleReject()
    setComments('');
    setShowCommentInput(false);
};
```

### 13.4 Assigned for Review & Approve Tooltip

The groups icon **⊞** opens a tooltip on **every card** (both reviewer and approver).

**Visibility condition:** `contract.reviewers?.length > 0 || contract.approver !== undefined`

**Tooltip structure:**

```
Assigned for Review & Approve
────────────────────────────────
Reviewers
  r1@gmail.com          [Reviewed]
    ↳ forwarded to next reviewer    ← italic caption, only for 'forwarded' status
  r2@gmail.com          [Reviewed]
────────────────────────────────
Approver
  approver@gmail.com    [Pending]
```

**Tooltip reviewer chip labels/colors:**

| Status | Label | Color |
|---|---|---|
| `reviewed` | Reviewed | Green |
| `forwarded` | Reviewed | Green (+ italic "↳ forwarded to next reviewer" note below) |
| `rejected` | Rejected | Red |
| `pending` | Pending | Orange |

**Tooltip approver chip:**

| Status | Color |
|---|---|
| `approved` | Green |
| `rejected` | Red |
| `pending` | Blue |

---

## 14. FurtherReviewDialog

**File:** [src/components/contracts/FurtherReviewDialog.tsx](src/components/contracts/FurtherReviewDialog.tsx)

A compact dialog opened from `ReviewConfirmationDialog` when the reviewer chooses to forward.

### New: `initialMessage` prop

The dialog now accepts an `initialMessage?: string` prop. This is pre-populated from the optional message entered in `ReviewConfirmationDialog`. The reviewer can edit it before submitting.

```typescript
interface FurtherReviewDialogProps {
    // ...
    onSubmit: (additionalReviewers: string[], message?: string) => Promise<void>;
    initialMessage?: string;   // ← new
}
```

### Structure

```
Forward for Further Review
──────────────────────────────────────────
Contract: <contractTitle>         ← compact inline row
──────────────────────────────────────────
Additional Reviewers *
[Autocomplete — search reviewers...]
  <chip: r2@gmail.com ×>
1 reviewer selected
──────────────────────────────────────────
Message (optional)
[Add a message to the additional reviewers]
[                                  0/500  ]
──────────────────────────────────────────
[Cancel]               [Submit for Further Review]
```

### User Exclusion Logic

```typescript
const excludedEmails = [
    ...existingReviewers,   // already reviewing
    existingApprover,       // approver cannot become a reviewer
    contractInitiator,      // contractor cannot review their own contract
].filter(Boolean);
```

### Submit

Calls `contractService.addAdditionalReviewers(contractId, selectedEmails, message?)` which posts to `POST /contracts/{id}/review/forward`. This is an **atomic** operation — it marks the caller as `forwarded` and adds the new reviewers in a single backend transaction.

---

## 15. Edge Cases & Guards

| Case | How handled |
|---|---|
| Approver in `REVIEW_AND_APPROVE` mode while contract is `IN_REVIEW` | `inboxItems` memo: approver only added when `c.status === IN_APPROVAL`. Approver is absent from inbox during review phase. |
| Reviewer forwarded → r2 needs action buttons | `myReviewerStatus` returns `'pending'` for r2. Condition `!== 'reviewed' && !== 'rejected' && !== 'forwarded'` is true → buttons shown. |
| Reviewer forwarded but action buttons still show for r1 in sendbox | Resolved: `'forwarded'` explicitly excluded from action button condition. Card shows "Reviewed" chip. |
| Approver chip shows "Ready" instead of "Pending Approval" | Resolved: chip reads `contract.approver.status` directly. `'pending'` → "Pending Approval" (orange). |
| Two separate sections for rejection info | Resolved: merged into single `Alert` — title + hint on one line, compact modification cards inline. |
| Mode selector allows changing mode on resubmission | Resolved: `disabled={modeIsLocked}` on `ToggleButtonGroup`. Backend enforces this too (400 response). |
| Approver field shows empty on resubmit dialog | Resolved: `loadExistingReviewData` uses `apiService.getContractDetails()` (full response), not the list endpoint. |
| `allReviewersComplete()` returns false when some reviewers forwarded | Resolved: condition includes `r.status === 'forwarded'` alongside `'reviewed'`. |
| `ModificationRequest.comments` vs `.message` | The backend Java model uses `message`. The frontend `ModificationRequest` interface was updated to use `message`. Display code reads `request.message`. |
| Presigned URL expiry for MinIO files | `resolveFileUrl()` fetches a fresh presigned URL on every viewer open — not cached in state. URL is cleared when viewer closes. |
| Polling causing stale state during review confirmation | Polling removed entirely. State updates via `updateContractInState()` + explicit `loadContracts()` fallback. |
| Rejection without a message | Both `/review/reject` and `/approval/reject` require a non-empty `message`. Frontend enforces this with the inline input + alert; backend returns 400 if empty. |
| `onRequestModification` removed from card props | Callers (`ContractsContent`, inbox page) no longer pass this prop. The `requestModification()` service method still exists as a backward-compat wrapper. |
| `removeReviewer()` / `removeApprover()` calls | These methods were deleted. The old "remove reviewer from dialog" UX is gone — the workflow is now immutable once submitted. |

---

## 16. File Reference

| File | Role |
|---|---|
| [src/types/contract.ts](src/types/contract.ts) | `ReviewerInfo`, `ApproverInfo`, `ModificationRequest`, `ContractStatus`, `WorkflowMode`, `ReviewStatus`, `ApprovalStatus` type definitions |
| [src/lib/httpClient.ts](src/lib/httpClient.ts) | Spring Boot HTTP client — injects JWT, normalises responses |
| [src/services/contractService.ts](src/services/contractService.ts) | All review/approval service methods: `submitForWorkflow`, `markAsReviewed`, `approveContract`, `rejectByReviewer`, `rejectByApprover`, `addAdditionalReviewers`, `getInboxContracts` |
| [src/services/apiService.ts](src/services/apiService.ts) | `getContractDetails()`, `getInboxContracts()`, `getContractViewUrl()` |
| [src/services/userService.ts](src/services/userService.ts) | `getAllUsers()` — now via `httpClient.get('/users')` (Spring Boot), not internal `/api/users` route |
| [src/services/authService.ts](src/services/authService.ts) | `getCurrentUser()`, `getAllRegisteredUsers()` — now via `httpClient.get('/users')` |
| [src/app/inbox/page.tsx](src/app/inbox/page.tsx) | Inbox page: role classification memos, all action handlers, `updateContractInState`, `resolveFileUrl`, approve confirmation dialog |
| [src/components/contracts/RequestReviewDialog.tsx](src/components/contracts/RequestReviewDialog.tsx) | Full submission + resubmission dialog with `ToggleButtonGroup` mode selector, resubmission restrictions, merged rejection banner |
| [src/components/contracts/ReviewApprovalCard.tsx](src/components/contracts/ReviewApprovalCard.tsx) | Inbox/sendbox card: status chip logic, action button visibility, inline rejection reason input, reviewer tooltip |
| [src/components/contracts/ReviewConfirmationDialog.tsx](src/components/contracts/ReviewConfirmationDialog.tsx) | Confirmation dialog for reviewer: optional message input + "Mark as Reviewed" vs "Forward for Further Review" |
| [src/components/contracts/FurtherReviewDialog.tsx](src/components/contracts/FurtherReviewDialog.tsx) | Reviewer forwarding dialog: additional reviewer picker with `initialMessage` pre-population |
| [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx) | Contract grid page — "Request Review" entry point; uses `submitForWorkflow` with `mode` param |
| [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx) | Create contract flow — inline review submission after creation |
| [src/components/contracts/RenewContractDialog.tsx](src/components/contracts/RenewContractDialog.tsx) | Contract renewal flow — inline review submission after renewal |
| [src/app/api/contracts/route.ts](src/app/api/contracts/route.ts) | Next.js API route for MongoDB-backed contracts — `calculateDynamicStatus()` updated to use current status values (`IN_SIGNATURE`, `IN_REVIEW`, etc.) |
