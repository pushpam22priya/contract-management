# Contract Creation Flow

**Document Type:** Technical Integration Reference  
**System:** Contract Management System (CMS)  
**Module:** Contract Creation Pipeline  
**Stack:** Next.js 16 · React 19 · TypeScript · Spring Boot · MongoDB · MinIO · Apryse WebViewer v11 · MUI v7  
**Status:** Production  
**Last Updated:** 2026-06-05 (sync fixes: removed contractValue, loadTeams via httpClient, description trigger, error passthrough)

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
   - 2.1 [Component Map](#21-component-map)
   - 2.2 [HTTP Proxy Mechanism (CORS Bypass)](#22-http-proxy-mechanism-cors-bypass)
   - 2.3 [JWT Authentication Flow](#23-jwt-authentication-flow)
   - 2.4 [Layer Summary](#24-layer-summary)
3. [Team Model — Prerequisite to Contract Creation](#3-team-model--prerequisite-to-contract-creation)
   - 3.1 [Team Data Model](#31-team-data-model)
   - 3.2 [Team–Contract Relationship](#32-teamcontract-relationship)
   - 3.3 [Team API Routes](#33-team-api-routes)
4. [Team Management UI](#4-team-management-ui)
   - 4.1 [Contracts Page — Navigation Modes](#41-contracts-page--navigation-modes)
   - 4.2 [TeamCard](#42-teamcard)
   - 4.3 [CreateTeamDialog](#43-createteamdialog)
   - 4.4 [RenameTeamDialog](#44-renameteamdialog)
   - 4.5 [Team Deletion Rules](#45-team-deletion-rules)
5. [Entry Points for Contract Creation](#5-entry-points-for-contract-creation)
6. [Contract Data Models](#6-contract-data-models)
   - 6.1 [Contract Interface](#61-contract-interface)
   - 6.2 [ContractStatus Enum](#62-contractstatus-enum)
   - 6.3 [Party Configuration](#63-party-configuration)
7. [Creation Wizard — Step 1: Contract Details](#7-creation-wizard--step-1-contract-details)
   - 7.1 [Form Fields](#71-form-fields)
   - 7.2 [Template Selection](#72-template-selection)
   - 7.3 [Team Assignment in Step 1](#73-team-assignment-in-step-1)
   - 7.4 [Date Configuration](#74-date-configuration)
   - 7.5 [Validation Rules — Step 1](#75-validation-rules--step-1)
   - 7.6 [Step Transition](#76-step-transition)
8. [Creation Wizard — Step 2: Document Editing](#8-creation-wizard--step-2-document-editing)
   - 8.1 [PDF Viewer Initialisation](#81-pdf-viewer-initialisation)
   - 8.2 [Profile Autofill — How It Works End-to-End](#82-profile-autofill--how-it-works-end-to-end)
   - 8.3 [Field Filling by the Contractor](#83-field-filling-by-the-contractor)
   - 8.4 [Party Restriction Enforcement](#84-party-restriction-enforcement)
   - 8.5 [Partial Party Validation](#85-partial-party-validation)
   - 8.6 [Restrictions on Form Field Management](#86-restrictions-on-form-field-management)
9. [Save Flow — Complete Pipeline](#9-save-flow--complete-pipeline)
   - 9.1 [Pre-Save Validation](#91-pre-save-validation)
   - 9.2 [PDF Export from Apryse](#92-pdf-export-from-apryse)
   - 9.3 [Form Field Export & Merge](#93-form-field-export--merge)
   - 9.4 [Contract Metadata Assembly](#94-contract-metadata-assembly)
   - 9.5 [Persist Metadata to Spring Boot](#95-persist-metadata-to-spring-boot)
   - 9.6 [PDF Upload to MinIO](#96-pdf-upload-to-minio)
   - 9.7 [XFDF Persistence](#97-xfdf-persistence)
   - 9.8 [Success & Post-Save State](#98-success--post-save-state)
10. [PDF Upload Protocol — Single-Shot vs Chunked](#10-pdf-upload-protocol--single-shot-vs-chunked)
    - 10.1 [Upload Decision Tree](#101-upload-decision-tree)
    - 10.2 [Single-Shot Upload (< 30 MB)](#102-single-shot-upload--30-mb)
    - 10.3 [Chunked Multipart Upload (≥ 30 MB) — Step-by-Step](#103-chunked-multipart-upload--30-mb--step-by-step)
    - 10.4 [ETag Requirement](#104-etag-requirement)
    - 10.5 [Abort on Failure](#105-abort-on-failure)
    - 10.6 [Chunked Upload Sequence Diagram](#106-chunked-upload-sequence-diagram)
11. [API Reference — Spring Boot Backend](#11-api-reference--spring-boot-backend)
    - 11.1 [POST /contracts](#111-post-contracts)
    - 11.2 [GET /contracts](#112-get-contracts)
    - 11.3 [GET /contracts/{id}](#113-get-contractsid)
    - 11.4 [PATCH /contracts/{id}](#114-patch-contractsid)
    - 11.5 [PUT /contracts/{id}/file](#115-put-contractsidfile)
    - 11.6 [POST /contracts/{id}/file/initiate](#116-post-contractsidfileinitiate)
    - 11.7 [GET /contracts/{id}/file/presign](#117-get-contractsidfilepresign)
    - 11.8 [POST /contracts/{id}/file/complete](#118-post-contractsidfilecomplete)
    - 11.9 [POST /contracts/{id}/file/abort](#119-post-contractsidfileabort)
    - 11.10 [GET /contracts/{id}/file/view-url](#1110-get-contractsidfileview-url)
    - 11.11 [DELETE /contracts/{id}](#1111-delete-contractsid)
    - 11.12 [POST /auth/login](#1112-post-authlogin)
    - 11.13 [GET /profile](#1113-get-profile)
    - 11.14 [GET /teams](#1114-get-teams)
12. [Contract Listing — How Team View Works](#12-contract-listing--how-team-view-works)
13. [Unsaved Changes Handling](#13-unsaved-changes-handling)
14. [Email Notifications](#14-email-notifications)
15. [Complete Restrictions & Validation Reference](#15-complete-restrictions--validation-reference)
16. [End-to-End Sequence Diagram](#16-end-to-end-sequence-diagram)
17. [File Reference](#17-file-reference)

---

## 1. Overview

A **Contract** in the CMS is a PDF document derived from a pre-existing **Template**. Contracts are organised inside **Teams** — named folders owned by the creating user. The creation flow is:

```
Login (JWT cached + profile cached)
  └── User navigates to Team
        └── Clicks "+ Create Contract"
              ├── Step 1: Fill contract metadata + select template
              └── Step 2: Fill PDF form fields in Apryse WebViewer
                    └── Click Save
                          ├── POST /contracts      → Spring Boot creates metadata record
                          ├── PUT  /contracts/{id}/file  OR  chunked multipart
                          │        → PDF stored in MinIO via Spring Boot
                          └── PATCH /contracts/{id} → XFDF sidecar persisted
```

The result is a contract document with status `draft` in Spring Boot's MongoDB, with the binary PDF stored in MinIO and accessible through time-limited presigned URLs.

---

## 2. System Architecture

### 2.1 Component Map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                               Browser / React                              │
│                                                                            │
│  src/app/overview/page.tsx                                                 │
│  └── OverviewContent                 src/components/contracts/             │
│        └── ContractsContent      └── CreateContractDialog.tsx              │
│              ├── Root → TeamCard list     ├── Step 1: Form (RHF + Zod)    │
│              └── Team → ContractCard list └── Step 2: PDFViewerContainer  │
│                                                                            │
│  src/app/contracts/[id]/page.tsx  ← individual contract detail            │
│                                                                            │
│                    ┌─────────────────────────────────────────────────────┐ │
│  src/services/     │  httpClient.ts                                      │ │
│  apiService.ts  ──→│  - Adds Authorization: Bearer <JWT>                 │ │
│  authService.ts    │  - Prefix: /api/backend/*                           │ │
│  contractService.ts│  - On 401: clears session → redirect /login         │ │
│                    └──────────────┬──────────────────────────────────────┘ │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    │ fetch('/api/backend/contracts')
                    ┌───────────────▼────────────────────────────────────────┐
                    │            next.config.ts — Rewrite Rule               │
                    │  /api/backend/:path*  →  http://localhost:8080/:path*  │
                    │  (server-to-server, no CORS)                           │
                    └───────────────┬────────────────────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────────────────────────┐
                    │         Spring Boot Backend (localhost:8080)           │
                    │                                                        │
                    │  POST /contracts        → MongoDB (metadata)           │
                    │  PUT  /contracts/{id}/file → MinIO (binary PDF)        │
                    │  POST .../file/initiate → MinIO multipart session      │
                    │  GET  .../file/presign  → MinIO presigned URL          │
                    │  POST .../file/complete → MinIO assemble parts         │
                    │  GET  .../file/view-url → MinIO time-limited read URL  │
                    │  PATCH /contracts/{id}  → MongoDB (update fields)      │
                    │  GET   /contracts       → MongoDB (JWT-filtered list)  │
                    └──────────────┬─────────────────────┬───────────────────┘
                                   │                     │
                    ┌──────────────▼──────┐   ┌──────────▼──────────────────┐
                    │  MongoDB             │   │  MinIO (S3-compatible)      │
                    │  Collections:        │   │  Bucket: contracts          │
                    │    contracts         │   │  Object: <contractId>.pdf   │
                    │    teams             │   └─────────────────────────────┘
                    └─────────────────────┘
```

### 2.2 HTTP Proxy Mechanism (CORS Bypass)

**File:** [next.config.ts](next.config.ts)

Spring Boot runs on `localhost:8080`. Direct browser calls to `localhost:8080` from `localhost:3000` fail with CORS errors. The solution is a Next.js rewrite rule:

```typescript
// next.config.ts
async rewrites() {
    return [{
        source:      '/api/backend/:path*',
        destination: 'http://localhost:8080/:path*',
    }];
}
```

**What this means:**
- Browser calls `localhost:3000/api/backend/contracts` — same origin, zero CORS issues.
- Next.js server receives the request and forwards it to `http://localhost:8080/contracts` server-to-server.
- Spring Boot never sees a cross-origin header — no CORS config changes needed.
- All request headers (including `Authorization: Bearer <token>`) are forwarded unchanged.

**File:** [src/lib/httpClient.ts](src/lib/httpClient.ts)

```typescript
const BACKEND_URL = '/api/backend'; // All Spring Boot paths are prefixed here

// Example: apiService calls httpClient.get('/contracts')
// → browser fetches /api/backend/contracts
// → Next.js rewrites to http://localhost:8080/contracts
// → Spring Boot receives GET /contracts
```

> **Rule for developers:** All Spring Boot API calls must use `httpClient` (not raw `fetch`), and paths must start with `/` without the `/api/backend` prefix — `httpClient` adds it automatically. Direct `fetch('http://localhost:8080/...')` calls will fail in production.

### 2.3 JWT Authentication Flow

**File:** [src/services/authService.ts](src/services/authService.ts) | [src/lib/httpClient.ts](src/lib/httpClient.ts)

The CMS uses JWT (JSON Web Token) for authentication. The token lifecycle:

```
1. POST /auth/login  →  Spring Boot returns { token, email, role }
2. authService.saveSession({ user, token })  →  sessionStorage['cms_current_user']
3. Every httpClient request:
     const token = JSON.parse(sessionStorage['cms_current_user']).token
     headers['Authorization'] = `Bearer ${token}`
4. Spring Boot validates JWT on every request → 401 if expired/invalid
5. httpClient 401 handler:
     sessionStorage.removeItem('cms_current_user')
     window.location.href = '/login'
```

**Session storage shape:**

```typescript
// Key: 'cms_current_user'
interface StoredSession {
    token: string;      // JWT from Spring Boot
    user: LoggedInUser;
}

interface LoggedInUser {
    email: string;
    isAdmin: boolean;
    lastLogin: string;
    // Profile fields — eagerly cached at login for autofill:
    fullName?: string;
    department?: string;
    organization?: string;
    dateOfBirth?: string;
    gender?: string;
    permanentAddress?: string;
    panCardNumber?: string;
    aadharCardNumber?: string;
}
```

> **Important:** Spring Boot uses the JWT to identify the current user for all contract operations. Contracts are returned filtered by the JWT's subject — the frontend does NOT apply a `createdBy === currentUser.email` filter. Spring Boot enforces ownership server-side.

### 2.4 Layer Summary

| Layer | File | Responsibility |
|---|---|---|
| **Types** | [src/types/auth.ts](src/types/auth.ts) | `LoggedInUser`, `StoredSession`, `BackendLoginResponse` |
| **Types** | [src/types/contract.ts](src/types/contract.ts) | `Contract`, `ContractStatus` |
| **Types** | [src/types/template.ts](src/types/template.ts) | `Template`, `PartyConfiguration`, `FormFieldDefinition` |
| **Schemas** | [src/schemas/contractSchema.ts](src/schemas/contractSchema.ts) | Zod validation for Step 1 |
| **HTTP Client** | [src/lib/httpClient.ts](src/lib/httpClient.ts) | JWT injection, proxy prefix, 401 redirect |
| **Dialog** | [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx) | Full creation wizard |
| **PDF Viewer** | [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx) | Apryse WebViewer v11 wrapper |
| **Services** | [src/services/apiService.ts](src/services/apiService.ts) | Raw HTTP calls to Spring Boot + upload helpers |
| **Services** | [src/services/contractService.ts](src/services/contractService.ts) | Business logic (create, upload, workflow) |
| **Services** | [src/services/authService.ts](src/services/authService.ts) | Login, session management, profile cache |
| **Services** | [src/services/profileService.ts](src/services/profileService.ts) | Read/update profile from Spring Boot |
| **Utils** | [src/utils/profileKeyOptions.ts](src/utils/profileKeyOptions.ts) | `buildProfileData()` for autofill |
| **Config** | [next.config.ts](next.config.ts) | Proxy rewrite rule |

---

## 3. Team Model — Prerequisite to Contract Creation

A **Team** is the organisational container for contracts. Before a user can create a contract from the Contracts page, they must first create at least one team. Teams are user-scoped — each user manages their own set independently.

### 3.1 Team Data Model

**Backend:** Spring Boot `/teams` endpoint (stores in MongoDB)

```typescript
// src/types/team.ts
interface Team {
    id: string;        // Spring Boot returns "id" (not "_id")
    name: string;
    createdBy: string; // Owner's email
    createdAt: string;
    updatedAt?: string;
}
```

> **Note for developers:** The internal Next.js `/api/teams` route returns `_id`. Spring Boot's `/teams` endpoint returns `id`. Always use `team.id` when working with teams loaded via `httpClient`.

### 3.2 Team–Contract Relationship

```
Team (1) ─────────────────────────────── Contract (many)
 id ──────────────────────────────────→  teamId
```

| Rule | Detail |
|---|---|
| **Cardinality** | One team → many contracts |
| **Contract field** | `contract.teamId: string \| null` |
| **Null teamId** | Contract at root level — no team assigned |
| **No cascading delete** | Team cannot be deleted if it has contracts |
| **Ownership** | Teams are user-scoped; contracts are JWT-filtered server-side |

### 3.3 Team API Routes

All team operations go through Spring Boot via the Next.js proxy:

| Method | Path | Description |
|---|---|---|
| `GET` | `/teams` | Returns teams for the JWT-authenticated user |
| `POST` | `/teams` | Create team: `{ name, createdBy }` |
| `PATCH` | `/teams/{id}` | Rename team: `{ name }` |
| `DELETE` | `/teams/{id}` | Delete (fails with 400 if team has contracts) |

---

## 4. Team Management UI

### 4.1 Contracts Page — Navigation Modes

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

The contracts page has two modes:

**Root View** — shows all teams as `TeamCard` components:

```
┌──────────────────────────────────────────────────────────┐
│  My Contracts                           [+ Create Team]  │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐                  │
│  │ 📁 Legal       │  │ 📁 HR          │                  │
│  │ 3 contracts    │  │ 1 contract     │                  │
│  └────────────────┘  └────────────────┘                  │
└──────────────────────────────────────────────────────────┘
```

**Team View** — shows contracts inside the selected team:

```
┌──────────────────────────────────────────────────────────┐
│  ← My Contracts / 📁 Legal        [+ Create Contract]   │
│                                                          │
│  ┌────────────────────────┐  ┌──────────────────────────┐│
│  │ Service Agreement      │  │ NDA – Acme Corp          ││
│  │ Draft · Acme Corp      │  │ Active · Globex Ltd      ││
│  └────────────────────────┘  └──────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 4.2 TeamCard

**File:** [src/components/teams/TeamCard.tsx](src/components/teams/TeamCard.tsx)

| Element | Content |
|---|---|
| Icon | Folder icon |
| Title | Team name |
| Subtitle | `"{n} contract(s)"` — computed client-side from loaded contracts |
| Hover: Eye icon | Navigate into team |
| Hover: Pencil icon | Open `RenameTeamDialog` |

### 4.3 CreateTeamDialog

**File:** [src/components/teams/CreateTeamDialog.tsx](src/components/teams/CreateTeamDialog.tsx)

Single-field dialog: team name (required, 1–50 chars, unique per user).

Save flow:
1. Validates name locally.
2. `POST /teams` via Spring Boot proxy.
3. On success: `onCreated(team)` → parent prepends team to state.
4. On duplicate name: backend returns HTTP 400 → error shown inline.

### 4.4 RenameTeamDialog

**File:** [src/components/teams/RenameTeamDialog.tsx](src/components/teams/RenameTeamDialog.tsx)

Pre-fills current name. `PATCH /teams/{id}` with `{ name }`. Same uniqueness rules as create, excluding self.

### 4.5 Team Deletion Rules

`DELETE /teams/{id}` — Spring Boot counts contracts with `teamId === id`. If count > 0, returns HTTP 400 with message `"Cannot delete: this team contains {n} contract(s)"`. The user must delete all contracts in the team before deleting the team itself.

---

## 5. Entry Points for Contract Creation

### 5.1 Contracts Page — Inside a Team

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

```typescript
<CreateContractDialog
    open={wizardOpen}
    onClose={() => setWizardOpen(false)}
    onSuccess={loadContracts}
    teamId={activeTeamId}   // ← pre-assigned from active team
/>
```

`teamId` prop is set → team is pre-assigned, no team selector shown in Step 1.

### 5.2 Dialog Props

```typescript
interface CreateContractDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    initialTemplateName?: string;   // Pre-select a template by name
    teamId?: string | null;         // Pre-assign team; hides selector if set
}
```

---

## 6. Contract Data Models

### 6.1 Contract Interface

**File:** [src/types/contract.ts](src/types/contract.ts) | **Backend:** Spring Boot MongoDB collection `contracts`

| Field | Type | Set on Creation | Source |
|---|---|---|---|
| `id` | `string` | DB auto | Spring Boot auto-generated ID |
| `name` / `title` | `string` | ✓ | Step 1 `contractTitle` (trimmed) |
| `client` | `string` | ✓ | Step 1 `clientName` (trimmed) |
| `description` | `string` | ✓ | Step 1 or auto-generated |
| `category` | `string` | ✓ | Inherited from template |
| `status` | `ContractStatus` | ✓ | Always `'draft'` at creation |
| `startDate` / `endDate` | `string` (ISO date) | ✓ | Step 1 |
| `expiresInDays` | `number` | ✓ | Computed from `endDate − today` |
| `templateId` | `string` | ✓ | Selected template ID |
| `templateName` | `string` | ✓ | Selected template name |
| `templateFileName` | `string` | ✓ | Original filename of the template PDF |
| `templateDocxBase64` | `string` | ✓ | Template DOCX source (for re-generation) |
| `xfdfData` | `string` | ✓ | XFDF annotation sidecar exported from Apryse |
| `fieldValues` | `Record<string, string>` | ✓ | Per-field values filled in Step 2 |
| `formFields` | `FormFieldDefinition[]` | ✓ | Field defs merged with values and party assignments |
| `hasFormFields` | `boolean` | ✓ | `true` if template has form fields |
| `parties` | `PartyConfiguration[]` | ✓ | Copied from template |
| **`teamId`** | **`string \| null`** | **✓** | **Team ID from URL or Step 1 selector** |
| `createdBy` | `string` | ✓ | `currentUser.email` |
| `fileUploaded` | `boolean` | After upload | Set `true` by Spring Boot after PDF stored in MinIO |
| `createdAt` / `updatedAt` | `string` (ISO) | DB auto | Server timestamps |

### 6.2 ContractStatus Enum

```typescript
// src/types/contract.ts
enum ContractStatus {
    DRAFT                  = 'draft',
    IN_REVIEW              = 'in_review',
    IN_APPROVAL            = 'in_approval',
    REVIEW_APPROVAL        = 'review_approval',        // legacy — kept for backward compatibility
    REVIEWED               = 'reviewed',               // legacy — kept for backward compatibility
    APPROVED               = 'approved',
    READY_FOR_SIGNATURE    = 'ready_for_signature',
    WAITING_FOR_SIGNATURE  = 'waiting_for_signature',
    SIGNED_BY_EVERYONE     = 'signed_by_everyone',
    SIGNED                 = 'signed',
    ACTIVE                 = 'active',
    EXPIRING               = 'expiring',
    EXPIRED                = 'expired',
    TERMINATED             = 'terminated',
    REJECTED               = 'rejected',
    REJECTED_BY_REVIEWER   = 'rejected_by_reviewer',
    REJECTED_BY_APPROVER   = 'rejected_by_approver',
}
```

A newly created contract always starts at `DRAFT`.

### 6.3 Party Configuration

```typescript
interface PartyConfiguration {
    id: string;     // e.g. "party_1", "party_2"
    label: string;  // e.g. "Buyer", "Seller"
    color: string;  // Hex: "#4CAF50"
    order: number;  // Signing order (1 = first to sign)
}
```

Copied verbatim from the selected template. Controls which party fills which form fields and in what signing sequence.

---

## 7. Creation Wizard — Step 1: Contract Details

**File:** [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx)

### 7.1 Form Fields

| UI Field | Form Key | Type | Required | Constraints |
|---|---|---|---|---|
| Contract Title | `contractTitle` | `string` | Yes | 1–50 characters |
| Client Name | `clientName` | `string` | Yes | 1–50 characters |
| Description | `description` | `string` | No | 0–500 characters |
| Start Date | `startDate` | `Date` | No | Defaults to today |
| End Date | `endDate` | `Date` | No | Defaults to start + 1 year; must be ≥ start |
| Template | `selectedTemplate` | `Template` | Yes | Must be selected |
| Team | `selectedTeam` | `Team \| null` | No | Only shown when `teamId` prop is `null` |

### 7.2 Template Selection

```typescript
// Dialog opens → load templates from Spring Boot
const allTemplates = await templateService.getAllTemplates();
// → apiService.getTemplates() → httpClient.get('/templates') → GET /templates
```

Template selector is an MUI `Autocomplete`. When selected, the full `Template` object is stored in state.

| Template Field | How Used in Contract |
|---|---|
| `category` | Stored as `contract.category` |
| `parties` | Copied to `contract.parties` |
| `formFields` | Controls PDF field rendering and party restrictions |
| `xfdfData` | Initial annotations loaded into Apryse viewer |
| `fileData` / `fileUrl` | PDF document rendered in Step 2 |
| `docxBase64` | Stored as `contract.templateDocxBase64` |

### 7.3 Team Assignment in Step 1

**Case A — Dialog opened from inside a team (`teamId` prop is set):**

Contract is automatically assigned to that team. No team selector shown.

**Case B — Dialog opened without a team (`teamId` prop is null):**

A team selector dropdown appears. All user teams are loaded directly via Spring Boot:

```typescript
// CreateContractDialog.tsx — loadTeams()
const res = await httpClient.get<Team[]>('/teams');
if (res.ok && res.data) setTeams(res.data);
// → GET /api/backend/teams → Spring Boot (JWT-filtered)
```

> **Why `httpClient.get('/teams')` and not `fetch('/api/teams?createdBy=...')`?** The internal Next.js `/api/teams` route returns `_id`, whereas Spring Boot returns `id`. Using the internal route would cause `selectedTeam?.id` to be `undefined` at save time, silently setting `teamId: null` and losing the assignment. Always use `httpClient` for team loading inside this dialog.

**Team assignment priority at save:**

```typescript
teamId: teamId           // 1st: prop from URL (highest priority)
     || selectedTeam?.id  // 2nd: user-selected in Step 1 (note: .id not ._id)
     || null              // 3rd: root level (no team)
```

> **Note:** Spring Boot returns `id` (not `_id`) for teams. Always use `team.id`.

### 7.4 Date Configuration

- **Start Date** defaults to today if left blank.
- **End Date** defaults to start date + 1 year.
- `expiresInDays` is computed:

```typescript
const expiresInDays = dayjs(finalEndDate).diff(dayjs(), 'day');
```

### 7.5 Validation Rules — Step 1

**Zod schema** ([src/schemas/contractSchema.ts](src/schemas/contractSchema.ts)):

```typescript
export const contractStep1Schema = z.object({
    contractTitle: z.string().min(1, 'Contract title is required').max(50),
    clientName:    z.string().min(1, 'Client name is required').max(50),
    description:   z.string().max(500),
});
```

Template selection is validated separately (not covered by Zod):

```typescript
if (!selectedTemplate) {
    setError('Please select a template');
    return;
}
```

### 7.6 Step Transition

Clicking **"Next: Edit Document"** triggers `handleNextStep()`:

1. Zod validates `contractTitle`, `clientName`, and `description` (`trigger(['contractTitle', 'clientName', 'description'])`).
2. Template selection is checked.
3. If all pass → `setCurrentStep(2)` → PDF viewer mounts.

---

## 8. Creation Wizard — Step 2: Document Editing

### 8.1 PDF Viewer Initialisation

**File:** [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx)

Step 2 mounts a full-screen `PDFViewerContainer` (Apryse WebViewer v11):

```typescript
<PDFViewerContainer
    ref={pdfViewerRef}
    documentUrl={selectedTemplate.fileData || selectedTemplate.fileUrl}
    initialXfdf={selectedTemplate?.xfdfData}
    formFields={selectedTemplate?.formFields}
    isReadOnly={false}
    currentUserRole="contractor"
    canAddFormFields={false}
    onFieldChange={handleFieldChange}
    onDocumentLoaded={() => {
        setDocumentLoaded(true);
        handleAutofillClick(true);   // Silent autofill on load
    }}
/>
```

The PDF loaded is the **template PDF** — not a contract PDF yet. The contract PDF is created at save time by exporting the filled viewer state.

`PDFViewerContainer` uses `forwardRef` + `useImperativeHandle` to expose a handle:

```typescript
interface PDFViewerHandle {
    exportAnnotations(options?, exportOptions?): Promise<{ blob: Blob; xfdfString: string }>;
    exportFormFields(): Promise<FormFieldDefinition[]>;
    autofillFields(partyId: string, profileData: Record<string, string>): void;
    clearField(fieldName: string): void;
    restoreFieldValue(fieldName: string, value: string): void;
    navigateToFirstPartyField(partyId: string): void;
}
```

### 8.2 Profile Autofill — How It Works End-to-End

Autofill pre-fills form fields whose `profileKey` matches a field in the user's profile. Here is the complete chain from login to autofill.

#### Step A — Profile Data Cached at Login

**File:** [src/services/authService.ts](src/services/authService.ts) — `login()` method

When the user logs in, `authService.login()` fetches the profile from Spring Boot immediately after saving the JWT, then merges all profile fields into sessionStorage:

```typescript
async login(credentials): Promise<AuthResponse> {
    // 1. POST /auth/login → get JWT + basic user info
    const response = await httpClient.post('/auth/login', credentials, { skipAuth: true });

    if (response.ok && response.data) {
        const { token, email, role } = response.data;
        this.saveSession({ email, isAdmin: role === 'ADMIN', lastLogin: '...' }, token);

        // 2. Immediately fetch profile and cache all fields in sessionStorage.
        //    BackendLoginResponse only returns { token, email, role } — profile
        //    fields are absent. Without this step, buildProfileData() reads empty
        //    values and autofill produces nothing.
        try {
            const profileRes = await httpClient.get('/profile');
            if (profileRes.ok && profileRes.data) {
                const d = profileRes.data;
                this.updateSessionUser({
                    fullName: d.fullName || '',  department: d.department || '',
                    organization: d.organization || '',  dateOfBirth: d.dateOfBirth || '',
                    gender: d.gender || '',  permanentAddress: d.permanentAddress || '',
                    panCardNumber: d.panCardNumber || '',  aadharCardNumber: d.aadharCardNumber || '',
                });
            }
        } catch { /* profile failure must not block login */ }

        return { success: true, message: 'Login successful', user };
    }
}
```

> **Why this matters:** The Spring Boot `/auth/login` response only contains `{ token, email, role }`. Profile fields like `fullName`, `department`, `organization` are NOT returned at login time. The eager profile fetch after login ensures that when `buildProfileData()` reads sessionStorage to build the autofill map, it finds real values instead of empty strings.

#### Step B — Silent Autofill on Document Load

When Apryse finishes loading the template PDF, `onDocumentLoaded` fires automatically:

**File:** [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx)

```typescript
// Called on document load (silent=true) and on manual Autofill button click
const handleAutofillConfirm = (partyId: string) => {
    const currentUser = authService.getCurrentUser(); // reads sessionStorage
    if (!currentUser) return;
    const profileData = buildProfileData(currentUser); // builds flat Record<string, string>
    pdfViewerRef.current?.autofillFields(partyId, profileData);
};
```

#### Step C — buildProfileData Reads sessionStorage

**File:** [src/utils/profileKeyOptions.ts](src/utils/profileKeyOptions.ts)

```typescript
export function buildProfileData(user: LoggedInUser): Record<string, string> {
    // Returns: { fullName: "John Smith", email: "john@co.com", department: "Legal", ... }
    const options = getProfileKeyOptions(user);
    const data: Record<string, string> = {};
    options.forEach(opt => {
        const raw = (user as any)[opt.value];
        data[opt.value] = raw != null ? String(raw).trim() : '';
    });
    // Special key: injects today's date for fields mapped to DATE_TODAY_KEY
    // Zero-padded: 05/06/2026 not 5/6/2026
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    data['__date_today__'] = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    return data;
}
```

#### Step D — autofillFields Sets Values in PDF

**File:** [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx)

```typescript
autofillFields(partyId, profileData) {
    formFields.forEach(field => {
        if (field.assignedParty !== partyId) return;      // only this party's fields
        if (field.type === 'Sig' || field.type === 'signature') return; // skip signatures
        if (!field.profileKey) return;                     // skip unmapped fields
        const value = profileData[field.profileKey];
        if (value) {
            annotationManager.getFieldManager().getField(field.name)?.setValue(value);
        }
    });
}
```

#### Autofill Data Flow Summary

```
POST /auth/login
  └── authService.login()
        ├── saveSession({ email, isAdmin, lastLogin }, token)
        └── GET /profile → updateSessionUser({ fullName, dept, org, ... })

Open CreateContractDialog (Step 2 mounts)
  └── PDFViewerContainer.onDocumentLoaded()
        └── handleAutofillClick(silent=true)
              └── handleAutofillConfirm(partyId)
                    ├── authService.getCurrentUser()  → reads sessionStorage
                    ├── buildProfileData(user)         → { fullName: "John", dept: "Legal", ... }
                    └── pdfViewerRef.autofillFields()  → sets values in PDF form fields
```

### 8.3 Field Filling by the Contractor

Every field change in Apryse fires `onFieldChange`:

```typescript
const handleFieldChange = (fieldName: string, value: string) => {
    setFilledFieldValues(prev => ({ ...prev, [fieldName]: value }));
};
```

`filledFieldValues: Record<string, string>` is the live source of truth for all values. This state is used at save time to build `contractData.fieldValues`.

### 8.4 Party Restriction Enforcement

**The contractor may only fill fields belonging to exactly one party.**

- The first field filled determines `contractorPartyId`.
- If the contractor fills a field assigned to a different party:
  - `WrongPartyWarningDialog` is shown.
  - `pdfViewerRef.current?.restoreFieldValue(fieldName, previousValue)` reverts the change.
  - The new value is NOT stored in `filledFieldValues`.
- Fields with no `assignedParty` are accessible to all parties.

**Why this exists:** Each party fills their own section sequentially during the signing workflow. Allowing a single contractor to fill multiple parties' fields would bypass that workflow.

### 8.5 Partial Party Validation

If the contractor starts filling a party's fields but leaves some empty, the **Save** button is disabled and `PartyValidationWarningPopup` lists the missing fields:

```typescript
const partyValidationWarning = useMemo(() =>
    validatePartyFields(selectedTemplate.formFields, filledFieldValues, selectedTemplate.parties),
    [selectedTemplate, filledFieldValues]
);
// Blocks save if any party has: filledCount > 0 AND filledCount < totalFieldCount
```

**File:** [src/utils/partyValidation.ts](src/utils/partyValidation.ts)

### 8.6 Restrictions on Form Field Management

| Action | Allowed | Notes |
|---|---|---|
| Fill text / checkbox fields | ✓ | Own party's fields only |
| Fill signature fields | ✓ | Via Apryse signature tool |
| Fill another party's fields | ✗ | Value reverted + warning dialog |
| Partially fill a party | ✗ | Save blocked until all party fields complete |
| Add new form fields | ✗ | `canAddFormFields={false}` |
| Delete existing fields | ✗ | Contractor role in viewer |
| Change party assignments | ✗ | Read-only from template |

---

## 9. Save Flow — Complete Pipeline

**File:** [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx) — `handleSave()`

### 9.1 Pre-Save Validation

```
1. hasPartialParty?    → BLOCK — show PartyValidationWarningPopup
2. !selectedTemplate?  → ABORT — "No template selected"
3. Zod validate contractTitle + clientName + description → ABORT on error
4. !documentLoaded?   → ABORT — "Document is still loading"
```

### 9.2 PDF Export from Apryse

```typescript
const exportResult = await pdfViewerRef.current?.exportAnnotations(
    {},
    { flatten: false }   // Keep annotations interactive for future signers
);
// Returns: { blob: Blob, xfdfString: string }
```

`flatten: false` preserves signature annotations as annotation objects so other parties can still sign later. `blob` is the raw PDF bytes; `xfdfString` is the XFDF annotation sidecar.

**XFDF fallback chain:**

```typescript
const finalXfdf = exportResult?.xfdfString
    || selectedTemplate.xfdfData
    || '';
```

### 9.3 Form Field Export & Merge

```typescript
const rawFields = await pdfViewerRef.current?.exportFormFields();

const mergedFormFields = rawFields.map(field => {
    const tField = selectedTemplate.formFields?.find(f => f.name === field.name);
    return {
        ...field,
        value:         filledFieldValues[field.name] || field.value || '',
        assignedParty: tField?.assignedParty,
        partyLabel:    tField?.partyLabel,
        partyColor:    tField?.partyColor,
        profileKey:    tField?.profileKey ?? null,
        required:      tField?.required ?? field.required,
        label:         tField?.label ?? field.name,
    };
});
```

Apryse does not natively preserve party assignments or `profileKey` mappings in its exported field data. This merge step re-attaches them from the template so they survive in the contract's `formFields` array and remain usable for future signing steps.

### 9.4 Contract Metadata Assembly

```typescript
const contractData = {
    name:               contractTitle.trim(),
    title:              contractTitle.trim(),
    client:             clientName.trim(),
    description:        description || `Contract based on ${selectedTemplate.name}`,
    category:           selectedTemplate.category,
    status:             ContractStatus.DRAFT,
    startDate:          finalStartDate,
    endDate:            finalEndDate,
    expiresInDays,
    templateId:         selectedTemplate.id,
    templateName:       selectedTemplate.name,
    templateFileName:   selectedTemplate.fileName,
    templateDocxBase64: selectedTemplate.docxBase64 || '',
    content:            selectedTemplate.content || '',
    xfdfData:           finalXfdf,
    fieldValues:        filledFieldValues,
    formFields:         mergedFormFields,
    hasFormFields:      mergedFormFields.length > 0,
    parties:            selectedTemplate.parties || [],
    createdBy:          currentUser.email,
    teamId:             teamId || selectedTeam?.id || null,
};
```

### 9.5 Persist Metadata to Spring Boot

**First save** (`contractId` state is null):

```typescript
const result = await contractService.createContract(contractData);
// → apiService.createContract(contractData)
// → httpClient.post('/contracts', contractData)
// → POST /api/backend/contracts → Spring Boot POST /contracts
// Response: { id: "664a...3a" }
// On failure: result.message carries the backend error text (not a generic fallback)
contractId = result.contract.id;
```

**Subsequent saves** (user edits and saves again):

```typescript
await apiService.updateContractMetadata(contractId, contractData);
// → httpClient.patch('/contracts/{id}', contractData)
// → PATCH /api/backend/contracts/{id} → Spring Boot PATCH /contracts/{id}
```

`contractId` stored in component state prevents duplicate contract records on multiple saves within the same dialog session.

### 9.6 PDF Upload to MinIO

```typescript
await contractService.updateContractSignedPdf(contractId, pdfBlob, finalXfdf);
```

Internal flow in [src/services/contractService.ts](src/services/contractService.ts):

```
1. Normalize to Blob:
   - If pdfData is a base64 string → atob() → Uint8Array → new Blob(...)
   - If pdfData is already a Blob → use directly

2. Upload to MinIO via Spring Boot:
   → apiService.saveContractPdf(id, blob)
   → If blob.size < 30 MB:  contractSingleShotUpload()  →  PUT /contracts/{id}/file
   → If blob.size ≥ 30 MB:  contractChunkedUpload()     →  initiate → presign → PUT → complete

3. Persist XFDF sidecar:
   → apiService.updateContractDocument(id, { xfdfData })
   → PATCH /contracts/{id} (Spring Boot)
```

> **Why XFDF is saved separately:** Apryse's annotation state (signature appearances, filled field highlights) is stored in XFDF format, separate from the raw PDF bytes. Storing XFDF alongside the binary means the viewer can restore all visual annotations when the contract is reopened — without re-rendering from scratch.

### 9.7 XFDF Persistence

```typescript
await apiService.updateContractDocument(contractId, { xfdfData: finalXfdf });
// → httpClient.patch('/contracts/{id}', { xfdfData })
// → PATCH /api/backend/contracts/{id} → Spring Boot PATCH /contracts/{id}
```

**Must use `updateContractDocument()` (Spring Boot route) — not the internal Next.js PATCH route.** Contracts created via Spring Boot live in Spring Boot's MongoDB context; the internal `/api/contracts/[id]` route queries a separate internal MongoDB context and returns 404 for Spring Boot contracts.

### 9.8 Success & Post-Save State

```typescript
setSnackbar({ open: true, message: 'Contract Saved successfully!', severity: 'success' });
onSuccess?.();   // Parent calls loadContracts() → contract appears in team view
// Dialog stays open — user can continue editing or close manually
```

On dialog close, all state resets to initial values.

---

## 10. PDF Upload Protocol — Single-Shot vs Chunked

**File:** [src/services/apiService.ts](src/services/apiService.ts)

### 10.1 Upload Decision Tree

```
apiService.saveContractPdf(id, pdfBlob)
     │
     ├── blob.size < 30 MB ──→ contractSingleShotUpload()
     │                            PUT /contracts/{id}/file
     │                            Content-Type: application/pdf
     │                            Body: raw PDF bytes
     │
     └── blob.size ≥ 30 MB ──→ contractChunkedUpload()
                                  S3-style multipart protocol
                                  Chunk size: 10 MB per part
                                  MinIO minimum part size: 5 MB
```

**Threshold:** 30 MB (`CHUNKED_THRESHOLD = 30 * 1024 * 1024`)

In practice, filled contract PDFs are typically 1–10 MB, so single-shot is the common path. Chunked handles edge cases with embedded images or many attachments.

### 10.2 Single-Shot Upload (< 30 MB)

```typescript
// src/services/apiService.ts — contractSingleShotUpload()
const uploadRes = await httpClient.putFile(
    `/contracts/${contractId}/file`,
    file,
    'application/pdf'   // Content-Type required by Spring Boot
);
```

`httpClient.putFile()` sends raw binary body with `Content-Type: application/pdf` and `Authorization: Bearer <JWT>`. Spring Boot receives the bytes, stores them in MinIO, and sets `fileUploaded = true` on the contract record.

### 10.3 Chunked Multipart Upload (≥ 30 MB) — Step-by-Step

**File:** [src/services/apiService.ts](src/services/apiService.ts) — `contractChunkedUpload()`

This follows the S3/MinIO multipart upload protocol. The browser uploads each chunk directly to MinIO — Spring Boot only handles session creation (initiate) and final assembly (complete).

#### Step 1 — Initiate Session

```typescript
const initRes = await httpClient.post(
    `/contracts/${contractId}/file/initiate`,
    {}
);
// Spring Boot calls MinIO CreateMultipartUpload → returns uploadId
// Response: { uploadId: "abc123xyz..." }
const { uploadId } = initRes.data;
```

`uploadId` identifies this multipart session for all subsequent presign and complete calls.

#### Step 2 — Per-Part: Get Presigned URL + PUT Chunk to MinIO

Repeat for each 10 MB slice of the file:

```typescript
for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const chunk = file.slice(start, end);  // Blob.slice() — zero-copy

    // 2a. Ask Spring Boot for a presigned URL for this part
    const presignRes = await httpClient.get(
        `/contracts/${contractId}/file/presign?uploadId=${uploadId}&partNumber=${partNumber}`
    );
    // Returns: { url: "https://minio:9000/...?X-Amz-Signature=...", partNumber: 1 }
    const presignedUrl = presignRes.data.url;

    // 2b. PUT chunk DIRECTLY to MinIO using the presigned URL
    const partRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: chunk,
        headers: { 'Content-Type': 'application/octet-stream' },
        // CRITICAL: Do NOT add Authorization header here.
        // MinIO presigned URLs embed credentials in query string (X-Amz-Signature=...).
        // Adding an Authorization header alongside presigned credentials causes MinIO
        // to reject the request with "SignatureDoesNotMatch".
    });

    // 2c. Collect ETag — MinIO returns this in the response header
    const eTag = partRes.headers.get('ETag')?.replace(/"/g, '') || '';
    parts.push({ partNumber, eTag });
}
```

#### Step 3 — Complete Upload

```typescript
await httpClient.post(
    `/contracts/${contractId}/file/complete`,
    { uploadId, parts }
    // parts = [
    //   { partNumber: 1, eTag: "d8e8fca2dc0f896fd7cb4cb0031ba249" },
    //   { partNumber: 2, eTag: "7215ee9c7d9dc229d2921a40e899ec5f" },
    //   ...
    // ]
);
// Spring Boot calls MinIO CompleteMultipartUpload
// MinIO verifies each ETag, assembles parts into final PDF object
// Spring Boot sets fileUploaded = true on the contract
```

### 10.4 ETag Requirement

MinIO returns an `ETag` header in the response to each part PUT. ETags are per-part checksums that MinIO uses during `CompleteMultipartUpload` to verify data integrity and identify which parts to assemble.

```typescript
const rawETag = partRes.headers.get('ETag') || '';
const eTag = rawETag.replace(/"/g, '');   // MinIO wraps ETags in quotes — strip them
```

> **CORS warning:** If MinIO's CORS config does not include `ETag` in `ExposeHeaders`, the browser receives an empty string. This causes `CompleteMultipartUpload` to fail. Ensure MinIO's CORS policy exposes `ETag`.

### 10.5 Abort on Failure

If any part upload fails, the multipart session is aborted automatically to free orphaned parts from MinIO storage:

```typescript
try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        // ... upload part ...
    }
} catch (err) {
    await httpClient.post(
        `/contracts/${contractId}/file/abort?uploadId=${uploadId}`,
        {}
    );
    // Spring Boot calls MinIO AbortMultipartUpload — frees orphaned parts
    throw err;  // Re-throw so caller receives the failure
}
```

Orphaned multipart uploads that are never completed or aborted consume MinIO storage indefinitely. The abort call is defensive cleanup.

### 10.6 Chunked Upload Sequence Diagram

```
Browser                  Next.js (proxy)            Spring Boot               MinIO
   │                           │                          │                      │
   │─POST .../file/initiate────────────────────────────→ │                      │
   │                           │                          │─CreateMultipartUpload→│
   │                           │                          │←── uploadId ──────────│
   │←── { uploadId } ──────────────────────────────────── │                      │
   │                           │                          │                      │
   │ ┌─── for each 10 MB chunk ─────────────────────────────────────────────────┐│
   │ │                         │                          │                      ││
   │ │─GET .../presign?partN=N───────────────────────── → │                      ││
   │ │                         │                          │─PresignPartURL ──────→││
   │ │                         │                          │←── presignedUrl ──────││
   │ │←── { url } ──────────────────────────────────────── │                      ││
   │ │                         │                          │                      ││
   │ │─PUT <presignedUrl> (DIRECT to MinIO — bypasses Next.js)──────────────────→││
   │ │   Body: raw 10MB chunk                                                    ││
   │ │   Header: Content-Type: application/octet-stream                          ││
   │ │   (NO Authorization header — credentials are in the URL)                  ││
   │ │←── 200 OK + ETag: "abc123" ───────────────────────────────────────────────││
   │ │                         │                          │                      ││
   │ └──────────────────────────────────────────────────────────────────────────┘│
   │                           │                          │                      │
   │─POST .../file/complete────────────────────────────→ │                      │
   │  { uploadId, parts: [{partNumber, eTag}, ...] }       │─CompleteMultipartUpload→│
   │                           │                          │←── 200 OK ────────────│
   │←── { success: true } ─────────────────────────────── │                      │
```

---

## 11. API Reference — Spring Boot Backend

All paths are accessed through the Next.js proxy. The browser calls `/api/backend/<path>` which is rewritten to `http://localhost:8080/<path>`.

---

### 11.1 POST /contracts

Creates the contract metadata record. PDF is uploaded separately after this returns.

**Request:**

```
POST /api/backend/contracts
Content-Type: application/json
Authorization: Bearer <JWT>

{
    "name":            "Service Agreement – Acme Corp",
    "title":           "Service Agreement – Acme Corp",
    "client":          "Acme Corp",
    "description":     "Annual IT support agreement",
    "category":        "Service Agreements",
    "status":          "draft",
    "startDate":       "2026-06-01",
    "endDate":         "2027-06-01",
    "expiresInDays":   365,
    "templateId":      "664a1f2e3b0000000000001a",
    "templateName":    "IT Service Agreement",
    "xfdfData":        "<?xml version=\"1.0\"?>...",
    "fieldValues":     { "client_name": "Acme Corp" },
    "formFields":      [ { "name": "client_name", "value": "Acme Corp", ... } ],
    "hasFormFields":   true,
    "parties":         [ { "id": "party_1", "label": "Buyer", "color": "#4CAF50", "order": 1 } ],
    "createdBy":       "user@company.com",
    "teamId":          "664a1f2e3b0000000000002a"
}
```

**Response — 201 Created:**

```json
{
    "id": "664a1f2e3b0000000000003a",
    "message": "Contract created successfully"
}
```

---

### 11.2 GET /contracts

Returns all contracts belonging to the authenticated user. Filtered server-side by JWT — the frontend does not need to apply a `createdBy` filter.

**Request:**

```
GET /api/backend/contracts
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
[
    {
        "id": "664a1f2e3b0000000000003a",
        "title": "Service Agreement – Acme Corp",
        "status": "draft",
        "teamId": "664a1f2e3b0000000000002a",
        "createdBy": "user@company.com",
        "fileUploaded": true,
        "createdAt": "2026-06-01T10:00:00.000Z"
    }
]
```

---

### 11.3 GET /contracts/{id}

Returns full contract detail including all fields.

**Request:**

```
GET /api/backend/contracts/664a1f2e3b0000000000003a
Authorization: Bearer <JWT>
```

**Response — 200 OK:** Full contract JSON including `formFields`, `xfdfData`, `parties`, all workflow fields.

---

### 11.4 PATCH /contracts/{id}

Updates any combination of contract fields. Used for XFDF updates, workflow status changes, reviewer/approver/signer assignments.

**Request:**

```
PATCH /api/backend/contracts/664a1f2e3b0000000000003a
Content-Type: application/json
Authorization: Bearer <JWT>

{ "xfdfData": "<?xml version=\"1.0\"?>..." }
```

**Response — 200 OK:**

```json
{ "message": "Contract updated successfully" }
```

---

### 11.5 PUT /contracts/{id}/file

Single-shot binary PDF upload (for files < 30 MB). Stores PDF in MinIO and sets `fileUploaded = true`.

**Request:**

```
PUT /api/backend/contracts/664a1f2e3b0000000000003a/file
Content-Type: application/pdf
Authorization: Bearer <JWT>

<raw PDF bytes>
```

**Response — 200 OK:**

```json
{ "message": "File uploaded successfully", "fileUploaded": true }
```

---

### 11.6 POST /contracts/{id}/file/initiate

Initiates a MinIO multipart upload session. Returns an `uploadId` that identifies the session for all subsequent calls.

**Request:**

```
POST /api/backend/contracts/664a1f2e3b0000000000003a/file/initiate
Content-Type: application/json
Authorization: Bearer <JWT>

{}
```

**Response — 200 OK:**

```json
{
    "uploadId": "abc123xyz...",
    "contractId": "664a1f2e3b0000000000003a"
}
```

---

### 11.7 GET /contracts/{id}/file/presign

Returns a short-lived MinIO presigned URL for uploading one part directly to MinIO. AWS-style credentials are embedded in the URL query string — do NOT add an `Authorization` header when using this URL.

**Request:**

```
GET /api/backend/contracts/664a1f2e3b0000000000003a/file/presign
    ?uploadId=abc123xyz&partNumber=1
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{
    "url": "https://minio-host:9000/contracts/664a...3a.pdf?partNumber=1&uploadId=abc123&X-Amz-Credential=...&X-Amz-Signature=...",
    "partNumber": 1
}
```

---

### 11.8 POST /contracts/{id}/file/complete

Signals MinIO to assemble all uploaded parts into the final PDF. Spring Boot passes all `{ partNumber, eTag }` pairs to MinIO's `CompleteMultipartUpload` API.

**Request:**

```
POST /api/backend/contracts/664a1f2e3b0000000000003a/file/complete
Content-Type: application/json
Authorization: Bearer <JWT>

{
    "uploadId": "abc123xyz",
    "parts": [
        { "partNumber": 1, "eTag": "d8e8fca2dc0f896fd7cb4cb0031ba249" },
        { "partNumber": 2, "eTag": "7215ee9c7d9dc229d2921a40e899ec5f" }
    ]
}
```

**Response — 200 OK:**

```json
{ "message": "Upload completed successfully", "fileUploaded": true }
```

---

### 11.9 POST /contracts/{id}/file/abort

Aborts a multipart upload session and frees all orphaned parts from MinIO storage.

**Request:**

```
POST /api/backend/contracts/664a1f2e3b0000000000003a/file/abort
    ?uploadId=abc123xyz
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{ "message": "Upload aborted successfully" }
```

Called automatically by `contractChunkedUpload()` if any part PUT fails.

---

### 11.10 GET /contracts/{id}/file/view-url

Returns a time-limited (15 minute) MinIO presigned URL for viewing the contract PDF. Pass this URL directly to Apryse WebViewer as `documentUrl` — no `Authorization` header needed.

**Request:**

```
GET /api/backend/contracts/664a1f2e3b0000000000003a/file/view-url
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{
    "url": "https://minio-host:9000/contracts/664a...3a.pdf?X-Amz-Expires=900&X-Amz-Signature=..."
}
```

Returns 404 if `fileUploaded = false` (PDF not yet stored in MinIO).

---

### 11.11 DELETE /contracts/{id}

Deletes the contract metadata from MongoDB and removes the PDF object from MinIO.

**Response — 204 No Content** on success.

---

### 11.12 POST /auth/login

Authenticates the user. Returns a JWT and basic user info. Does NOT return profile fields — those are fetched separately from `/profile` immediately after login.

**Request:**

```
POST /api/backend/auth/login
Content-Type: application/json

{ "email": "user@company.com", "password": "..." }
```

**Response — 200 OK:**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "email": "user@company.com",
    "role": "USER",
    "newUser": false
}
```

---

### 11.13 GET /profile

Returns the authenticated user's full profile. Called by `authService.login()` immediately after login to pre-populate the autofill cache in sessionStorage.

**Request:**

```
GET /api/backend/profile
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
{
    "fullName":         "John Smith",
    "department":       "Legal",
    "organization":     "Acme Corp",
    "dateOfBirth":      "1985-04-12",
    "gender":           "MALE",
    "permanentAddress": "123 Main St",
    "panCardNumber":    "ABCDE1234F",
    "aadharCardNumber": "1234 5678 9012"
}
```

---

### 11.14 GET /teams

Returns all teams owned by the authenticated user.

**Request:**

```
GET /api/backend/teams
Authorization: Bearer <JWT>
```

**Response — 200 OK:**

```json
[
    { "id": "664a1f2e3b0000000000002a", "name": "Legal", "createdBy": "user@company.com" },
    { "id": "664a1f2e3b0000000000002b", "name": "HR",    "createdBy": "user@company.com" }
]
```

> **Note:** Spring Boot returns `id` (not `_id`). Always use `team.id`. Using `team._id` will be `undefined` for Spring Boot-loaded teams.

---

## 12. Contract Listing — How Team View Works

**File:** [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx)

When the user enters a team, `loadContracts()` runs:

```typescript
const loadContracts = useCallback(async () => {
    const allContracts = await contractService.getAllContracts();
    // → apiService.getContracts()
    // → httpClient.get('/contracts')
    // → GET /api/backend/contracts → Spring Boot (JWT-filtered)
    //
    // Spring Boot returns ONLY contracts for the authenticated user.
    // DO NOT add a createdBy === currentUser.email filter here —
    // Spring Boot handles ownership server-side via JWT.

    // Apply only renewal/termination chain filters:
    const relevantContracts = allContracts.filter(c => {
        if ((c.status === 'expired' || c.status === 'expiring') && c.renewedContractId) {
            // Hide a superseded contract if its renewal is active/draft/terminated
            const renewalStatus = statusById.get(c.renewedContractId);
            if (renewalStatus && isActiveOrDraftStatus(renewalStatus)) return false;
        }
        if (c.status === 'terminated' && c.renewedFromId) {
            if (statusById.get(c.renewedFromId) === 'terminated') return false;
        }
        return true;
    });
    setContracts(relevantContracts);
}, []);
```

Then the team view renders only contracts for the active team:

```typescript
const teamContracts = contracts.filter(c => c.teamId === activeTeamId);
```

**Troubleshooting — "No contracts in this team yet" after creating a contract:**

1. Verify the contract was saved with the correct `teamId` — check the `POST /contracts` request payload.
2. Verify `activeTeamId` in the URL matches `team.id` (not `team._id`).
3. Verify `loadContracts()` does NOT have a `createdBy` filter — Spring Boot handles auth server-side.
4. Verify the `POST /contracts` response was HTTP 201 (not a redirect or error).

---

## 13. Unsaved Changes Handling

If the user tries to close the dialog with unsaved changes:

1. `ConfirmationDialog` opens: *"You have unsaved changes. Do you want to save before closing?"*
2. **"Save & Close"** → full save pipeline runs, then dialog closes.
3. **"Discard"** → all state reset, dialog closes immediately.
4. **"Cancel"** → returns to the dialog.

---

## 14. Email Notifications

**No email is sent on contract creation.**

The contract is stored as `DRAFT`, visible only to the creator. Emails are triggered by subsequent workflow stages:

| Action | Recipients |
|---|---|
| Submit for review | Assigned reviewers |
| Reviewer approves / rejects | Contract creator |
| Submit for approval | Assigned approver |
| Approver approves / rejects | Contract creator |
| Submit for signature | Each signer (internal + external) |
| Signer completes (sequential flow) | Next signer in sequence (auto-advance engine) |
| All signers complete | Contract creator |

Email is sent via EmailJS (`@emailjs/browser` on client-side; REST API `https://api.emailjs.com/api/v1.0/email/send` for server-side in workflow auto-advance). Config: `config/externalSignature.ts` (env vars: `NEXT_PUBLIC_EMAILJS_*`).

---

## 15. Complete Restrictions & Validation Reference

### Team Restrictions

| Restriction | Enforcement |
|---|---|
| Team name required | Spring Boot HTTP 400 on empty/missing |
| Team name max 50 chars | Spring Boot validation |
| Team name unique per user | Spring Boot HTTP 400 on duplicate |
| Cannot delete team with contracts | `DELETE /teams/{id}`: counts contracts, returns 400 |
| Teams are user-scoped | `GET /teams` returns only JWT user's teams |

### Step 1 Restrictions

| Restriction | Error |
|---|---|
| Contract title required | "Contract title is required" |
| Contract title max 50 chars | "Contract title must be 50 characters or less" |
| Client name required | "Client name is required" |
| Client name max 50 chars | "Client name must be 50 characters or less" |
| Description max 500 chars | "Description must be 500 characters or less" |
| Template must be selected | "Please select a template" |
| End date ≥ start date | MUI DatePicker `minDate` prevents invalid selection |

### Step 2 Restrictions

| Restriction | Enforcement |
|---|---|
| Cannot fill another party's fields | `contractorPartyId` check → revert + `WrongPartyWarningDialog` |
| Cannot partially fill a party | `validatePartyFields()` → Save disabled + `PartyValidationWarningPopup` |
| Cannot add new form fields | `canAddFormFields={false}` in viewer |
| Cannot delete existing fields | Contractor role in viewer |
| Must wait for document to load | Save button disabled until `documentLoaded=true` |

### Upload Restrictions

| Restriction | Detail |
|---|---|
| Single-shot threshold | < 30 MB: `PUT /contracts/{id}/file` |
| Chunked threshold | ≥ 30 MB: initiate → presign → PUT → complete |
| MinIO minimum part size | 5 MB (except the last part) — enforced by MinIO |
| Chunk size | 10 MB per part |
| No Authorization on presigned PUT | MinIO rejects requests with both presigned URL and Authorization header |
| ETag required for complete | Must collect ETag from each part PUT response header |
| Abort on failure | `POST .../file/abort` sent automatically on any part failure |

---

## 16. End-to-End Sequence Diagram

```
User          ContractsContent        CreateContractDialog         apiService          Spring Boot / MinIO
 │                   │                        │                        │                      │
 │─[Login]───────────────────────────────────────────────────────────────────────────────────→│
 │                   │                        │                        │  POST /auth/login ──→│
 │                   │                        │                        │  GET  /profile ──────→│
 │                   │                        │                        │←JWT + profile fields──│
 │  session saved (token + all profile fields in sessionStorage)       │                      │
 │←[Home]────────────│                        │                        │                      │
 │                   │                        │                        │                      │
 │─[/overview]───────→│                        │                        │                      │
 │                   │─GET /teams─────────────────────────────────────→│─→Spring Boot          │
 │                   │←teams[] (id, not _id)──────────────────────────│                       │
 │                   │─GET /contracts─────────────────────────────────→│─→Spring Boot (JWT filter)
 │                   │←contracts[] (all belong to current user)────────│                       │
 │                   │                        │                        │                      │
 │─[Click team card]─→│                        │                        │                      │
 │  filter: contracts.filter(c => c.teamId === activeTeamId)           │                      │
 │                   │                        │                        │                      │
 │─[+ Create Contract]→│                        │                        │                      │
 │                   │─open(teamId)───────────→│                        │                      │
 │                   │                        │─GET /templates─────────→│─→Spring Boot          │
 │                   │                        │←templates[]─────────────│                      │
 │                   │                        │                        │                      │
 │  ┌── STEP 1 ───────────────────────────────────────────────────────────────────────────┐  │
 │  │  Fill: title, client, dates; select template                     │                  │  │
 │  │  Team: pre-assigned (read-only) = activeTeamId                   │                  │  │
 │──[Next: Edit Document]──────────────────────→│                        │                  │  │
 │  │  Zod validate → setCurrentStep(2)         │                        │                  │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────┘  │
 │                   │                        │                        │                      │
 │  ┌── STEP 2 ───────────────────────────────────────────────────────────────────────────┐  │
 │  │  PDFViewerContainer loads template PDF   │                        │                  │  │
 │  │  onDocumentLoaded():                     │                        │                  │  │
 │  │    getCurrentUser() → sessionStorage     │                        │                  │  │
 │  │    buildProfileData() → { fullName, dept, org, ... }             │                  │  │
 │  │    autofillFields(partyId, profileData) → PDF fields populated   │                  │  │
 │  │                                          │                        │                  │  │
 │  │  User fills remaining fields (own party only)                    │                  │  │
 │  │  onFieldChange → filledFieldValues{}     │                        │                  │  │
 │  │                                          │                        │                  │  │
 │──[Save Contract]──────────────────────────→│                        │                  │  │
 │  │  pre-save validation                     │                        │                  │  │
 │  │  exportAnnotations() → { blob, xfdfString }                      │                  │  │
 │  │  exportFormFields() + merge with template fields                 │                  │  │
 │  │  build contractData { ..., teamId }      │                        │                  │  │
 │  │                                          │─POST /contracts────────→│─→MongoDB         │  │
 │  │                                          │←{ id }─────────────────│                  │  │
 │  │                                          │                        │                  │  │
 │  │  ┌── PDF UPLOAD ───────────────────────────────────────────────────────────────────┐│  │
 │  │  │  if blob < 30MB:  PUT /contracts/{id}/file ─────────────────→│─→MinIO           ││  │
 │  │  │                                       │                        │                 ││  │
 │  │  │  if blob ≥ 30MB:                      │                        │                 ││  │
 │  │  │    POST .../file/initiate ────────────────────────────────────→│─→MinIO session  ││  │
 │  │  │    for each chunk:                    │                        │                 ││  │
 │  │  │      GET .../file/presign ────────────────────────────────────→│─→MinIO presign  ││  │
 │  │  │      PUT <presignedUrl> (direct, no auth header) ──────────────────────────────→││  │
 │  │  │      ← 200 OK + ETag                  │                        │                 ││  │
 │  │  │    POST .../file/complete ────────────────────────────────────→│─→MinIO assemble ││  │
 │  │  └─────────────────────────────────────────────────────────────────────────────────┘│  │
 │  │                                          │                        │                  │  │
 │  │                                          │─PATCH /contracts/{id}──→│─→MongoDB (xfdf)  │  │
 │  │                                          │←{ success }─────────────│                  │  │
 │  │  Show "Contract Saved!" snackbar         │                        │                  │  │
 │  │  onSuccess() → loadContracts() → contract visible in team view   │                  │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────┘  │
```

---

## 17. File Reference

| File | Role |
|---|---|
| [next.config.ts](next.config.ts) | Proxy rewrite: `/api/backend/*` → Spring Boot |
| [src/lib/httpClient.ts](src/lib/httpClient.ts) | JWT injection, proxy prefix, 401 redirect, `putFile`, `putFormData`, `getRaw` |
| [src/services/authService.ts](src/services/authService.ts) | Login, session management, eager profile cache at login |
| [src/services/apiService.ts](src/services/apiService.ts) | All Spring Boot HTTP calls; single-shot and chunked upload helpers |
| [src/services/contractService.ts](src/services/contractService.ts) | Business logic: create, upload PDF, workflow methods |
| [src/services/profileService.ts](src/services/profileService.ts) | Read/update user profile via Spring Boot |
| [src/services/templateService.ts](src/services/templateService.ts) | Fetch templates from Spring Boot |
| [src/app/overview/page.tsx](src/app/overview/page.tsx) | Entry point for `/overview` — mounts `OverviewContent` inside `AppLayout` |
| [src/components/overview/OverviewContent.tsx](src/components/overview/OverviewContent.tsx) | Layout shell: embeds `ContractsContent` + `OverviewDrawer` + `OverviewSideTabs` |
| [src/components/contracts/ContractsContent.tsx](src/components/contracts/ContractsContent.tsx) | Team/contract grid; `loadContracts()`, `loadTeams()`; `basePath` hardcoded to `/overview` |
| [src/app/contracts/\[id\]/page.tsx](src/app/contracts/[id]/page.tsx) | Individual contract detail page |
| [src/components/contracts/CreateContractDialog.tsx](src/components/contracts/CreateContractDialog.tsx) | Full 2-step creation wizard |
| [src/components/contracts/ContractInformation.tsx](src/components/contracts/ContractInformation.tsx) | Contract detail info panel (client, category, template, dates, progress) |
| [src/components/viewer/PDFViewerContainer.tsx](src/components/viewer/PDFViewerContainer.tsx) | Apryse WebViewer v11 wrapper + `PDFViewerHandle` interface |
| [src/components/contracts/AutofillPartyDialog.tsx](src/components/contracts/AutofillPartyDialog.tsx) | Party selector for manual autofill |
| [src/components/viewer/pdfViewer/WrongPartyWarningDialog.tsx](src/components/viewer/pdfViewer/WrongPartyWarningDialog.tsx) | Warns of wrong-party field fill + reverts value |
| [src/components/viewer/pdfViewer/PartyValidationWarningPopup.tsx](src/components/viewer/pdfViewer/PartyValidationWarningPopup.tsx) | Lists unfilled fields blocking save |
| [src/components/teams/CreateTeamDialog.tsx](src/components/teams/CreateTeamDialog.tsx) | Team creation dialog |
| [src/components/teams/RenameTeamDialog.tsx](src/components/teams/RenameTeamDialog.tsx) | Team rename dialog |
| [src/components/teams/TeamCard.tsx](src/components/teams/TeamCard.tsx) | Team card at root view |
| [src/types/auth.ts](src/types/auth.ts) | `LoggedInUser`, `StoredSession`, `BackendLoginResponse` |
| [src/types/contract.ts](src/types/contract.ts) | `Contract` interface, `ContractStatus` enum |
| [src/types/template.ts](src/types/template.ts) | `Template`, `PartyConfiguration`, `FormFieldDefinition` |
| [src/schemas/contractSchema.ts](src/schemas/contractSchema.ts) | Zod schema for Step 1 form validation |
| [src/utils/profileKeyOptions.ts](src/utils/profileKeyOptions.ts) | `buildProfileData()`, `getProfileKeyOptions()`, `DATE_TODAY_KEY` |
| [src/utils/partyValidation.ts](src/utils/partyValidation.ts) | `validatePartyFields()` for partial-fill detection |
| [config/externalSignature.ts](config/externalSignature.ts) | EmailJS config (env vars: `NEXT_PUBLIC_EMAILJS_*`) |
