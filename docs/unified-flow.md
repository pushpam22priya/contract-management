# Unified Review & Approval Flow

The Unified Flow is the current internal contract review and approval system. It replaces the legacy `RequestReviewDialog` / `ReviewApprovalCard` pattern documented in `docs/review-approval-workflow.md`.

---

## Overview

A contract owner submits the contract into a sequential workflow of **Reviewers** and **Approvers**. Each participant is notified by email, acts in order, and uploads a copy of the PDF (with any annotation or field changes preserved). After all participants complete, the contract can be sent to external signers.

### Key differences from the legacy flow

| Feature | Legacy flow | Unified flow |
|---|---|---|
| Participants | Separate reviewer / approver dialogs | Single submit dialog with ordered participants |
| PDF upload | Not required by reviewer | Both reviewer and approver upload the PDF |
| External signing | Separate manual step | Optional auto-trigger after last approver |
| Rejection | No formal reject path | Reviewer or approver can reject with a reason |
| Resubmission | N/A | Owner resubmits with new participant assignments |

---

## Architecture

### Backend endpoints (via Spring Boot at `/api/backend/*`)

All requests are proxied through Next.js. Base path: `/contracts/{id}/flow/`

| Method | Path | Purpose |
|---|---|---|
| POST | `/flow/submit` | Owner submits the flow (sets participants + external signers) |
| GET | `/flow/status` | Get live flow state (participants, org-gate, current order) |
| POST | `/flow/complete` | Participant marks their step complete (+ multipart upload parts) |
| POST | `/flow/reject` | Participant rejects the contract with a reason |
| POST | `/flow/upload/initiate` | Start a multipart upload session → returns `uploadId` |
| GET | `/flow/upload/presign?uploadId=...&partNumber=...` | Get a presigned PUT URL for one chunk |
| POST | `/flow/upload/abort?uploadId=...` | Cancel a failed upload |
| GET | `/flow/file-url` | Get the latest PDF URL for a participant to view |
| POST | `/flow/send-for-signature` | Owner manually sends to external signers (Case A) |
| GET | `/flow/fields` (POST) | Save reviewer's form field values |
| GET | `/contracts/flow/inbox` | Contracts where the current user is an active participant |
| GET | `/contracts/flow/sent` | Contracts where the current user is a completed participant |

### MinIO storage paths

- `{contractId}.pdf` — base PDF (uploaded by owner via the contract editor)
- `{contractId}_signed.pdf` — flow PDF (updated by each participant; this is what reviewers and approvers see)

`getParticipantFileUrl` (`GET /flow/file-url`) returns the `_signed.pdf` presigned URL when one exists, otherwise falls back to the base PDF.

### Service layer

`src/services/unifiedFlowService.ts` — all 12 service methods, no legacy flow code is imported.

### Types

`src/types/unifiedFlow.ts` — key types:

- `WorkflowParticipant`: `{ email, name, role, order, status, sentBy, sentAt, unlockedAt, completedAt, rejectedAt, comments }`
- `FlowStatusResponse`: full flow state returned by `getFlowStatus`
- `FlowCompletePayload`: submitted by each participant on completion (includes multipart upload parts)

---

## Participant statuses

| Status | Meaning |
|---|---|
| `pending` | Waiting — an earlier participant has not yet completed |
| `unlocked` | Email sent — this participant's turn has started |
| `in_progress` | Participant has opened the contract |
| `completed` | Step finished; PDF uploaded |
| `rejected` | Participant rejected the contract |

---

## Contract statuses (unified-flow states)

| Status | Meaning |
|---|---|
| `IN_REVIEW` | At least one reviewer is active |
| `IN_APPROVAL` | All reviewers done; at least one approver is active |
| `READY_FOR_SIGNATURE` | All participants completed; waiting for external signing (Case A) |
| `IN_SIGNATURE` | External signers notified |
| `REJECTED_BY_REVIEWER` | A reviewer rejected |
| `REJECTED_BY_APPROVER` | An approver rejected |
| `REJECTED` | Legacy rejection value (treated the same as the two above) |

---

## Submit flow (`UnifiedFlowSubmitDialog`)

**File:** `src/components/unified-flow/UnifiedFlowSubmitDialog.tsx`

The owner opens this dialog from the contract detail page or contract card.

**On open:** `getFlowStatus` is called first.
- If an active flow already exists (participants returned), the dialog renders in **read-only mode** showing current participant statuses. No further submission is possible until the flow completes or is reset.
- If no flow exists (or `resubmitMode=true`), the assignment form is shown.

**Assignment form:**
- Reviewers (left column) and Approvers (right column) are added as rows.
- Each row uses an autocomplete backed by `userService.getAllUsers`. The current user is excluded.
- Rows can be drag-reordered within their group. Position determines `order`.
- Final order: reviewers get orders 1…N, approvers get N+1…N+M.
- At least one Approver is required.
- Duplicate emails and self-assignment are rejected by client-side validation.

