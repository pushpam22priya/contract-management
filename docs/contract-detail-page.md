# Contract Detail Page — Technical Documentation

**Last Updated:** 2026-06-23

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Dependencies](#2-architecture--dependencies)
3. [Component Props](#3-component-props)
4. [State Model](#4-state-model)
5. [Data Loading Flow](#5-data-loading-flow)
6. [Real-Time Polling](#6-real-time-polling)
7. [Activity Timeline Construction](#7-activity-timeline-construction)
8. [Document URL Resolution](#8-document-url-resolution)
9. [Status Color System](#9-status-color-system)
10. [Multi-Party Signature Flow](#10-multi-party-signature-flow)
11. [Contract Finalization](#11-contract-finalization)
12. [Document Viewer](#12-document-viewer)
13. [Contract History (Renewal Chain)](#13-contract-history-renewal-chain)
14. [PDF Save-Changes Flow](#14-pdf-save-changes-flow)
15. [Sub-Components](#15-sub-components)
16. [UI Layout & Render States](#16-ui-layout--render-states)
17. [Contract Data Model](#17-contract-data-model)
18. [ContractStatus Enum](#18-contractstatus-enum)
19. [SignatureFlowStatus Values](#19-signatureflowstatus-values)
20. [Internationalization](#20-internationalization)
21. [Error Handling](#21-error-handling)
22. [Known Limitations](#22-known-limitations)

---

## 1. Overview

The Contract Detail Page is the primary read/inspect/act view for a single contract. It is navigated to from the contract list and surfaces all contract data, its lifecycle history, document access, signature progress, and finalization controls in one place.

**What this page does:**

| Capability | Detail |
|---|---|
| View contract metadata | Title, client, category, template, dates, description, status |
| View contract PDF | Opens an Apryse WebViewer in a modal dialog |
| Download contract PDF | Triggers browser download of the PDF file |
| Track activity history | Chronological audit trail of every event on the contract |
| Track multi-party signatures | Sequential signing progress across internal and external signers |
| Finalize a signed contract | Calls Spring Boot to generate final PDF and email all parties |
| View renewal history | Popover/drawer showing full chain of original → renewal contracts |
| Real-time auto-refresh | Polls Spring Boot every 12 s when a signing workflow is active |

---

## 2. Architecture & Dependencies

### Services

| Service | Import | Purpose |
|---|---|---|
| `apiService` | `@/services/apiService` | Fetch contract details, view URL, update metadata |
| `contractService` | `@/services/contractService` | Save signed PDF blob (`updateContractSignedPdf`) |
| `templateService` | `@/services/templateService` | Fetch template data (fallback PDF source) |
| `finalizeContract` | `@/services/externalSignatureService` | Trigger finalization via Spring Boot |
| `authService` | `@/services/authService` | Identify current user (imported but used indirectly) |

### Hooks

| Hook | Source | Purpose |
|---|---|---|
| `useRouter` | `next/navigation` | `router.back()` on the Back button |
| `use(params)` | React 19 built-in | Resolve the `params` Promise from Next.js App Router |
| `useContractPolling` | `@/hooks/useContractPolling` | Background polling every 12 s when a signing flow is active |
| `useTranslations('contractDetail')` | `next-intl` | All UI strings for this page |
| `useTranslations('contractStatus')` | `next-intl` | Status chip labels |
| `useTheme` | MUI | Dark-mode detection (`theme.palette.mode === 'dark'`) |

### Child Components

| Component | File | Role |
|---|---|---|
| `AppLayout` | `@/components/layout/AppLayout` | Shell: sidebar, top bar, theme provider |
| `ContractDetailShimmer` | `@/components/common/ShimmerCard` | Skeleton loader while data is fetching |
| `ContractInformation` | `@/components/contracts/ContractInformation` | Left panel: metadata + progress bar |
| `ContractDetailsPanel` | `@/components/contracts/ContractDetailsPanel` | Right panel: Documents + Activity tabs |
| `SignatureProgressTimeline` | `@/components/contracts/SignatureProgressTimeline` | Horizontal signing order timeline + Finalize button |
| `DocumentViewerDialog` | `@/components/viewer/DocumentViewerDialog` | Apryse WebViewer modal |
| `ContractHistoryPanel` | `@/components/contracts/ContractHistoryPanel` | Popover/drawer: renewal chain list |
| `ContractHistoryDialog` | `@/components/contracts/ContractHistoryDialog` | Dialog: detail view of a single chain entry |

---

## 3. Component Props

```typescript
function ContractViewPage({
    params,
}: {
    params: Promise<{ id: string }>;
})
```

`params` is a Promise because Next.js 16 App Router always provides dynamic route segments as Promises. The component resolves it synchronously using React 19's `use()` hook:

```typescript
const resolvedParams = use(params);
const id = resolvedParams?.id;
```

> **Testing note:** In jsdom/Jest environments, `use(Promise)` suspends forever unless the Promise is pre-tagged with `{ status: 'fulfilled', value }`. See `ContractDetailPage.test.tsx` for the `resolvedParam<T>()` helper.

---

## 4. State Model

```typescript
// Data
const [loading, setLoading]               = useState(true);
const [contract, setContract]             = useState<Contract | null>(null);
const [details, setDetails]               = useState<DetailsObject | null>(null);
const [contractTemplate, setContractTemplate] = useState<any | null>(null);

// Document viewer
const [viewerOpen, setViewerOpen]         = useState(false);
const [selectedDoc, setSelectedDoc]       = useState<Document | null>(null);

// History panel / dialog
const [historyAnchorEl, setHistoryAnchorEl]       = useState<HTMLElement | null>(null);
const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

// Finalization
const [finalizing, setFinalizing]         = useState(false);
const [finalizeError, setFinalizeError]   = useState<string | null>(null);
const [finalizeSuccess, setFinalizeSuccess] = useState(false);
```

### Derived Values (computed on every render)

| Variable | Derivation |
|---|---|
| `displayTitle` | `contract.title` with `/(Renewal\d*)/i` suffix stripped |
| `historyPanelOpen` | `Boolean(historyAnchorEl)` |
| `isDark` | `theme.palette.mode === 'dark'` |
| `isMultiPartyContract` | `externalSigners.length > 0 OR internalSigners.length > 0` |
| `allSignersCompleted` | All items in both arrays have `status === 'completed'` |
| `currentOrder` | `contract.currentSigningOrder` |
| `allOrders` | Union of `order` values from both signer arrays |
| `uniqueOrders` | `[...new Set(allOrders)].sort()` |
| `canFinalize` | `allSignersCompleted && signatureFlowStatus === 'all_completed'` |
| `isFinalized` | `signatureFlowStatus === 'finalized'` |

---

## 5. Data Loading Flow

The main `useEffect` runs once when `id` becomes available and is protected by an `isMounted` guard to prevent state updates after navigation away.

```
useEffect([id]) ──▶ loadData()
    │
    ├─ 1. Guard: skip if id is falsy
    │
    ├─ 2. setLoading(true)
    │
    ├─ 3. apiService.getContractDetails(id)
    │       └─ GET /api/backend/contracts/{id}   (Spring Boot)
    │           └─ Not found → throw Error → catch → setLoading(false)
    │
    ├─ 4. setContract(found)
    │
    ├─ 5. [Optional] templateService.getTemplateById(found.templateId)
    │       └─ Only if found.templateId exists
    │           └─ Failure is silently swallowed (not blocking)
    │
    ├─ 6. Build Activity Timeline (see §7)
    │
    ├─ 7. apiService.getContractViewUrl(contractId)
    │       └─ GET /api/backend/contracts/{id}/view-url  (Spring Boot → MinIO presigned URL)
    │
    ├─ 8. Build documents array:
    │       [{
    │           id: contractId,
    │           name: `${title}.pdf`,
    │           size: 'PDF',
    │           uploadDate: createdAt (en-GB),
    │           url: viewUrl,
    │       }]
    │
    └─ 9. setDetails({ documents, activities, ...found })
         setLoading(false)
```

**Error behavior:** Any thrown error is caught, logged to `console.error`, and loading is set to `false`. `contract` remains `null`, triggering the "Not Found" render.

---

## 6. Real-Time Polling

The `useContractPolling` hook (`src/hooks/useContractPolling.ts`) polls every 12 seconds when a signing workflow is active. It compares the contract's `updatedAt` timestamp to detect changes; when a change is found, it calls `handleContractUpdate` to refresh UI state without a full page reload.

### Polling Enabled Condition

```typescript
const shouldPoll =
    !loading &&
    !!contract &&
    (
        contract.status === ContractStatus.IN_SIGNATURE ||
        contract.status === ContractStatus.SIGNED_BY_EVERYONE ||
        (contract.signatureFlowStatus && contract.signatureFlowStatus !== 'finalized')
    );
```

Polling is automatically disabled once the contract reaches `signatureFlowStatus: 'finalized'` — no further state changes are expected.

### On Update Callback

```typescript
const handleContractUpdate = async (freshContract) => {
    setContract(freshContract);

    const viewUrl = await apiService.getContractViewUrl(freshContract.id) || '';
    setDetails((prev) => ({
        ...prev,
        ...freshContract,
        documents: [{
            id: 'main-contract',
            name: `${freshContract.title}.pdf`,
            size: 'PDF',
            uploadDate: new Date(freshContract.createdAt).toLocaleDateString('en-GB'),
            url: viewUrl,
        }],
    }));
};
```

The callback is memoized with `useCallback` to prevent the hook from re-subscribing on every render.

### Polling Parameters

| Parameter | Value |
|---|---|
| `contractId` | `id` from URL params |
| `currentUpdatedAt` | `contract?.updatedAt` |
| `onUpdate` | `handleContractUpdate` |
| `enabled` | `shouldPoll` |
| `intervalMs` | `12000` (12 seconds) |

---

## 7. Activity Timeline Construction

The activity timeline is built in-memory from the contract object every time data loads. Events are pushed into a temporary array, sorted chronologically by raw timestamp, then stripped of the sort key before being stored in state.

### Events Generated (in order)

| Event Key | Trigger Condition | Title |
|---|---|---|
| `created` | `found.createdAt` exists | "Contract Created" |
| `submitted-review-{n}` | `found.reviewers[n]` exists | "Submitted for Review to {email}" |
| `reviewed-{n}` | reviewer `status === 'reviewed'` | "Reviewed" |
| `changes-requested-{n}` | reviewer `status === 'requested_changes'` | "Changes Requested" |
| `review-rejected-{n}` | reviewer `status === 'rejected'` | "Review Rejected" |
| `submitted-approval` | `found.approver` exists | "Submitted for Approval to {email}" |
| `approved` | approver `status === 'approved'` | "Approved" |
| `approval-rejected` | approver `status === 'rejected'` | "Approval Rejected" |
| `sent-internal-{n}` | internal signer has `assignedAt` | "Sent for Signature — {party} (Order {n})" |
| `internal-unlocked-{n}` | internal signer has `unlockedAt ≠ assignedAt` | "Signature unlocked — {party} (Order {n})" |
| `internal-signed-{n}` | internal signer `status === 'completed'` | "Signed — {party}" |
| `sent-external-{n}` | external signer has `sentAt` | "Sent for Signature — {party} (Order {n})" |
| `external-unlocked-{n}` | external signer has `unlockedAt ≠ sentAt` | "Signature unlocked — {party} (Order {n})" |
| `external-signed-{n}` | external signer `status === 'completed'` | "Signed — {party}" |
| `signature-requested` | Legacy single-signer (`signingRequest`, no multi-party) | "Sent for Signature to {email}" |
| `signed` | Legacy: `signer.status === 'signed'` | "Signed" |
| `finalized` | `found.finalizedAt` exists | "Contract Finalized" |
| `renewed` | `found.renewedContractId` + `renewalStatus` exists | "Contract Renewed" |
| `renewal-of` | `found.renewedFromId` exists | "Renewal Contract Created" |
| `terminated` | `found.terminatedAt` exists | "Contract Terminated" |

### Date Formatting

Dates are formatted as `en-GB` locale (`DD/MM/YYYY`). Invalid or missing dates fall back to the string `"Date not available"`.

### Sort Logic

```typescript
activities.sort((a, b) => a._ts - b._ts);  // ascending, oldest first
```

The `_ts` (raw Unix millisecond timestamp) field is stripped after sorting and is never stored in state or passed to child components.

---

## 8. Document URL Resolution

When `DocumentViewerDialog` opens, `fileUrl` is resolved with the following priority:

```
Priority 1 — Chain document (predecessor/renewal):
    if selectedDoc.id ≠ 'main-contract' AND ≠ contract.id
        → use selectedDoc.url directly

Priority 2 — Signed PDF base64 (current contract):
    if contract.signedPdfBase64 exists
        → data:application/pdf;base64,{signedPdfBase64}

Priority 3 — Selected document URL:
    if selectedDoc.url exists
        → selectedDoc.url

Priority 4 — Contract's MinIO URL:
    if contract.fileUrl exists
        → contract.fileUrl

Priority 5 — Template fallback:
    if contract.templateId AND contractTemplate loaded
        → contractTemplate.fileData OR contractTemplate.fileUrl

Priority 6 — Empty string (viewer shows no document)
```

---

## 9. Status Color System

`getStatusColor(status: string)` returns `{ bgcolor, color }` tuples for the status Chip. Two palettes are provided: light mode and dark mode.

### Light Mode Palette

| Status(es) | bgcolor | color |
|---|---|---|
| `ACTIVE`, `SIGNED` | `#d1fae5` (green-100) | `#065f46` (green-800) |
| `EXPIRING` | `#fef3c7` (amber-100) | `#92400e` (amber-800) |
| `TERMINATED` | `#f1f5f9` (slate-100) | `#334155` (slate-700) |
| `EXPIRED`, `REJECTED`, `REJECTED_BY_*` | `#fee2e2` (red-100) | `#991b1b` (red-800) |
| `IN_REVIEW` | `#ede9fe` (violet-100) | `#5b21b6` (violet-800) |
| `IN_APPROVAL` | `#fef9c3` (yellow-100) | `#92400e` (amber-800) |
| `IN_SIGNATURE`, `READY_FOR_SIGNATURE` | `#fff9c4` | `#f57f17` |
| `SIGNED_BY_EVERYONE` | `#e3f2fd` (blue-100) | `#1565c0` (blue-800) |
| `DRAFT` | `#f1f5f9` (slate-100) | `#334155` (slate-700) |

Dark mode uses semi-transparent `rgba()` values of the same hue with muted text colors to maintain readability on dark surfaces.

---

## 10. Multi-Party Signature Flow

A contract is considered a **multi-party contract** when it has at least one entry in `externalSigners[]` or `internalSigners[]`.

### Signer Types

| Type | Who | How they sign | Status values |
|---|---|---|---|
| **External** | Clients/third parties outside the organization | Email link → `/sign/[token]` page | `pending` → `unlocked` → `viewed` → `completed` |
| **Internal** | System users (employees) | Signatures page inside the app | `pending` → `unlocked` → `completed` |

### Sequential Signing (Auto-Advance)

Signers are assigned an integer `order` (1, 2, 3, …). Only signers at the **current order** can sign; all others are `pending`. When all signers at order N complete:

1. The `autoAdvanceWorkflow` engine (called server-side from `internal-sign` or `sign-requests/[token]/complete` routes) unlocks order N+1.
2. External signers at N+1 receive sign-invitation emails.
3. Internal signers at N+1 appear as "unlocked" on the Signatures page.
4. The contract's `currentSigningOrder` advances to N+1.

When the last order completes, `signatureFlowStatus` is set to `all_completed`.

### Finalization Check

```typescript
const canFinalize =
    allSignersCompleted &&                              // every signer has status=completed
    contract.signatureFlowStatus === 'all_completed';  // engine has confirmed completion

const isFinalized = contract.signatureFlowStatus === 'finalized';
```

`SignatureProgressTimeline` receives both flags. The Finalize button is shown only when `canFinalize === true` and `isFinalized === false`.

---

## 11. Contract Finalization

**Handler:** `handleFinalize()`

```
User clicks "Finalize Contract"
    │
    ├─ setFinalizing(true), clear error
    │
    ├─ finalizeContract(contract.id)
    │       └─ POST /api/backend/contracts/{id}/finalize  (Spring Boot)
    │           • Creates merged final PDF in MinIO
    │           • Emails signed copies to all parties
    │           • Sets contract.signatureFlowStatus = 'finalized'
    │           • Sets contract.status = 'SIGNED' (or 'ACTIVE' if started)
    │
    ├─ On success:
    │   ├─ setFinalizeSuccess(true)
    │   └─ Refresh: apiService.getContractDetails(id) → setContract(updatedContract)
    │
    └─ On failure:
        └─ setFinalizeError(error.message || 'Failed to finalize contract')

    └─ finally: setFinalizing(false)
```

After finalization the `SignatureProgressTimeline` transitions to its "finalized" visual state (green border, `DoneAllIcon` alert, date stamp). Polling is automatically disabled because `shouldPoll` becomes `false` when `signatureFlowStatus === 'finalized'`.

---

## 12. Document Viewer

Opened by `handleViewDocument(doc: Document)` which sets `selectedDoc` and `viewerOpen = true`.

### DocumentViewerDialog Props (from this page)

| Prop | Value | Notes |
|---|---|---|
| `open` | `viewerOpen` | |
| `onClose` | `() => setViewerOpen(false)` | |
| `fileUrl` | See §8 — Priority-ordered resolution | |
| `fileName` | `selectedDoc?.name \|\| displayTitle + '.pdf'` | |
| `title` | `selectedDoc?.name \|\| displayTitle` | |
| `contractId` | Chain-doc id or `contract.id` | |
| `initialXfdf` | `contract.xfdfData` (main doc only; undefined for chain docs) | |
| `formFields` | `contract.formFields` (main doc only) | |
| `currentUserRole` | `"contractor"` | Hard-coded; contractor cannot edit client-assigned fields |
| `onSave` | `handleSaveChanges` (main doc, not finalized) or `undefined` | |
| `readOnly` | `true` when finalized OR viewing a chain doc | |
| `editableFieldMode` | `'empty-only'` (main, not finalized) or `'none'` | Allows filling blank fields only |
| `showAnnotationNavigation` | `true` | |
| `parties` | `contract.parties` | Party color mapping for field highlighting |
| `externalSigners` | `contract.externalSigners` | Prevents contractor from editing external-party fields |
| `internalSigners` | `contract.internalSigners` | Prevents contractor from editing internal-party fields |

---

## 13. Contract History (Renewal Chain)

The history button (`HistoryIcon`) is shown whenever the contract is part of a renewal chain:

```typescript
(contract?.renewedFromId || contract?.renewedContractId) && (
    <IconButton onClick={(e) => setHistoryAnchorEl(e.currentTarget)} ... />
)
```

`renewedFromId` — this contract is a renewal; it points to the contract it was renewed from.  
`renewedContractId` — this contract is an original; it points to the renewal draft created from it.

Clicking the button opens `ContractHistoryPanel` (a popover on desktop / drawer on mobile) anchored to the button element. Selecting an entry in the panel opens `ContractHistoryDialog` with full detail of that chain entry, including its own documents.

---

## 14. PDF Save-Changes Flow

When a user edits the contract in the PDF viewer and clicks Save, `handleSaveChanges` is called:

```
handleSaveChanges(pdfBlob, xfdfString, fieldValues?, formFields?)
    │
    ├─ Convert Blob → Uint8Array → binary string → btoa() → pdfBase64
    │
    ├─ contractService.updateContractSignedPdf(contract.id, pdfBase64, xfdfString)
    │       └─ POST /api/backend/contracts/{id}/signed-pdf   (Spring Boot)
    │           Uploads the base64 PDF + XFDF annotation string
    │
    ├─ On success:
    │   ├─ If fieldValues provided: include in metadataUpdates.fieldValues
    │   ├─ If formFields provided: include in metadataUpdates.formFields + hasFormFields=true
    │   └─ If any metadataUpdates:
    │       apiService.updateContractMetadata(contract.id, metadataUpdates)
    │               └─ PATCH /api/backend/contracts/{id}/metadata
    │
    └─ Refresh: apiService.getContractDetails(id) → setContract(updatedContract)
```

---

## 15. Sub-Components

### ContractInformation

**File:** `src/components/contracts/ContractInformation.tsx`

Displays the left panel with metadata and contract duration progress.

| Prop | Type | Description |
|---|---|---|
| `client` | `string` | Client name |
| `category` | `string` | Contract category |
| `template` | `string` | Template name used |
| `startDate` | `string` | Pre-formatted `en-GB` date string |
| `endDate` | `string` | Pre-formatted `en-GB` date string |
| `daysRemaining` | `number` | From `contract.expiresInDays` (computed server-side) |
| `progressPercentage` | `number` | `(end - now) / (end - start) * 100`, clamped 0–100 |
| `status` | `string?` | Controls progress bar color and "days remaining" text |
| `description` | `string?` | Contract description; omitted if empty |

**Progress bar color by status:**

| Status | Bar Color |
|---|---|
| `active` | MUI `primary.main` |
| `signed` | Indigo `#6366f1` |
| `expiring` | Amber `#f59e0b` |
| `expired` | Red `#ef4444` |
| default | Gray `#6b7280` |

**Days remaining text variants:**

| Condition | Text |
|---|---|
| `status === 'SIGNED' && daysRemaining > 0` | "Starts in {N} days" |
| `status === 'EXPIRED' OR daysRemaining < 0` | "Expired {N} days ago" |
| `daysRemaining === 0` | "Ends today" |
| default | "{N} days remaining" |

---

### ContractDetailsPanel

**File:** `src/components/contracts/ContractDetailsPanel.tsx`

Right panel with two tabs: **Documents** and **Activity**.

| Prop | Type | Description |
|---|---|---|
| `documents` | `Document[]` | List of PDF documents to display |
| `activities` | `Activity[]` | Chronological audit trail |
| `onViewDocument` | `(doc) => void` | Called when user clicks View icon or document row |
| `onDownloadDocument` | `(doc) => void` | Called when user clicks Download icon |

**Document interface:**

```typescript
interface Document {
    id: string;
    name: string;
    size: string;           // e.g. 'PDF'
    uploadDate: string;     // en-GB formatted date string
    url?: string;           // MinIO presigned URL or data URI
    chainLabel?: 'Original' | 'Predecessor' | 'This contract' | 'Renewal' | 'Draft (Renewal)';
}
```

**Activity interface:**

```typescript
interface Activity {
    id: string;
    title: string;
    user: string;
    date: string;   // en-GB formatted date string
}
```

---

### SignatureProgressTimeline

**File:** `src/components/contracts/SignatureProgressTimeline.tsx`

Horizontal timeline with one node per signing order. Includes finalization controls at the bottom.

| Prop | Type | Description |
|---|---|---|
| `contract` | `any` | Full contract object (reads `internalSigners`, `externalSigners`, `parties`, `formFields`, `finalizedAt`) |
| `isFinalized` | `boolean` | Whether `signatureFlowStatus === 'finalized'` |
| `canFinalize` | `boolean` | Whether the Finalize button should be enabled |
| `currentOrder` | `number \| null \| undefined` | Active signing order |
| `uniqueOrders` | `number[]` | Sorted deduplicated list of all order numbers |
| `finalizing` | `boolean` | Loading state for the Finalize button |
| `finalizeError` | `string \| null` | Error message to show in the error Alert |
| `finalizeSuccess` | `boolean` | Whether finalization succeeded (shows success Alert) |
| `onFinalize` | `() => void` | Callback when user clicks Finalize |

**Signer card states:**

| State | Visual |
|---|---|
| `pending` | Empty circle outline, gray background |
| `unlocked` | Hourglass icon (`HourglassEmptyIcon`), amber background |
| `completed` | Checkmark icon (`CheckCircleIcon`), green background, completion date shown |

**Party color dot:** Each signer card shows a colored dot matching the party's `color` field from `contract.parties`. If `contract.parties` is empty, parties are derived from `contract.formFields[].assignedParty`.

---

## 16. UI Layout & Render States

### State: Loading

```
<AppLayout>
    <ContractDetailShimmer />   ← pulsing skeleton cards
</AppLayout>
```

Displayed while `loading === true`.

### State: Not Found

```
<AppLayout>
    <Box centered>
        <Typography>{t('notFound')}</Typography>
        <Typography>ID: {id}</Typography>
        <IconButton>← Go Back</IconButton>
    </Box>
</AppLayout>
```

Displayed when `loading === false && contract === null`.

### State: Main View

```
<AppLayout>
    ┌─ Page Box (flex column, full height) ─────────────────────────────────┐
    │                                                                         │
    │  ┌─ Header Row ─────────────────────────────────────────────────────┐  │
    │  │  [← Back]  {Title}  [Status Chip]    [History Button?]          │  │
    │  └──────────────────────────────────────────────────────────────────┘  │
    │                                                                         │
    │  ┌─ Scrollable Content ───────────────────────────────────────────┐    │
    │  │                                                                  │    │
    │  │  [Terminated Banner?]          ← shown when status=TERMINATED  │    │
    │  │                                                                  │    │
    │  │  [SignatureProgressTimeline?]  ← shown for multi-party contracts│    │
    │  │                                                                  │    │
    │  │  ┌─ Grid (1.5fr / 1fr on lg+) ─────────────────────────────┐  │    │
    │  │  │  ContractInformation  │  ContractDetailsPanel             │  │    │
    │  │  │  (left, larger)       │  (right, Documents + Activity)   │  │    │
    │  │  └──────────────────────────────────────────────────────────┘  │    │
    │  └──────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────┘

    <DocumentViewerDialog open={viewerOpen} ... />     ← modal overlay
    <ContractHistoryPanel open={historyPanelOpen} />   ← popover/drawer
    <ContractHistoryDialog open={!!historyDialogEntry} /> ← dialog
</AppLayout>
```

### Terminated Banner

```
[BlockOutlinedIcon]  Terminated on {DD/MM/YYYY} by {email}. No further actions can be taken.
```

Shown when `contract.status === ContractStatus.TERMINATED`. Uses a red-tinted background (`#fef2f2` / `rgba(239,68,68,0.08)` in dark mode).

### History Button

Shown when `contract.renewedFromId` or `contract.renewedContractId` is set. Located in the header's right action area. Opens `ContractHistoryPanel`.

---

## 17. Contract Data Model

The full `Contract` interface is defined in `src/types/contract.ts`. Key fields consumed by this page:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB ObjectId as string |
| `title` | `string` | Raw title (may contain `(Renewal)` suffix) |
| `status` | `ContractStatus` | Current lifecycle status |
| `client` | `string` | Client name |
| `category` | `string` | Contract category |
| `templateId` | `string` | ID of the originating template |
| `templateName` | `string` | Template display name |
| `description` | `string` | Contract description |
| `startDate` | `string?` | ISO date string |
| `endDate` | `string?` | ISO date string |
| `expiresInDays` | `number` | Days to expiry (computed by Spring Boot) |
| `createdAt` | `string` | ISO datetime |
| `createdBy` | `string` | Email of creator |
| `updatedAt` | `string?` | ISO datetime of last change |
| `signatureFlowStatus` | `SignatureFlowStatus?` | Multi-party flow phase |
| `currentSigningOrder` | `number?` | Active signing order |
| `internalSigners` | `InternalSigner[]?` | Internal users in the signing flow |
| `externalSigners` | `ExternalSigner[]?` | External clients in the signing flow |
| `parties` | `PartyConfiguration[]?` | Party color/label config from template |
| `partyCompletions` | `PartyCompletion[]?` | Per-party completion tracking |
| `formFields` | `any[]?` | PDF form field definitions with assignments |
| `xfdfData` | `string?` | XFDF annotation data (current state) |
| `signedPdfBase64` | `string?` | Full signed PDF as base64 (highest-priority viewer source) |
| `fileUrl` | `string?` | MinIO URL to the contract PDF |
| `finalizedAt` | `string?` | ISO datetime when finalized |
| `finalizedBy` | `string?` | Email of finalizer |
| `terminatedAt` | `string?` | ISO datetime of termination |
| `terminatedBy` | `string?` | Email of who terminated |
| `renewedFromId` | `string?` | ID of parent contract (set on renewals) |
| `renewedContractId` | `string?` | ID of active renewal draft (set on originals) |
| `renewalStatus` | `'in_progress'?` | Set on original while renewal is being processed |
| `reviewers` | `ReviewerInfo[]?` | Review workflow participants |
| `approver` | `ApproverInfo?` | Approval workflow participant |

---

## 18. ContractStatus Enum

Defined in `src/types/contract.ts`.

| Value | Description |
|---|---|
| `DRAFT` | Contract created, not yet submitted |
| `IN_REVIEW` | Submitted for review, awaiting reviewer action |
| `IN_APPROVAL` | Submitted for approval, awaiting approver action |
| `READY_FOR_SIGNATURE` | Approved, ready to be sent for signature |
| `IN_SIGNATURE` | Active signing flow (first signer has been sent) |
| `SIGNED_BY_EVERYONE` | All signers completed, pending contractor finalization |
| `SIGNED` | Finalized and effective (start date in future) |
| `ACTIVE` | Effective and within validity period |
| `EXPIRING` | Within 30 days of expiry (computed server-side by Spring Boot) |
| `EXPIRED` | Past end date |
| `TERMINATED` | Manually terminated; irreversible |
| `REJECTED` | Generic rejection |
| `REJECTED_BY_REVIEWER` | Rejected during review workflow |
| `REJECTED_BY_APPROVER` | Rejected during approval workflow |

---

## 19. SignatureFlowStatus Values

Defined in `src/types/contract.ts` as `SignatureFlowStatus`.

| Value | Meaning |
|---|---|
| `draft` | No signing flow initiated |
| `pending_signatures` | Signing flow active; waiting for completions |
| `all_completed` | Every signer at every order has completed; Finalize button enabled |
| `finalized` | Contractor finalized; emails sent; PDF archived |

---

## 20. Internationalization

The page uses two translation namespaces via `next-intl`.

### `contractDetail` namespace keys used by this page and its sub-components

| Key | Used by | Default (en) |
|---|---|---|
| `goBack` | Header tooltip | "Go Back" |
| `notFound` | Not-found state | "Contract Not Found" |
| `contractHistory` | History button tooltip | "Contract History" |
| `terminatedOn` | Terminated banner | "Terminated on" |
| `terminatedBy` | Terminated banner | "by" |
| `noFurtherActions` | Terminated banner | "No further actions can be taken." |
| `signatureProgress` | Timeline header | "Signature Progress" |
| `contractFinalized` | Timeline header (finalized) | "Contract Finalized" |
| `orderActive` | Timeline order chip | "Order {order} Active" |
| `inProgress` | Timeline order label | "In Progress" |
| `pending` | Timeline order label | "Pending" |
| `done` | Timeline order label | "Done" |
| `allPartiesCompleted` | Timeline alert | "All parties have completed signing." |
| `waitingForParties` | Timeline info alert | "Waiting for all parties to complete signing." |
| `finalizeContract` | Finalize button | "Finalize Contract" |
| `finalizing` | Finalize button (loading) | "Finalizing..." |
| `finalizeSuccess` | Finalize success alert | "Contract finalized successfully." |
| `finalizedCopy` | Post-finalize alert | "Signed copies have been emailed to all parties." |
| `contractInformation` | Info panel heading | "Contract Information" |
| `client` | Info panel label | "Client" |
| `category` | Info panel label | "Category" |
| `template` | Info panel label | "Template" |
| `startDate` | Info panel label | "Start Date" |
| `endDate` | Info panel label | "End Date" |
| `description` | Info panel label | "Description" |
| `contractProgress` | Progress section label | "Contract Progress" |
| `daysRemaining` | Progress text | "{days} days remaining" |
| `startsIn` | Progress text | "Starts in {days} days" |
| `expiredDaysAgo` | Progress text | "Expired {days} days ago" |
| `endsToday` | Progress text | "Ends today" |
| `percentRemaining` | Progress text | "{pct}% remaining" |
| `documents` | Details panel tab | "Documents" |
| `activity` | Details panel tab | "Activity" |
| `uploaded` | Document row | "Uploaded {date}" |
| `viewDocument` | Document icon tooltip | "View Document" |
| `downloadDocument` | Document icon tooltip | "Download Document" |
| `noActivity` | Activity empty state | "No activity recorded." |

### `contractStatus` namespace keys

One key per `ContractStatus` enum value (e.g., `ACTIVE`, `DRAFT`, `IN_REVIEW`, etc.). Used by the status Chip in the page header.

---

## 21. Error Handling

| Scenario | Behavior |
|---|---|
| Contract not found (`getContractDetails` returns `null`) | Error thrown in catch; `contract` stays `null`; "Not Found" UI shown |
| Template fetch failure | Silently swallowed; `contractTemplate` stays `null`; template fallback not available in viewer |
| View URL fetch failure | `viewUrl` is `''`; document row still appears but viewer may show blank |
| Finalize API failure | `finalizeError` set to error message; displayed as red Alert in `SignatureProgressTimeline` |
| PDF save failure | `console.error` only; no user-facing error surfaced (known limitation) |
| Polling fetch failure | `console.warn` only; silent retry on next interval |
| Navigation away during load | `isMounted = false` prevents `setState` on unmounted component |

---

## 22. Known Limitations

| # | Limitation | Impact |
|---|---|---|
| 1 | `expiresInDays` must be computed server-side by Spring Boot | If Spring Boot does not populate this field, the progress bar shows 0 days remaining for all contracts |
| 2 | PDF save errors are not shown to the user | Silent failure — user may not know their edits were not saved |
| 3 | `displayDetails` falls back to `contract` fields without activities when `loadData` fails partially | Activity tab may appear empty even if the contract loaded |
| 4 | Polling interval is fixed at 12 s and cannot be adjusted per-route | May cause unnecessary API calls for long-running workflows |
| 5 | `handleDownloadDocument` writes to `document.body` directly — not compatible with SSR | No effect in production (page is `'use client'`), but relevant for test environments |
| 6 | Legacy single-signer flow (`signingRequest`) is still supported but only shown when `externalSigners` and `internalSigners` are both empty | Mixed-mode contracts (if they exist) could render incorrectly |
| 7 | `displayTitle` strips the regex `/\s*\(Renewal\d*\)$/i` — only removes the **last** suffix | Titles with multiple stacked suffixes like `(Renewal)(Renewal2)` have only the last one removed |

> **Note on point 7:** The regex intentionally strips only the trailing suffix so the raw database title is never modified. The full raw title remains in `contract.title`; `displayTitle` is for UI display only.
