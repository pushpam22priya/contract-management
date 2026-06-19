# Signature & Sharing Workflow — Implementation Reference

**Document Type:** Implementation Reference  
**System:** Contract Management System (CMS)  
**Module:** Signature & Sharing Pipeline  
**Frontend Stack:** Next.js 16 · React 19 · TypeScript · MUI v7 · Apryse/PDFTron WebViewer v11  
**Backend:** Spring Boot (port 8080, proxied via `/api/backend/*`)  
**Storage:** MinIO (PDF files) · MongoDB (contract metadata, signer state)  
**Status:** Fully Implemented — Spring Boot integration complete  
**Last Updated:** 2026-06-19

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Model — Contract Signing Fields](#2-data-model--contract-signing-fields)
3. [End-to-End Signing Flow](#3-end-to-end-signing-flow)
4. [Frontend File Reference](#4-frontend-file-reference)
5. [Spring Boot API Reference](#5-spring-boot-api-reference)
6. [PDF Storage in MinIO](#6-pdf-storage-in-minio)
7. [Party Restriction & Field Assignment](#7-party-restriction--field-assignment)
8. [Error Handling Reference](#8-error-handling-reference)
9. [Known Issues & Pending Fixes](#9-known-issues--pending-fixes)  
   — Issue 1 (party assignments lost on save) **FIXED**  
   — Issue 4 (external signer party restriction broken) **NEW**
10. [Testing Checklist](#10-testing-checklist)

---

## 1. Architecture Overview

### Responsibility Split

| Concern | Owner |
|---|---|
| Token generation | Spring Boot |
| Signature request storage | Spring Boot (MongoDB) |
| PDF storage | Spring Boot → MinIO |
| Email delivery | Spring Boot SMTP (JavaMailSender) |
| Auto-advance between signers | Spring Boot `AutoAdvanceService` |
| PDF rendering & field editing | Frontend (Apryse/PDFTron WebViewer v11) |
| Party restriction enforcement | Frontend (`PDFViewerContainer`, `sign/[token]/page.tsx`) |
| Field value collection | Frontend (Apryse field change events) |
| Signed PDF upload | Frontend → MinIO directly via presigned URLs |

The frontend is a pure UI layer. It renders the viewer, collects field values, uploads the signed PDF to MinIO via presigned URLs, then tells Spring Boot to record the completion. Spring Boot handles all state machine transitions, email sending, and auto-advance.

### Proxy Setup

All Spring Boot calls go through the Next.js rewrite proxy defined in `next.config.ts`:

```
Browser → localhost:3000/api/backend/* → localhost:8080/*
```

This proxy streams the request body directly — **no 4 MB body limit**. It forwards all headers including `Authorization`.

**Public endpoints** (external signer pages): use plain `fetch` — no JWT.  
**Authenticated endpoints** (contractor, internal signers): use `httpClient` from `src/lib/httpClient.ts` — reads JWT from `sessionStorage.getItem('cms_current_user')` and adds `Authorization: Bearer {token}`.

---

## 2. Data Model — Contract Signing Fields

These fields live on the contract document in MongoDB and are managed by Spring Boot.

```typescript
// On the contract document
{
    // Signer arrays
    internalSigners: [{
        email: string;
        name?: string;
        partyId: string;
        partyLabel: string;
        order: number;
        status: 'pending' | 'unlocked' | 'completed';
        assignedAt?: string;      // ISO — when the assignment was created
        unlockedAt?: string;      // ISO — when auto-advance unlocked them
        completedAt?: string;     // ISO — when they submitted
        userId?: string;
    }];

    externalSigners: [{
        email: string;
        name?: string;
        partyId: string;
        partyLabel: string;
        order: number;
        status: 'pending' | 'unlocked' | 'completed';
        token: string;            // One-time signing token (sig_{timestamp}_{random})
        sentAt?: string;          // ISO — when the email was sent
        unlockedAt?: string;      // ISO — when auto-advance unlocked them
        completedAt?: string;     // ISO — when they submitted
    }];

    // Signing workflow state
    currentSigningOrder: number;        // Which order is currently active
    signatureFlowStatus:
        | 'pending_signatures'          // Signing is in progress
        | 'all_completed'              // All signers done — ready to finalize
        | 'finalized';                 // Contract finalized, final PDF created

    // PDF content
    xfdfData: string;                  // Accumulated XFDF — updated after each signing step
    fieldValues: Record<string, string>; // Accumulated form field values
    formFields: FormFieldDefinition[];  // Field structure with assignedParty info
    parties: PartyConfiguration[];      // Party definitions (id, label, color)

    // File state
    fileUploaded: boolean;             // True once original PDF is uploaded to MinIO
    finalizedAt?: string;              // ISO — when finalize was called
    finalizedBy?: string;             // Email of whoever finalized
}
```

### Signer Status Lifecycle

```
pending  →  unlocked  →  completed
```

- **pending**: Assigned but not yet their turn. Signing link is inactive.
- **unlocked**: It is this signer's turn. Auto-advance (or initial assignment) set this status and sent the email.
- **completed**: Signer has submitted their signed PDF. Auto-advance runs next.

### `signatureFlowStatus` Lifecycle

```
(not set)  →  pending_signatures  →  all_completed  →  finalized
```

Spring Boot transitions these automatically. The frontend reads `signatureFlowStatus` to show the Finalize button.

---

## 3. End-to-End Signing Flow

### Step 1 — Contractor Assigns Signers

**UI:** `MultiPartySignatureDialog` (opened via share icon on contract card in `ContractsContent.tsx`)

**What the frontend does:**
1. Fetches the full contract via `apiService.getContractDetails(id)` (the list endpoint omits `formFields` and `parties`)
2. Opens `MultiPartySignatureDialog` with `parties`, `formFields`, `existingExternalSigners`, `existingInternalSigners`
3. User picks a party, signer type (internal/external), email, and the dialog auto-assigns sequential order numbers
4. On submit: calls `submitForSignature(contractId, assignments, senderName)` from `externalSignatureService.ts`

**API call:**
```
POST /api/backend/contracts/{id}/submit-for-signature
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "assignments": [
    { "partyId": "party_1", "partyLabel": "Buyer", "type": "external",
      "email": "buyer@client.com", "name": "John Doe", "order": 1 },
    { "partyId": "party_2", "partyLabel": "Seller", "type": "internal",
      "email": "alice@company.com", "userId": "user_abc", "order": 2 }
  ],
  "senderName": "Priya Sharma"
}
```

**What Spring Boot does:**
- Creates sign request records for external signers (generates tokens)
- Populates `externalSigners[]` and `internalSigners[]` on the contract
- Sets `currentSigningOrder = 1`, `signatureFlowStatus = 'pending_signatures'`
- Unlocks all signers at order 1 (sets status → `unlocked`)
- Sends email to each order-1 external signer with their signing link
- Returns the full updated contract

**Linear signing chain rule:** Orders are globally unique across the entire contract lifetime. There are no rounds. Whether signing is still in progress or all previous signers have completed, new assignments must always continue from `maxExistingOrder + 1`. Spring Boot returns 400 if any new assignment has `order <= maxExistingOrder`. `MultiPartySignatureDialog` handles this:
```typescript
// existingMaxOrder = Math.max(...externalSigners.map(s => s.order), ...internalSigners.map(s => s.order))
const startOrder = existingMaxOrder > 0 ? existingMaxOrder + 1 : 1;
```

**Re-share when all completed:** When `signatureFlowStatus === 'all_completed'`, the Assign Signers dialog opens and new assignments are immediately set to `unlocked` in Spring Boot's response — no auto-advance delay. The response already has `status: 'unlocked'` for the new signers.

**`signingRound` field:** This field still appears on `externalSigners[]`, `internalSigners[]`, and the contract object in API responses. It is kept for backward compatibility with existing documents only. It carries no logic meaning. Do not display it or use it in any logic.

---

### Step 2 — External Signer Opens Signing Link

**URL:** `localhost:3000/sign/{token}`  
**File:** `src/app/sign/[token]/page.tsx`  
**Auth:** None — this page is fully public, all calls use plain `fetch`

#### Load Phase

```typescript
const BACKEND = '/api/backend';

// 1. Load signer data and contract info
const res = await fetch(`${BACKEND}/sign-requests/${token}`);
// Response includes: assignedParty, formFields, xfdfData, fieldValues, parties, etc.

// 2. Mark as viewed (fire-and-forget)
fetch(`${BACKEND}/sign-requests/${token}/viewed`, { method: 'PATCH' }).catch(() => {});

// 3. Get presigned MinIO URL for the PDF
const fileUrlRes = await fetch(`${BACKEND}/sign-requests/${token}/file-url`);
const { url: pdfUrl } = await fileUrlRes.json();
setDocumentUrl(pdfUrl);
// Apryse loads the PDF directly from MinIO via this URL (no proxy involved)
```

The `file-url` endpoint returns a presigned MinIO URL. Apryse loads the PDF directly from MinIO — no body goes through the Next.js proxy.

#### Submit Phase (4-Step Chunked Upload)

All 4 steps use plain `fetch` (no JWT):

```typescript
// Step 1: Initiate multipart upload session in MinIO
POST /api/backend/sign-requests/{token}/upload/initiate
→ { uploadId: string }

// Step 2: Get presigned URL for each 10 MB chunk
GET /api/backend/sign-requests/{token}/upload/presign?uploadId={id}&partNumber={n}
→ { url: string }  // MinIO presigned URL

// Step 3: PUT chunk directly to MinIO (no auth, no proxy)
PUT {presignedUrl}  ← raw chunk bytes
→ ETag header captured for each part

// Step 4: Tell Spring Boot to assemble parts and record signature
POST /api/backend/sign-requests/{token}/upload/complete
Content-Type: application/json
{
  "uploadId": "...",
  "parts": [{ "partNumber": 1, "eTag": "\"abc123\"" }, ...],
  "xfdf": "<?xml version...",         // CRITICAL: Apryse XFDF string
  "fieldValues": { "field": "val" },
  "formFields": [...],
  "autoSave": false
}
```

**On 409 response:** The contract changed since the page loaded (another signer completed). The page reloads automatically: `window.location.reload()`.

**On any error:** The upload is aborted:
```typescript
fetch(`${BACKEND}/sign-requests/${token}/upload/abort?uploadId={id}`, { method: 'POST' })
```

**What Spring Boot does on complete:**
- Assembles all uploaded parts into `{contractId}_signed.pdf` in MinIO
- Saves `xfdf` to `contract.xfdfData` (accumulated XFDF)
- Saves `fieldValues` to `contract.fieldValues`
- Marks the external signer's status → `completed`
- Runs `AutoAdvanceService` — unlocks next-order signers, sends emails

---

### Step 3 — Internal Signer Signs from Inbox

**File:** `src/app/inbox/page.tsx`  
**Auth:** JWT required — uses `httpClient`

#### Load Phase

```typescript
// Fetch full contract (list endpoint omits formFields — needed for autofill)
const full = await apiService.getContractDetails(id);

// Get presigned MinIO URL for the PDF
const viewUrl = await apiService.getContractViewUrl(id);
// → GET /api/backend/contracts/{id}/file/view-url
// Returns presigned URL for _signed.pdf if it exists, else original PDF
```

The internal signer's viewer shows `initialXfdf={contract.xfdfData}` so previous signers' annotations appear in the document.

#### Submit Phase (4-Step Chunked Upload via `httpClient`)

```typescript
// Step 1: Initiate (JWT authenticated)
POST /api/backend/contracts/{id}/sign/upload/initiate
→ { uploadId: string }

// Step 2: Get presigned URL per chunk (JWT authenticated)
GET /api/backend/contracts/{id}/sign/upload/presign?uploadId={id}&partNumber={n}
→ { url: string }

// Step 3: PUT chunk directly to MinIO (no auth — presigned URL handles it)
PUT {presignedUrl}

// Step 4: Record signature (JWT authenticated)
POST /api/backend/contracts/{id}/internal-sign
{
  "signerEmail": "alice@company.com",
  "uploadId": "...",
  "parts": [...],
  "xfdf": "<?xml...",         // CRITICAL: accumulated XFDF
  "fieldValues": { ... },
  "formFields": [...]
}
```

**On success:** Closes viewer, reloads inbox contract list.  
**On error:** Aborts upload via `POST /contracts/{id}/sign/upload/abort?uploadId={id}`.

---

### Step 4 — Auto-Advance (Spring Boot Owned)

After every signing completion (both internal and external), Spring Boot's `AutoAdvanceService` runs automatically:

1. Reads all signers globally (no round filtering — orders are unique across the contract lifetime)
2. Checks if all signers at the current `currentSigningOrder` are `completed`
3. If yes: finds the next order in the global list, sets those signers to `unlocked`, sends emails to external ones
4. If no more orders exist: sets `signatureFlowStatus = 'all_completed'`

The frontend does not trigger or participate in auto-advance.

---

### Step 5 — Contractor Finalizes

**Trigger:** `signatureFlowStatus === 'all_completed'` — Finalize button appears on the contract detail page (`src/app/contracts/[id]/page.tsx`)

**API call:**
```
POST /api/backend/contracts/{id}/finalize
Authorization: Bearer {jwt}
```

**What Spring Boot does:**
- Creates the final combined PDF (`{contractId}_final.pdf`) in MinIO
- Sets `status = 'SIGNED'`, `signatureFlowStatus = 'finalized'`
- Emails signed copies to all parties

**Frontend code** (`src/services/externalSignatureService.ts`):
```typescript
export async function finalizeContract(contractId: string) {
    const res = await httpClient.post(`/contracts/${contractId}/finalize`, {});
    if (!res.ok) return { success: false, message: res.message };
    return { success: true, contract: res.data };
}
```

---

## 4. Frontend File Reference

### `src/services/externalSignatureService.ts`

Three exported functions:

| Function | Auth | Purpose |
|---|---|---|
| `submitForSignature(contractId, assignments, senderName)` | JWT via `httpClient` | Assigns signers — calls `POST /contracts/{id}/submit-for-signature` |
| `getSignatureRequestData(token)` | None | Loads public signing page data — calls `GET /sign-requests/{token}` |
| `finalizeContract(contractId)` | JWT via `httpClient` | Finalizes contract — calls `POST /contracts/{id}/finalize` |

> Note: `completeExternalSignature()` still exists in this file but is **not used** by the signing page. The signing page calls the chunked upload endpoints directly via plain `fetch`.

---

### `src/app/sign/[token]/page.tsx`

Public page — no login required, no JWT anywhere.

| Responsibility | How |
|---|---|
| Load signer data | `GET /api/backend/sign-requests/{token}` via plain `fetch` |
| Load PDF | `GET /api/backend/sign-requests/{token}/file-url` → presigned MinIO URL → Apryse loads directly |
| Mark viewed | `PATCH /api/backend/sign-requests/{token}/viewed` — fire and forget |
| Party restriction | `editableParties` derived from `signatureRequest.assignedParty` → passed to `PDFViewerContainer` |
| Protected parties | `protectedPartyIds` = all party IDs except the signer's — blocks editing other parties' signatures |
| Pre-filled detection | `initialFieldValuesRef` captures field values on load; on any change to another party's field → show `WrongPartyWarningDialog` and restore original value |
| Field validation | `hasFilledAllAssignedFields` must be true before submit is allowed |
| Sign All shortcut | `handleSignatureApplied` → `ShowSignAllDialog` when multiple signature fields exist |
| Submit PDF | 4-step chunked upload (initiate → presign → PUT → complete), all via plain `fetch` |
| `xfdf` on complete | `xfdfString` from `exportAnnotations()` sent in the complete request — Spring Boot saves to `contract.xfdfData` |

---

### `src/app/inbox/page.tsx`

Authenticated page — shows contracts where the logged-in user is an internal signer.

| Responsibility | How |
|---|---|
| Load contracts | `contractService.getAllContracts()` → filter where `internalSigners[].email === currentUser.email` AND status is `unlocked` or `completed` |
| Full contract fetch | `apiService.getContractDetails(id)` before opening viewer — list endpoint omits `formFields` |
| Load PDF URL | `apiService.getContractViewUrl(id)` → `GET /contracts/{id}/file/view-url` → presigned MinIO URL |
| `initialXfdf` | `contract.xfdfData` passed to viewer — shows all previous signers' annotations |
| Party restriction | `assignedPartyId = currentUserInternalSigner?.partyId` passed to `DocumentViewerDialog` |
| Submit signature | 4-step chunked upload via `httpClient` (JWT) → finalize at `POST /contracts/{id}/internal-sign` |
| `xfdf` on complete | `xfdfString` from `exportAnnotations()` sent in body of internal-sign request |

---

### `src/components/contracts/ContractsContent.tsx`

| Responsibility | How |
|---|---|
| Open Assign Signers dialog | `handleShareContract(id)` — fetches full contract via `apiService.getContractDetails(id)` first |
| Null safety | `formFields={contractForSignature?.formFields ?? []}` — Spring Boot returns `null` for empty arrays, overriding React default props without `??` |
| Submit assignments | `handleMixedSignatureSubmit()` → `submitForSignature(id, assignments, senderName)` |
| Update local state | After successful submit: `setContractForSignature(result.contract)` to reflect new signer state |

---

### `src/components/contracts/MultiPartySignatureDialog.tsx`

| Responsibility | How |
|---|---|
| Party list | Derived from `parties` prop if available; else derived from `formFields[].assignedParty` |
| Party filtering | Only shows parties that have at least one form field assigned; hides parties already assigned or fully filled by contractor |
| Contractor-filled detection | Checks `fieldValues` — if all fields of a party have values, that party is shown as "Filled by you" and excluded from available assignments |
| Order computation | Always continues the linear chain: `existingMaxOrder + 1` (first share ever starts at 1). No reset to 1 on re-share. |
| Chain helper text | Shows "Continuing chain from order N" in the New Assignments section when `existingMaxOrder > 0` |
| Drag-to-reorder | New assignments can be reordered before submit — order reflects list position |
| Registered users | Calls `authService.getAllRegisteredUsers()` to populate the internal user dropdown |

---

### `src/app/contracts/[id]/page.tsx`

| Responsibility | How |
|---|---|
| Load PDF URL | `apiService.getContractViewUrl(contractId)` → presigned URL stored in `details.documents[0].url` |
| Polling | `useContractPolling` — auto-refreshes when `signatureFlowStatus !== 'finalized'`; on update, fetches new presigned URL |
| Finalize button | Shown when `canFinalize = allSignersCompleted && signatureFlowStatus === 'all_completed'` |
| `handleSaveChanges` | Called when contractor saves from the viewer — uploads PDF via `contractService.updateContractSignedPdf()`, saves `fieldValues` and `formFields` via `apiService.updateContractMetadata()` |

---

### `src/components/contracts/SignatureProgressTimeline.tsx`

Rendered on the contract detail page. Shows each signing order as a horizontal timeline node with status badges for each signer.

- **Done** (green): signer status is `completed`
- **In Progress** (orange, pulsing): order matches `currentSigningOrder` and not all done
- **Pending** (grey): order is after the current active order
- Finalize button and success/error alerts rendered at the bottom

---

### `src/services/apiService.ts`

Relevant methods for the signing flow:

| Method | API Call | Auth |
|---|---|---|
| `getContractDetails(id)` | `GET /contracts/{id}` | JWT |
| `getContractViewUrl(id)` | `GET /contracts/{id}/file/view-url` | JWT |
| `saveContractPdf(id, blob)` | `PUT /contracts/{id}/file` (< 30 MB) or chunked | JWT |
| `updateContractDocument(id, data)` | `PATCH /contracts/{id}` | JWT |
| `updateContractMetadata(id, updates)` | `PATCH /contracts/{id}` | JWT |

---

## 5. Spring Boot API Reference

### Authenticated Endpoints (require `Authorization: Bearer {jwt}`)

#### `POST /contracts/{id}/submit-for-signature`

Starts or extends the signing workflow. Creates sign requests for external signers, populates signer arrays, sends order-1 emails.

**Request:**
```json
{
  "assignments": [
    {
      "partyId": "party_1",
      "partyLabel": "Buyer",
      "type": "external",
      "email": "buyer@client.com",
      "name": "John Doe",
      "order": 1
    },
    {
      "partyId": "party_2",
      "partyLabel": "Seller",
      "type": "internal",
      "email": "alice@company.com",
      "userId": "user_abc123",
      "order": 2
    }
  ],
  "senderName": "Priya Sharma"
}
```

**Response:** Full contract document with updated `externalSigners`, `internalSigners`, `currentSigningOrder`, `signatureFlowStatus`.

> **Dev shortcut:** External signer token is at `response.externalSigners[n].token`. Build the signing URL: `http://localhost:3000/sign/{token}` — no email needed for testing.

---

#### `GET /contracts/{id}/file/view-url`

Returns a 15-minute presigned MinIO URL for viewing the contract PDF.  
Should return `_signed.pdf` if it exists (cumulative signed version), else the original.

**Response:** `{ "url": "https://minio.../..." }`

---

#### `POST /contracts/{id}/sign/upload/initiate`

Starts a MinIO multipart upload session for an internal signer's PDF.

**Response:** `{ "uploadId": "..." }`

---

#### `GET /contracts/{id}/sign/upload/presign?uploadId={id}&partNumber={n}`

Returns a presigned MinIO URL for uploading one 10 MB chunk.

**Response:** `{ "url": "https://minio.../..." }`

---

#### `POST /contracts/{id}/internal-sign`

Records an internal signer's completion and triggers auto-advance.

**Request:**
```json
{
  "signerEmail": "alice@company.com",
  "uploadId": "...",
  "parts": [{ "partNumber": 1, "eTag": "\"abc123\"" }],
  "xfdf": "<?xml version=\"1.0\"...",
  "fieldValues": { "FullName": "Alice Kumar" },
  "formFields": [...]
}
```

**Response:** `{ "success": true, "message": "Signature submitted successfully" }`

---

#### `POST /contracts/{id}/sign/upload/abort?uploadId={id}`

Aborts a failed MinIO multipart upload. Called automatically by the frontend on any error after initiate succeeds.

---

#### `POST /contracts/{id}/finalize`

Creates the final combined PDF, sets `status = SIGNED`, `signatureFlowStatus = finalized`, emails all parties.

**Response:** Full updated contract document.

---

### Public Endpoints (no auth — external signer page)

#### `GET /sign-requests/{token}`

Returns all data the signing page needs.

**Response:**
```json
{
  "token": "sig_...",
  "contractId": "...",
  "contractTitle": "Service Agreement",
  "signerEmail": "buyer@client.com",
  "signerName": "John Doe",
  "status": "unlocked",
  "expiresAt": "2026-07-16T00:00:00Z",
  "assignedParty": "party_1",
  "assignedPartyLabel": "Buyer",
  "formFields": [...],
  "xfdfData": "<?xml...",
  "fieldValues": { "field_name": "pre-filled-value" },
  "parties": [{ "id": "party_1", "label": "Buyer", "color": "#4CAF50" }]
}
```

`assignedParty` may be a string or array. `formFields` and `xfdfData` include all previous signers' work.

---

#### `GET /sign-requests/{token}/file-url`

Returns a presigned MinIO URL for the signing PDF.  
Serves `_signed.pdf` (with prior signers' annotations baked in) if it exists, else the original PDF.

**Response:** `{ "url": "https://minio.../..." }`

---

#### `PATCH /sign-requests/{token}/viewed`

Marks the sign request as viewed. Called immediately after loading, fire-and-forget.

---

#### `POST /sign-requests/{token}/upload/initiate`

Starts a MinIO multipart upload session for the external signer's PDF.

**Response:** `{ "uploadId": "..." }`

---

#### `GET /sign-requests/{token}/upload/presign?uploadId={id}&partNumber={n}`

Returns a presigned URL for one 10 MB chunk of the external signer's upload.

**Response:** `{ "url": "https://minio.../..." }`

---

#### `POST /sign-requests/{token}/upload/complete`

Assembles chunks, saves signed PDF to MinIO, records signature, triggers auto-advance.

**Request:**
```json
{
  "uploadId": "...",
  "parts": [{ "partNumber": 1, "eTag": "\"abc123\"" }],
  "xfdf": "<?xml version=\"1.0\"...",
  "fieldValues": { "FullName": "John Doe" },
  "formFields": [...],
  "autoSave": false
}
```

**Response:** `{ "success": true, "message": "Signature submitted successfully" }`  
**409 Conflict:** Contract was modified since page load — frontend reloads the page.

---

#### `POST /sign-requests/{token}/upload/abort?uploadId={id}`

Aborts a failed external signer upload. Called on any error after initiate succeeds.

---

## 6. PDF Storage in MinIO

### File Naming Convention

| File | Purpose |
|---|---|
| `contracts/{contractId}.pdf` | Original template/contract PDF — never modified |
| `contracts/{contractId}_signed.pdf` | Cumulative signed PDF — overwritten after each signer completes |
| `contracts/{contractId}_final.pdf` | Final finalized PDF — created by Spring Boot on `POST /finalize` |

### Sequential Signing Chain

The `_signed.pdf` file is the key to making each signer see previous signers' work:

| Signing step | Signer loads | Exports | Backend saves to |
|---|---|---|---|
| Signer 1 signs | `contract.pdf` (original) | PDF with S1's work | `contract_signed.pdf` |
| Signer 2 signs | `contract_signed.pdf` (contains S1) | PDF with S1 + S2 | `contract_signed.pdf` (overwritten) |
| Signer N signs | `contract_signed.pdf` (contains S1→SN-1) | PDF with all previous + SN | `contract_signed.pdf` (overwritten) |

At any point during signing: `GET /file/view-url` and `GET /sign-requests/{token}/file-url` should return `_signed.pdf` if it exists — this ensures the contract owner and each subsequent signer always see the latest cumulative state.

> **Current backend status:** This chaining requires the two `file-url` endpoints to check for `_signed.pdf` existence before falling back to the original. If this is not yet implemented, each signer loads the original and their `_signed.pdf` only contains their own work — prior signers' annotations will not be visible. See §9.

---

## 7. Party Restriction & Field Assignment

### How Field Assignment Works

Each field in `formFields` carries:
```typescript
{
  name: string;         // PDF field name (Apryse identifier)
  type: string;         // 'text' | 'signature' | 'checkbox' | etc.
  assignedParty: string; // Party ID that owns this field
  partyLabel: string;   // Human-readable party label
  partyColor: string;   // Hex color for UI display
  profileKey?: string;  // Autofill key (e.g. 'email', 'fullName')
  value?: string;       // Pre-filled value (contractor filled)
}
```

### External Signer Restriction (`sign/[token]/page.tsx`)

- `editableParties = [signatureRequest.assignedParty]` — passed to `PDFViewerContainer`; **requires `assignedParty` to be non-null in the backend response** (see Issue 4)
- `protectedPartyIds` = all party IDs NOT in `editableParties` — prevents modifying other parties' signatures
- `handleFieldChange` — detects changes to other parties' fields, shows `WrongPartyWarningDialog`, and restores the original value; also requires `signatureRequest.assignedParty` to be non-null
- `hasFilledAllAssignedFields` — all non-pre-filled fields of the signer's assigned party must be filled before submit is allowed
- Apryse-level enforcement reads `annot.getCustomData('assignedParty')` — this value is embedded in the XFDF; the `xfdfData` field in the sign request response must be the original template XFDF that contains the `setCustomData` values set during field creation

### Internal Signer Restriction (`inbox/page.tsx` → `DocumentViewerDialog`)

- `assignedPartyId = currentUserInternalSigner.partyId` — passed to `DocumentViewerDialog`
- `DocumentViewerDialog` passes `editableParties={[assignedPartyId]}` to `PDFViewerContainer`
- `editableFieldMode="empty-only"` on `DocumentViewerDialog` in the inbox — internal signer can only fill empty fields, not overwrite pre-filled ones

### Contractor View (`contracts/[id]/page.tsx`)

- `currentUserRole="contractor"` on `DocumentViewerDialog`
- `editableFieldMode="empty-only"` — contractor can only fill empty fields (not overwrite signer work after sharing)
- No `assignedPartyId` — contractor can see all fields but is restricted to their own party's pre-fill

---

## 8. Error Handling Reference

Spring Boot error shape:
```json
{ "status": 404, "error": "Not Found", "message": "Human-readable message" }
```

### Submit for Signature Errors

| HTTP | Message | Frontend Action |
|---|---|---|
| 400 | `At least one signer assignment is required` | Show in `MultiPartySignatureDialog` error alert |
| 400 | `Invalid email format: {email}` | Show in dialog |
| 400 | `Duplicate signer email: {email}` | Show in dialog |
| 400 | `Order number {n} is assigned to more than one party` | Show in dialog |
| 400 | `The signing chain must start at order 1` | Show in dialog — dialog auto-starts at 1 when no existing signers |
| 400 | `Order {n} conflicts with an in-progress signer. New signers must have order greater than {maxExistingOrder}...` | Show in dialog — dialog's linear-chain logic should prevent this |
| 400 | `Order {n} is already used. New signers must continue the chain at an order greater than {maxExistingOrder}.` | Show in dialog — dialog's linear-chain logic should prevent this |
| 400 | `Contract file must be uploaded before sending for signature` | Show in dialog |
| 400 | `Cannot add signers — the contract has already completed the signing workflow` | Close dialog, refresh contract |

> **Removed error (no longer returned):** `"All previous signers have completed. New signers must start at order 1."` — This error was part of the old rounds-based system and is no longer returned by Spring Boot. Do not handle it.

### Signing Page (External) Errors

| HTTP | Message | Frontend UI |
|---|---|---|
| 404 | `Signing request not found` | Error screen: "Unable to Load Document" (red `ErrorIcon`) |
| 400 | `You have already submitted your signature` | Error screen: "Signature Already Submitted" — green `CheckCircle` icon + success alert (not the completion screen) |
| 400 | `This signing link expired on {date}` | Error screen: "Unable to Load Document" (red `ErrorIcon`) |
| 409 | `Contract has been modified since you started signing` | `window.location.reload()` |
| 200 + `status: "signed"` | *(success response, already-signed status)* | `setCompleted(true)` — shows the post-submission completion screen |

### Internal Sign Errors (Inbox)

| HTTP | Message | Frontend Action |
|---|---|---|
| 404 | `You are not assigned as a signer on this contract` | Show error snackbar |
| 400 | `You have already completed your signature` | Show snackbar, reload contracts |
| 403 | `It is not yet your turn to sign` | Show snackbar |

### Finalize Errors

| HTTP | Message | Frontend Action |
|---|---|---|
| 400 | `Cannot finalize — not all parties have signed yet` | Show error in timeline |
| 400 | `Contract has already been finalized` | Refresh contract state |

---

## 9. Known Issues & Pending Fixes

### Issue 1 — Party Assignments Lost When Contractor Saves from Detail Page ✅ FIXED

**File:** `src/components/viewer/DocumentViewerDialog.tsx` → `handleSaveClick()`

**Root cause:** `PDFViewerContainer.exportFormFields()` (Apryse API) returns fields with only `name`, `type`, `value`, `readOnly`, `required`, `widget` — it does not include `assignedParty`, `partyLabel`, `partyColor`, or `profileKey`. When the contractor opens a contract from the detail page, edits fields, and clicks "Save Changes", these party-less form fields were saved to the backend via `PATCH /contracts/{id}`, overwriting the original party-aware `formFields`. The next time the Assign Signers dialog was opened, `formFields` had no `assignedParty` data and the dialog appeared empty.

**Fix applied (2026-06-18):** In `DocumentViewerDialog.handleSaveClick()`, after calling `exportFormFields()`, the exported fields are now merged with the incoming `formFields` prop to restore party assignment data before sending to the backend:
```typescript
exportedFormFields = exportedFormFields.map((exportedField: any) => {
    const original = formFields?.find((f: any) => f.name === exportedField.name);
    return {
        ...exportedField,
        value: filledFieldValues[exportedField.name] || exportedField.value || '',
        ...(original?.assignedParty !== undefined && { assignedParty: original.assignedParty }),
        ...(original?.partyLabel !== undefined && { partyLabel: original.partyLabel }),
        ...(original?.partyColor !== undefined && { partyColor: original.partyColor }),
        ...(original?.profileKey !== undefined && { profileKey: original.profileKey }),
    };
});
```

> **Backend recommendation:** As a defence-in-depth measure, Spring Boot should also merge incoming `formFields` on `PATCH /contracts/{id}` — preserving the stored `assignedParty`/`partyLabel`/`partyColor`/`profileKey` on any field where the incoming payload omits them. This prevents any future frontend path that doesn't apply this merge from silently wiping party data.

---

### Issue 2 — Each Signer Loads the Original PDF (No PDF Chaining)

**Affected:** Both `GET /sign-requests/{token}/file-url` and `GET /contracts/{id}/file/view-url`

**Root cause:** Both endpoints currently return a presigned URL for `{contractId}.pdf` (the original), even when `{contractId}_signed.pdf` exists from a previous signer. This means every signer starts from a blank template — they cannot see prior signers' work in the document itself.

**Fix required (backend):** Both endpoints must check if `{contractId}_signed.pdf` exists in MinIO. If it does, return the presigned URL for `_signed.pdf`. Fall back to `{contractId}.pdf` only when no signer has submitted yet.

No frontend changes are needed — the viewer already loads whatever URL these endpoints return.

---

### Issue 3 — External Signer in Order 2+ Returns 404 on Link Open

**Symptom:** When the signing order is internal (order 1) → external (order 2), the auto-advance runs correctly after the internal signer completes and sends the email. But when the external signer opens the link, `GET /sign-requests/{token}` returns `404 "Signing request not found"`.

**Root cause (backend):** This is a Spring Boot issue. Possible causes:
1. The sign request record is created at assignment time with status `pending`, and the `GET /sign-requests/{token}` endpoint may filter by status in a way that excludes it after auto-advance transitions it to `unlocked`
2. The auto-advance may update the signer status in the `externalSigners` array on the contract document but not in the separate sign-requests collection
3. The token lookup may be case-sensitive or have a mismatch

**Workaround for now:** Use the external → internal order (external is order 1, internal is order 2). This works correctly in all tested cases.

**Fix required (backend):** Investigate the `GET /sign-requests/{token}` handler and the auto-advance logic to ensure the sign request record is correctly created, updated to `unlocked` status, and retrievable by token after auto-advance fires.

---

### Issue 4 — External Signer Can Fill All Parties' Fields (Party Restriction Not Enforced)

**Files affected:** `src/app/sign/[token]/page.tsx`, `src/components/viewer/PDFViewerContainer.tsx`

**Symptom:** An external signer can fill in form fields belonging to other parties. The wrong-party warning dialog never appears.

**Root cause — two separate failures:**

**Failure A (primary): `assignedParty` is null in Spring Boot's `GET /sign-requests/{token}` response.**

Every restriction in the signing page is gated on `signatureRequest.assignedParty`. When it is `null`:

```typescript
// sign/[token]/page.tsx — editableParties computation
if (signatureRequest.assignedParty) {      // null → skipped
    return [signatureRequest.assignedParty];
}
return undefined;  // → "legacy mode: edit all fields"
```

With `editableParties = undefined`:
- `PDFViewerContainer`'s `MULTI-PARTY FIELD EDITABILITY` block never runs (guarded by `if (editableParties && editableParties.length > 0 ...)`) — all form fields stay at their default `ReadOnly=false`
- `protectedPartyIds = undefined` — no signature protection
- `handleFieldChange` wrong-party check is skipped (guarded by `&& signatureRequest?.assignedParty`) — warning dialog never fires

**Failure B (secondary): `formFields[].assignedParty` is null per field.**

Even if `assignedParty` at root level is fixed, the per-field wrong-party check and the Apryse-level field restriction also require each field to carry `assignedParty`:
- `handleFieldChange` at `sign/[token]/page.tsx` looks up `field?.assignedParty` from `signatureRequest.formFields`
- `PDFViewerContainer` reads `annot.getCustomData('assignedParty')` from Apryse widget annotations — this custom data is embedded in the XFDF string, so `xfdfData` must be returned correctly and must contain the original `setCustomData` values

**Fix required — backend (`GET /sign-requests/{token}` response must include):**

```json
{
  "token": "sig_...",
  "signerEmail": "buyer@client.com",
  "assignedParty": "party_1",         ← signer's partyId from the assignment (MUST NOT BE NULL)
  "assignedPartyLabel": "Buyer",
  "xfdfData": "<?xml ...",            ← XFDF with Apryse annotation custom data intact
  "formFields": [
    {
      "name": "BuyerName",
      "type": "text",
      "assignedParty": "party_1",     ← per-field party assignment (MUST NOT BE NULL)
      "partyLabel": "Buyer",
      "partyColor": "#4CAF50",
      "profileKey": "full_name"
    }
  ]
}
```

The `assignedParty` at root level is the signer's `partyId` from the `assignments[]` sent during `POST /contracts/{id}/submit-for-signature`. Spring Boot already stores this in the sign request record — it just needs to be included in the GET response.

**Fix applied — frontend (2026-06-18):** Issue 1's fix (merging party info back after `exportFormFields()`) ensures that `formFields[].assignedParty` is preserved in the database on contractor saves. This is a prerequisite for Failure B to work once the backend includes `assignedParty` in the response.

**Status: Blocked on backend.** Once Spring Boot returns `assignedParty` (non-null) in `GET /sign-requests/{token}`, both restrictions will activate automatically — no further frontend changes needed.

---

## 10. Testing Checklist

Use the signing token from the `submit-for-signature` API response (in `externalSigners[n].token`) to test without waiting for email.

### Scenario 1 — Single External Signer (Working ✓)
- [x] Submit contract with one external signer (order 1) via dialog
- [x] Page loads with correct PDF, fields only for the assigned party are editable
- [x] Fill fields and submit → 200 response
- [x] `signatureFlowStatus = 'all_completed'` on contract
- [x] Finalize button appears on contract detail page
- [x] Click Finalize → `status = 'SIGNED'`

### Scenario 2 — External First, Internal Second (Working ✓)
- [x] External (order 1) signs → internal (order 2) appears in inbox
- [x] Internal signer sees correct fields in inbox
- [x] Internal signer submits → `all_completed`

### Scenario 3 — Internal First, External Second (Partially Working ⚠)
- [x] Internal (order 1) signs from inbox → email sent to external (order 2)
- [ ] External (order 2) opens link → **BUG: 404 "Signing request not found" (Issue 3 above)**

### Scenario 4 — Two External Signers Sequential (Not Yet Verified)
- [ ] Party 1 (order 1) signs → Party 2 (order 2) gets email and link works
- [ ] Party 2 sees Party 1's annotations in the document
- [ ] Party 2 signs → `all_completed`

### Scenario 5 — PDF Chaining (Not Yet Verified — Pending Backend Fix)
- [ ] After external signer completes, `_signed.pdf` in MinIO contains their work
- [ ] Second signer's `file-url` returns the `_signed.pdf` URL
- [ ] Second signer sees first signer's filled values and signatures in the document

### Scenario 6 — Re-Share After All Completed (Working ✓)
- [x] After `all_completed`, open Assign Signers dialog again
- [x] Dialog shows "Continuing chain from order N" helper text where N = `maxExistingOrder + 1`
- [x] New assignments get order `maxExistingOrder + 1` (no reset to order 1 — linear chain)
- [x] Spring Boot accepts the new assignment and immediately sets new signer to `unlocked`
- [x] No polling delay needed — response already shows the new signer as `unlocked`

### Scenario 7 — Contractor Edits After Assigning Signers (Fixed ✓)
- [x] Contract with parties assigned, contractor opens viewer and saves
- [x] **FIXED: formFields party assignments preserved after save (Issue 1 resolved 2026-06-18)**
- [x] Assign Signers dialog shows parties correctly after contractor save

### Scenario 8 — Autofill for Internal Signer (Working ✓)
- [x] Internal signer opens inbox → full contract fetched (includes `formFields`)
- [x] AUTOFILL button finds matching fields and populates them

### Scenario 9 — Signing Page Error States (Working ✓)
- [x] Open `/sign/invalid_token` → "Unable to Load Document" error screen (red `ErrorIcon`)
- [x] Sign once, re-open same link → backend returns 400 "already submitted" → shows "Signature Already Submitted" screen with green `CheckCircle` icon and success alert (updated 2026-06-18)
- [x] If backend returns 200 with `status: "signed"` → `setCompleted(true)` → post-submission completion screen
- [x] 409 on submit → page reloads automatically

### Scenario 11 — External Signer Party Field Restriction (Blocked on Backend ⚠)
- [ ] External signer opens signing link
- [ ] **BUG: Can fill all parties' fields — restriction not enforced (Issue 4 above)**
- [ ] Wrong-party warning dialog does not appear
- [ ] Root cause: Spring Boot returns `assignedParty: null` in `GET /sign-requests/{token}`
- [ ] Will pass once backend includes `assignedParty` (non-null) in sign request response

### Scenario 10 — Contract Detail Page Document View (Working ✓)
- [x] Contract detail page shows PDF via presigned MinIO URL
- [x] Polling refreshes the presigned URL after signer state changes
- [x] Finalize button shown when `canFinalize = true`