**External signing toggle:**
- Off by default: after all approvals, the owner manually sends for signature via `UnifiedFlowSendForSignatureDialog`.
- On (`externalSigningIncluded=true`, **Case B**): one or more external signers are configured upfront. The backend auto-sends signature emails immediately after the last approver completes. The frontend does NOT need to send them manually.
- When Case B is enabled, `externalSigners[]` (email, name, optional `partyId`/`partyLabel`) and `senderName` are also submitted.

**Submit call:** `unifiedFlowService.submitFlow(contractId, participants, externalSigningIncluded, externalSigners?, senderName?)`

---

## Reviewer panel (`UnifiedFlowReviewerPanel`)

**File:** `src/components/unified-flow/UnifiedFlowReviewerPanel.tsx`

Opened from the **inbox page** when a reviewer's turn is active (`status === 'unlocked'` or `'in_progress'`).

**On open:**
1. `getParticipantFileUrl(contractId)` → gets the latest `_signed.pdf` presigned URL.
2. `apiService.getContractDetails(contractId)` → fetches `xfdfData` from Spring Boot. This is always the freshest field state because the owner's PATCH writes to the base contract before submitting the flow. The flow-level XFDF (returned by `getFlowStatus` or `getParticipantFileUrl`) may be stale from a prior participant.

**In-viewer actions:**
- **Save** (hidden from toolbar via `hideSaveButton`): triggered programmatically via `saveRef` when Mark Complete is clicked. Caches the PDF blob + XFDF locally — no backend call yet.
- **Mark Complete**: exports the current PDF state from the viewer, then initiates a multipart upload:
  1. `initiateFlowUpload(contractId)` → `uploadId`
  2. Split PDF into 10 MB chunks, PUT each to MinIO via presigned URL
  3. `markFlowComplete(contractId, { uploadId, parts, xfdfData, formFields, fieldValues })`
- **Reject**: opens `UnifiedFlowRejectDialog` (role = `'REVIEWER'`).

**Read-only mode:** When `participant.status === 'completed'` or `'rejected'`, the viewer is opened with `readOnly=true` and both action buttons are hidden.

---

## Approver panel (`UnifiedFlowApproverPanel`)

**File:** `src/components/unified-flow/UnifiedFlowApproverPanel.tsx`

Opened from the inbox page when an approver's turn is active.

**Same file-loading sequence as ReviewerPanel** (`getParticipantFileUrl` + `apiService.getContractDetails` for XFDF).

**Internal-field gate (Case B only):**
When `externalSigningIncluded=true` and this is the **last approver** (highest `order` among all `APPROVER` participants), clicking "Sign & Approve" first validates that all INTERNAL party form fields have been filled. If any are empty, a `PartyValidationWarningPopup` is shown listing the missing fields. The gate does not apply to non-last approvers.

**Sign & Approve:** Same multipart upload flow as Mark Complete (reviewer), but for a signed PDF.

**Reject:** Opens `UnifiedFlowRejectDialog` (role = `'APPROVER'`).

---

## Reject dialog (`UnifiedFlowRejectDialog`)

**File:** `src/components/unified-flow/UnifiedFlowRejectDialog.tsx`

Used by both reviewers and approvers. A freeform reason is required (minimum 10 characters, maximum 1000).

**Call:** `unifiedFlowService.rejectFlow(contractId, reason)`

The dialog title and warning message differ by role:
- **Reviewer**: "All participants will be reset and the owner must resubmit."
- **Approver**: "Reviewers will be preserved — only approvers need to be reassigned."

---

## Rejection & resubmission flow

### After reviewer rejects (`REJECTED_BY_REVIEWER`)

- All participants are reset to `pending`.
- Contract status becomes `REJECTED_BY_REVIEWER`.
- The owner must resubmit with **all new** reviewers and approvers (full reset).

### After approver rejects (`REJECTED_BY_APPROVER`)

- Only the rejecting approver (and any pending approvers) are reset.
- **Completed reviewers are preserved** — their `completed` status and uploaded PDF are kept.
- Contract status becomes `REJECTED_BY_APPROVER`.
- The owner resubmits with **new approver(s) only**.

### Legacy `REJECTED` status

Treated identically to the two new values. `ContractCard.tsx` checks all three when deciding whether to show the "Update & Resubmit" button:
```typescript
const isRejectedForResubmit =
    contract.status === ContractStatus.REJECTED ||
    contract.status === ContractStatus.REJECTED_BY_REVIEWER ||
    contract.status === ContractStatus.REJECTED_BY_APPROVER;
```

---

## Resubmit dialog (`UnifiedFlowResubmitDialog`)

**File:** `src/components/unified-flow/UnifiedFlowResubmitDialog.tsx`

Opened by the owner after rejection.

**On open:** Fetches both `getFlowStatus(contractId)` and `userService.getAllUsers()` in parallel.

The dialog infers the rejection mode from the participants:
- `rejectedParticipant.role === 'APPROVER'` → **Case B (approver rejection)**:
  - Shows "Reviewers (preserved — locked)" section with completed reviewers as read-only chips.
  - Shows only new Approver input rows.
  - `submitFlow` is called with **only new approvers**; backend re-attaches the preserved reviewers automatically.
- Otherwise → **Case A (reviewer rejection)**:
  - Shows new Reviewer and new Approver input rows side by side (full reset).
  - `submitFlow` is called with all new assignments.

**External signing toggle:** Pre-populated from the existing flow status (`externalSigningIncluded`, `externalSigners`). The owner can keep or change the external signer configuration.

**Submit call:** Same `submitFlow` as the initial submission.

---

## Inbox card (`UnifiedFlowInboxCard`)

**File:** `src/components/unified-flow/UnifiedFlowInboxCard.tsx`

Shown on the inbox page for each contract where the current user is a participant.

**Status-dependent behavior:**

| Participant status | Quick-open button | Status label |
|---|---|---|
| `pending` | Hidden | "Waiting" |
| `unlocked` | "Open & Review" / "Open & Sign" | "Your Turn" |
| `in_progress` | "Open & Review" / "Open & Sign" | "In Progress" |
| `completed` | Hidden | "Completed" |
| `rejected` | Hidden | "Rejected" |

The MoreVert popover always contains a View icon. When `canAct` (unlocked or in_progress):
- Reviewer: also shows Mark Complete (shortcut) and Reject icons.
- Approver: shows only Reject icon (Sign & Approve always requires opening the full viewer).

---

## Participant timeline (`UnifiedFlowParticipantTimeline`)

**File:** `src/components/unified-flow/UnifiedFlowParticipantTimeline.tsx`

Shown on the contract detail page (owner view). Polls `getFlowStatus` while the contract is `IN_REVIEW` or `IN_APPROVAL`. Groups participants by `order`, with connector arrows between groups.

---

## Send for signature dialog (`UnifiedFlowSendForSignatureDialog`)

**File:** `src/components/unified-flow/UnifiedFlowSendForSignatureDialog.tsx`

Used for **Case A** (manual send). Opened from the contract detail page when contract status is `READY_FOR_SIGNATURE`.

**On open:** Calls `getFlowStatus` to check `orgFieldsComplete` (all INTERNAL party form fields filled). If not complete, the send button is disabled and missing fields are listed.

**Call:** `unifiedFlowService.sendForSignatureUnified(contractId, assignments, senderName?)`

The service adds `type: 'external'` to each assignment before sending.

---

## Contract detail page — viewing after signing

**File:** `src/app/contracts/[id]/page.tsx`

When a multi-party contract (has `participants[]`) is opened for viewing, the page calls `getParticipantFileUrl` to get the `_signed.pdf` URL. If available, this URL is used directly in `DocumentViewerDialog` **with no XFDF overlay** (`initialXfdf={undefined}`).

This prevents the XFDF (which records all form field text values including external signer inputs) from overriding ink-signature appearance streams already baked into the `_signed.pdf` binary.

If `getParticipantFileUrl` fails (no flow file yet), the page falls back to the base PDF with the contract's `xfdfData`.

---

## Test coverage

| File | Tests | What's covered |
|---|---|---|
| `src/__tests__/unit/unifiedFlowService.test.ts` | 14 | All 12 service methods; endpoint paths; payloads (incl. `type:'external'` on `sendForSignatureUnified`) |
| `src/__tests__/integration/UnifiedFlowSubmitDialog.test.tsx` | 12 | Form validation, submit, Case B toggle, read-only status view |
| `src/__tests__/integration/UnifiedFlowResubmitDialog.test.tsx` | 10 | Approver rejection (locked reviewers), reviewer rejection (full reset), external signing pre-population |
| `src/__tests__/integration/UnifiedFlowRejectDialog.test.tsx` | 10 | Validation, both roles, success/error paths |
| `src/__tests__/integration/UnifiedFlowApproverPanel.test.tsx` | 13 | File loading, upload flow, internal-field gate, XFDF from apiService, read-only mode |
| `src/__tests__/integration/UnifiedFlowReviewerPanel.test.tsx` | 13 | File loading, upload flow, Mark Complete, XFDF from apiService, read-only mode |
| `src/__tests__/integration/UnifiedFlowInboxCard.test.tsx` | 12 | All participant statuses (pending/unlocked/completed/rejected), role chips, reject dialog |
