# Contract Creation Flow

**Document Type:** Technical Integration Reference  
**System:** Contract Management System (CMS)  
**Module:** Contract Creation (including Team Management)  
**Stack:** Next.js 16 · React 19 · TypeScript · MongoDB · Apryse WebViewer v11 · MUI v7  
**Status:** Production  
**Last Updated:** 2026-06-01

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Team Model — Prerequisite to Contract Creation](#3-team-model--prerequisite-to-contract-creation)
   - 3.1 [Team Data Model](#31-team-data-model)
   - 3.2 [Team–Contract Relationship](#32-teamcontract-relationship)
   - 3.3 [Team API Routes](#33-team-api-routes)
   - 3.4 [Team Service Layer](#34-team-service-layer)
4. [Team Management UI](#4-team-management-ui)
   - 4.1 [Contracts Page — Navigation Modes](#41-contracts-page--navigation-modes)
   - 4.2 [TeamCard](#42-teamcard)
   - 4.3 [CreateTeamDialog](#43-createteamdialog)
   - 4.4 [RenameTeamDiac:\Users\Admin\Desktop\cms-demo\contract-management\docs\contract-creation-flow.mdlog](#44-renameteamdialog)
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
   - 8.2 [Autofill Feature](#82-autofill-feature)
   - 8.3 [Field Filling by the Contractor](#83-field-filling-by-the-contractor)
   - 8.4 [Party Restriction Enforcement](#84-party-restriction-enforcement)
   - 8.5 [Partial Party Validation](#85-partial-party-validation)
   - 8.6 [Restrictions on Form Field Management](#86-restrictions-on-form-field-management)
9. [Save Flow](#9-save-flow)
   - 9.1 [Pre-Save Validation](#91-pre-save-validation)
   - 9.2 [PDF Export](#92-pdf-export)
   - 9.3 [Form Field Export & Merge](#93-form-field-export--merge)
   - 9.4 [Contract Metadata Assembly](#94-contract-metadata-assembly)
   - 9.5 [Persist to Database](#95-persist-to-database)
   - 9.6 [Binary PDF Upload](#96-binary-pdf-upload)
   - 9.7 [XFDF Persistence](#97-xfdf-persistence)
   - 9.8 [Success & Post-Save State](#98-success--post-save-state)
10. [API Reference](#10-api-reference)
    - 10.1 [POST /api/teams](#101-post-apiteams)
    - 10.2 [GET /api/teams](#102-get-apiteams)
    - 10.3 [PATCH /api/teams/\[id\]](#103-patch-apiteamsid)
    - 10.4 [DELETE /api/teams/\[id\]](#104-delete-apiteamsid)
    - 10.5 [POST /api/contracts](#105-post-apicontracts)
    - 10.6 [PUT /api/file/\[id\]?type=contract](#106-put-apifileidtypecontract)
    - 10.7 [PATCH /api/contracts/\[id\]](#107-patch-apicontractsid)
11. [Unsaved Changes Handling](#11-unsaved-changes-handling)
12. [Email Notifications](#12-email-notifications)
13. [Complete Restrictions & Validation Reference](#13-complete-restrictions--validation-reference)
14. [End-to-End Sequence Diagram](#14-end-to-end-sequence-diagram)
15. [File Reference](#15-file-reference)

---

## 1. Overview

A **Contract** in the CMS is a PDF document derived from a pre-existing **Template**. Contracts are organised inside **Teams** — named folders owned by the creating user. The creation flow is:

```
User creates a Team  →  navigates into the Team  →  creates a Contract inside it
```

The contract creation itself is a two-step wizard:

- **Step 1 — Contract Details:** The contractor fills metadata (title, client, dates, value), selects a template, and optionally picks a team.
- **Step 2 — Document Editing:** The contractor fills form fields embedded in the template PDF. The filled PDF is exported and persisted as the contract document.

On completion, the contract is stored in the `contracts` MongoDB collection with status `draft` and a `teamId` pointing to the owning team.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser / React                              │
│                                                                         │
│  contracts/page.tsx                                                     │
│  ├── Root view  → TeamCard list + CreateTeamDialog                      │
│  └── Team view  → ContractCard list + CreateContractDialog              │
│                                                                         │
│  all-contracts/ContractsTab.tsx  → CreateContractDialog (teamId=null)  │
│                                                                         │
│              CreateContractDialog.tsx  (2-step wizard)                  │
│                      │                                                  │
│      ┌───────────────┼──────────────────────┐                           │
│      ▼               ▼                      ▼                           │
│  teamService    templateService       PDFViewerContainer                │
│  getTeams()     getAllTemplates()      (Apryse WebViewer)                │
│      │               │                      │                           │
│      ▼               ▼                      ▼                           │
│  apiService     apiService            exportAnnotations()               │
│  getTeams()     getTemplates()        exportFormFields()                 │
└──────────────────────┬──────────────────────────────────────────────────┘
                       │ HTTP (internal Next.js routes) / MongoDB Driver
          ┌────────────┼──────────────────────────────────┐
          ▼            ▼                                  ▼
  POST /api/teams  POST /api/contracts          PUT /api/file/[id]
  GET  /api/teams  PATCH /api/contracts/[id]
  PATCH/DELETE
  /api/teams/[id]
          │            │                                  │
          └────────────▼──────────────────────────────────┘
                    MongoDB
            collections: teams · contracts
```

### Layer Summary

| Layer | File | Responsibility |
|---|---|---|
| **Types** | `src/types/team.ts` | `Team` interface |
| **Types** | `src/types/contract.ts` | `Contract`, `ContractStatus` |
| **Types** | `src/types/template.ts` | `Template`, `PartyConfiguration`, `FormFieldDefinition` |
| **Schemas** | `src/schemas/contractSchema.ts` | Zod validation for Step 1 |
| **Dialog** | `src/components/contracts/CreateContractDialog.tsx` | Full creation wizard |
| **Dialog** | `src/components/teams/CreateTeamDialog.tsx` | Team creation |
| **Dialog** | `src/components/teams/RenameTeamDialog.tsx` | Team rename |
| **Card** | `src/components/teams/TeamCard.tsx` | Team card on root view |
| **PDF Viewer** | `src/components/viewer/PDFViewerContainer.tsx` | Apryse WebViewer wrapper |
| **Services** | `src/services/contractService.ts` | Create/update contract |
| **Services** | `src/services/templateService.ts` | Fetch templates |
| **Services** | `src/services/apiService.ts` | Raw HTTP calls |
| **API — Teams** | `src/app/api/teams/route.ts` | `GET`, `POST /api/teams` |
| **API — Teams** | `src/app/api/teams/[id]/route.ts` | `PATCH`, `DELETE /api/teams/[id]` |
| **API — Create** | `src/app/api/contracts/route.ts` | `POST /api/contracts` |
| **API — Binary** | `src/app/api/file/[id]/route.ts` | `PUT /api/file/[id]?type=contract` |
| **API — Update** | `src/app/api/contracts/[id]/route.ts` | `PATCH /api/contracts/[id]` |
| **DB** | `src/lib/db.ts` | MongoDB connection |

---

## 3. Team Model — Prerequisite to Contract Creation

A **Team** is the organisational container for contracts. Before a user can create a contract from the Contracts page, they must first create at least one team. Teams are user-scoped — each user manages their own set of teams independently.

### 3.1 Team Data Model

**File:** `src/types/team.ts`  
**MongoDB Collection:** `teams`

```typescript
export interface Team {
    _id: string;       // MongoDB ObjectId (returned as string)
    name: string;      // Display name; max 50 chars; unique per createdBy
    createdBy: string; // Email of the owning user
    createdAt: string; // ISO 8601 timestamp
    updatedAt?: string;// ISO 8601 timestamp; set on rename
}
```

**Database index:** `{ createdBy: 1 }` — ensures fast user-scoped queries.

### 3.2 Team–Contract Relationship

```
Team (1) ───────────────────────── Contract (many)
 _id ─────────────────────────────→ teamId
```

| Rule | Detail |
|---|---|
| **Cardinality** | One team → many contracts |
| **Contract side** | `contract.teamId: string \| null` |
| **Null teamId** | Contract exists at "root level" — no team assigned |
| **No cascading delete** | Team cannot be deleted if it has contracts |
| **No sharing** | Teams are not shared between users; `createdBy` scopes them |
| **No access control** | Teams are organisational only; all users can see all contracts |

### 3.3 Team API Routes

All routes are internal Next.js API routes backed by MongoDB.

**`GET /api/teams?createdBy=<email>`**  
Returns all teams owned by `createdBy`, sorted by `createdAt` descending.

**`POST /api/teams`**  
Creates a new team. Enforces name uniqueness per user.

**`PATCH /api/teams/[id]`**  
Renames a team. Same uniqueness rules as create, excluding the team being renamed.

**`DELETE /api/teams/[id]`**  
Deletes a team only if zero contracts reference it. Returns HTTP 400 otherwise.

Full request/response details are in [§10 API Reference](#10-api-reference).

### 3.4 Team Service Layer

Teams are fetched and managed directly through `apiService` calls inside the components. There is no dedicated `teamService` file — the page and dialog components call `fetch('/api/teams?createdBy=...')` or the equivalent `apiService` methods directly.

---

## 4. Team Management UI

### 4.1 Contracts Page — Navigation Modes

**File:** `src/app/contracts/page.tsx`

The page has three distinct modes driven by the URL `?team=` query parameter:

---

#### Mode 1 — Root View (`/contracts`, no `?team`)

Displays all teams owned by the current user as `TeamCard` components.

```
┌────────────────────────────────────────────────────────┐
│  Contracts                              [+ Create Team] │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 📁 Legal     │  │ 📁 HR        │  │ 📁 Finance   │  │
│  │ 3 contracts  │  │ 1 contract   │  │ 0 contracts  │  │
│  │ 12 Jan 2026  │  │ 05 Feb 2026  │  │ 01 Jun 2026  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

- The **"+ Create Team"** button opens `CreateTeamDialog`.
- If `teams.length === 0`, an empty state is shown with a **"Create your first team"** action.
- Clicking a TeamCard navigates to `/contracts?team=<teamId>`.

---

#### Mode 2 — Inside a Team (`/contracts?team=<teamId>`)

Displays contracts belonging to the active team as `ContractCard` components.

```
┌────────────────────────────────────────────────────────┐
│  ← Contracts / 📁 Legal / 3 contracts   [+ Create Contract] │
│                                                        │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │ Service Agreement      │  │ NDA – Acme Corp        │ │
│  │ Draft · Acme Corp      │  │ Active · Globex Ltd    │ │
│  └────────────────────────┘  └────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

- The **"+ Create Contract"** button opens `CreateContractDialog` with `teamId=<activeTeamId>`.
- The back arrow navigates to root view (`/contracts`).
- All contract filters (status, category, search) operate within this team's contracts only.

---

#### Mode 3 — Flat / Cross-Team View (`/contracts?status=<status>`)

Activated when a status filter is applied without a team. Shows contracts across all teams matching the status filter. No team selection is available in this mode.

---

**Guard logic in `contracts/page.tsx`:**

```typescript
// URL-driven state
const activeTeamId = searchParams.get('team'); // null if at root

// Button click handler
const handleCreateButtonClick = () => {
    if (activeTeamId) {
        setWizardOpen(true);       // Inside team → create contract
    } else {
        setCreateTeamOpen(true);   // At root → create team
    }
};
```

**Key implication:** The same "+" button creates either a team or a contract depending on where the user is. There is no "Create Contract" button at the root level — users must enter a team first.

---

**Contract count per team** is computed client-side:

```typescript
const contractCountByTeam = (teamId: string) =>
    contracts.filter(c => c.teamId === teamId).length;
```

This count is displayed on each TeamCard.

### 4.2 TeamCard

**File:** `src/components/teams/TeamCard.tsx`

Displays a single team at the root view level.

| Element | Content |
|---|---|
| Icon | Folder icon |
| Title | Team name (truncated with tooltip if > display width) |
| Subtitle | `"{n} contract(s)"` — count of contracts in the team |
| Meta | `"Created DD/MM/YYYY"` |
| Hover action 1 | Eye icon → navigate to `/contracts?team=<teamId>` |
| Hover action 2 | Pencil icon → open `RenameTeamDialog` |
| Card click | Navigate to `/contracts?team=<teamId>` |

### 4.3 CreateTeamDialog

**File:** `src/components/teams/CreateTeamDialog.tsx`

A single-step dialog for creating a new team.

```typescript
interface CreateTeamDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (team: Team) => void;  // Returns the new team to the parent
}
```

**Form:**

| Field | Type | Required | Constraint |
|---|---|---|---|
| Team Name | `string` | Yes | 1–50 characters, unique per user |

- A character counter displays `{remaining} / 50 characters remaining`.
- Counter turns warning colour (orange/amber) when ≥ 40 characters are used.

**Save flow:**

1. Validates: non-empty after trim, max 50 chars.
2. Calls `POST /api/teams` with `{ name: trimmedName, createdBy: currentUser.email }`.
3. On success: calls `onCreated(team)` → parent prepends team to `teams` state.
4. Parent shows success notification: `"Team "{name}" created"`.
5. Dialog closes.

**On duplicate name error:**  
Backend returns HTTP 400 → error message shown below the input field.

### 4.4 RenameTeamDialog

**File:** `src/components/teams/RenameTeamDialog.tsx`

```typescript
interface RenameTeamDialogProps {
    open: boolean;
    team: Team | null;        // Pre-filled with current team name
    onClose: () => void;
    onRenamed: (team: Team) => void;
}
```

**Flow:**

1. Pre-fills text field with `team.name`.
2. Validates same rules as create (non-empty, max 50, unique per user — excluding self).
3. Calls `PATCH /api/teams/[id]` with `{ name, createdBy }`.
4. On success: calls `onRenamed(team)` → parent updates `teams` state in place.
5. Shows notification: `"Team renamed to "{newName}""`.

### 4.5 Team Deletion Rules

Teams can only be deleted from the `TeamCard` via a delete action (if present in the UI). The backend enforces a hard constraint:

```
DELETE /api/teams/[id]
→ Counts: db.contracts.count({ teamId: id })
→ If count > 0: HTTP 400 — "Cannot delete: this team contains {n} contract(s)"
→ If count = 0: deletes team, returns { success: true }
```

The user must move or delete all contracts inside a team before the team itself can be deleted. There is no "move contract to another team" feature — contracts would need to be re-created or the `teamId` patched directly.

---

## 5. Entry Points for Contract Creation

Contract creation can only be triggered from inside a team context (from the Contracts page) or from the All Contracts tab (where team assignment is optional).

### 5.1 Contracts Page — Inside a Team

**File:** `src/app/contracts/page.tsx`

```typescript
// Only reachable when activeTeamId is set (user is inside a team)
<IconButton onClick={() => setWizardOpen(true)} />

<CreateContractDialog
    open={wizardOpen}
    onClose={() => setWizardOpen(false)}
    onSuccess={loadContracts}
    teamId={activeTeamId}   // ← team pre-assigned from URL
/>
```

When `teamId` is passed as a prop, the wizard pre-assigns the contract to that team and hides the team selector in Step 1.

### 5.2 All Contracts Tab

**File:** `src/app/all-contracts/ContractsTab.tsx`

```typescript
<CreateContractDialog
    open={wizardOpen}
    onClose={() => setWizardOpen(false)}
    onSuccess={loadContracts}
    teamId={null}   // ← no team pre-selected
/>
```

When `teamId={null}`, a team selector dropdown appears in Step 1. Selecting a team is optional — the user may leave it unassigned.

### 5.3 Dialog Props

```typescript
interface CreateContractDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    initialTemplateName?: string;  // Pre-select a template by name
    teamId?: string | null;        // Pre-assign to a team; hides team selector if set
}
```

---

## 6. Contract Data Models

### 6.1 Contract Interface

**File:** `src/types/contract.ts`

Every field written to the `contracts` MongoDB collection:

| Field | Type | Set on Creation | Source / Notes |
|---|---|---|---|
| `id` | `string` | DB auto | MongoDB `_id` as string |
| `name` | `string` | ✓ | Same as `title` |
| `title` | `string` | ✓ | From Step 1 `contractTitle` |
| `description` | `string` | ✓ | From form or `"Contract based on <templateName>"` |
| `client` | `string` | ✓ | From Step 1 `clientName` |
| `value` | `string` | ✓ | From optional field; defaults to `'N/A'` |
| `category` | `string` | ✓ | Inherited from selected template |
| `status` | `ContractStatus` | ✓ | Always `'draft'` at creation |
| `startDate` | `string` (ISO date) | ✓ | From Step 1; defaults to today |
| `endDate` | `string` (ISO date) | ✓ | From Step 1; defaults to startDate + 1 year |
| `expiresInDays` | `number` | ✓ | Computed: days between today and `endDate` |
| `templateId` | `string` | ✓ | Selected template `id` |
| `templateName` | `string` | ✓ | Selected template `name` |
| `templateFileName` | `string` | ✓ | Selected template `fileName` |
| `templateDocxBase64` | `string` | ✓ | Selected template `docxBase64` |
| `content` | `string` | ✓ | Selected template `content` text |
| `xfdfData` | `string` | ✓ | XFDF exported from Apryse after filling |
| `fieldValues` | `Record<string, string>` | ✓ | Map of `fieldName → value` entered by contractor |
| `formFields` | `FormFieldDefinition[]` | ✓ | Field definitions merged with values and party assignments |
| `hasFormFields` | `boolean` | ✓ | `true` if `formFields.length > 0` |
| `parties` | `PartyConfiguration[]` | ✓ | Copied from template |
| `pdf` | `Buffer` | ✓ | Binary PDF uploaded after metadata creation |
| `signedPdfBase64` | `string` | ✓ | Base64 copy of same PDF |
| **`teamId`** | **`string \| null`** | **✓** | **Team `_id` from URL param or Step 1 selector; `null` if unassigned** |
| `createdBy` | `string` | ✓ | `currentUser.email` |
| `createdAt` | `string` (ISO) | DB auto | Server timestamp on insert |
| `updatedAt` | `string` (ISO) | DB auto | Updated on every PATCH |
| `fileData` | `string` | — | Not set on creation |
| `fileUrl` | `string` | — | Generated dynamically on fetch |
| `reviewers` | `ReviewerInfo[]` | — | Set during review submission |
| `approver` | `ApproverInfo` | — | Set during approval submission |
| `signer` | `SignerInfo` | — | Set during signature submission |
| `internalSigners` | `InternalSigner[]` | — | Set during multi-party signing |
| `externalSigners` | `ExternalSigner[]` | — | Set during multi-party signing |

### 6.2 ContractStatus Enum

```typescript
enum ContractStatus {
    DRAFT                  = 'draft',
    IN_REVIEW              = 'in_review',
    IN_APPROVAL            = 'in_approval',
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

Copied verbatim from the selected template onto the contract.

```typescript
interface PartyConfiguration {
    id: string;     // e.g. "party_1", "party_2"
    label: string;  // e.g. "Buyer", "Seller"
    color: string;  // Hex color, e.g. "#4CAF50"
    order: number;  // Signing order (1 = first to sign)
}
```

---

## 7. Creation Wizard — Step 1: Contract Details

### 7.1 Form Fields

| UI Field | Form Key | Type | Required | Constraints |
|---|---|---|---|---|
| Contract Title | `contractTitle` | `string` | Yes | 1–50 characters |
| Client Name | `clientName` | `string` | Yes | 1–50 characters |
| Description | `description` | `string` | No | 0–500 characters |
| Contract Value | `contractValue` | `string` | No | Free text, no format enforced |
| Start Date | `startDate` | `Date` | No | Defaults to today |
| End Date | `endDate` | `Date` | No | Defaults to startDate + 1 year; must be ≥ startDate |
| Template | `selectedTemplate` | `Template` | Yes | Must be selected before proceeding |
| Team | `selectedTeam` | `Team \| null` | No | Only shown when `teamId` prop is `null` |

### 7.2 Template Selection

Templates are fetched from the Spring Boot backend when the dialog opens:

```typescript
const allTemplates = await templateService.getAllTemplates();
setTemplates(allTemplates);
```

The template selector is an MUI `Autocomplete` searching by template name. When selected, the full `Template` object is stored in state. Its `category`, `parties`, `formFields`, `xfdfData`, and binary PDF are all used in Step 2.

| Template Field | Used For |
|---|---|
| `category` | Stored on contract as `category` |
| `parties` | Copied to `contract.parties`; controls who fills which fields |
| `formFields` | Defines PDF fields, their type, position, and party assignment |
| `xfdfData` | Initial XFDF annotations loaded into PDF viewer |
| `fileData` / `fileUrl` | PDF document rendered in Step 2 |
| `docxBase64` | Stored as `contract.templateDocxBase64` |
| `content` | Stored as `contract.content` |
| `fileName` | Stored as `contract.templateFileName` |

### 7.3 Team Assignment in Step 1

Team assignment behaves differently depending on how the dialog was opened:

---

#### Case A — Dialog opened from inside a team (`teamId` prop is set)

The contract is **automatically assigned** to that team. No team selector is shown. Instead, a read-only info box displays the selected template's name and category:

```
┌─────────────────────────────────────────────────────┐
│ Template: IT Service Agreement    [Service Agreements]│
└─────────────────────────────────────────────────────┘
```

The `teamId` from the URL is silently included in the save payload:

```typescript
teamId: teamId  // from props — e.g. "664a1f2e3b0000000000002a"
```

---

#### Case B — Dialog opened from All Contracts tab (`teamId` prop is `null`)

A **team selector dropdown** appears in the second column alongside the template selector. This loads all teams belonging to the current user:

```typescript
// On dialog open (when teamId prop is null)
const teams = await fetch(`/api/teams?createdBy=${currentUser.email}`);
setTeams(teams);
```

The user may:
- Select a team → contract is assigned to that team.
- Leave the selector empty → contract is saved with `teamId: null` (root level, no team).

```typescript
// In save payload
teamId: selectedTeam?._id || null,
```

---

**Team assignment resolution priority at save time:**

```typescript
teamId: teamId           // 1st: prop from URL (highest priority)
     || selectedTeam?._id  // 2nd: user-selected team in Step 1
     || null               // 3rd: no team (root level)
```

### 7.4 Date Configuration

- **Start Date** defaults to today if left blank.
- **End Date** defaults to start date + 1 year if left blank.
- The end date picker enforces `minDate = startDate` — end cannot be before start.
- `expiresInDays` is computed:

```typescript
const expiresInDays = Math.ceil(
    (new Date(finalEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);
```

### 7.5 Validation Rules — Step 1

**Zod schema** (`src/schemas/contractSchema.ts`):

```typescript
export const contractStep1Schema = z.object({
    contractTitle: z.string()
        .min(1, 'Contract title is required')
        .max(50, 'Contract title must be 50 characters or less'),
    clientName: z.string()
        .min(1, 'Client name is required')
        .max(50, 'Client name must be 50 characters or less'),
    description: z.string()
        .max(500, 'Description must be 500 characters or less'),
});
```

Template selection is validated separately:

```typescript
if (!selectedTemplate) {
    setError('Please select a template');
    return;
}
```

### 7.6 Step Transition

Clicking **"Next: Edit Document"** triggers `handleNextStep()`:

1. Zod validation runs on `contractTitle`, `clientName`, `description`.
2. Template selection is checked.
3. If all pass → `setCurrentStep(2)` — PDF viewer mounts.

---

## 8. Creation Wizard — Step 2: Document Editing

### 8.1 PDF Viewer Initialisation

Step 2 renders a full-screen `PDFViewerContainer` (Apryse WebViewer v11):

```typescript
<PDFViewerContainer
    ref={pdfViewerRef}
    documentUrl={selectedTemplate.fileData || selectedTemplate.fileUrl}
    initialXfdf={selectedTemplate?.xfdfData}
    formFields={selectedTemplate?.formFields}
    isReadOnly={false}
    currentUserRole="contractor"
    canAddFormFields={false}            // Cannot add new fields
    initialToolbarGroup="toolbarGroup-Forms"
    defaultToolbar="view"
    onFieldChange={handleFieldChange}   // Captures every keystroke
    onDocumentLoaded={() => {
        setDocumentLoaded(true);
        handleAutofillClick(true);      // Silent autofill on load
    }}
    onError={(err) => setError(err)}
/>
```

The PDF loaded is the **template PDF**. The contract PDF is generated at save time by exporting the filled viewer state.

### 8.2 Autofill Feature

Autofill maps the contractor's profile data to form fields that have a `profileKey` assigned.

#### Silent Autofill on Load

When the document finishes loading, `handleAutofillClick(true)` is called automatically (silent mode — no dialog):

1. Reads current user via `authService.getCurrentUser()`.
2. Builds profile map via `buildProfileData(currentUser)` — e.g., `{ name: "John Smith", email: "john@company.com", department: "Legal" }`.
3. Iterates `selectedTemplate.formFields`:
   - Skips signature fields (`type === 'Sig'` or `type === 'signature'`).
   - For each text/checkbox field with a `profileKey`, calls `pdfViewerRef.current.setFieldValue(fieldName, profileValue)`.
4. Updates `filledFieldValues` state with the autofilled values.

#### Manual Autofill

Clicking the **Autofill** button:

- If the template has multiple parties: `AutofillPartyDialog` opens to ask which party to autofill.
- If single/no party: autofill runs immediately for all mappable fields.

#### Autofill Restrictions

- Only fields with a `profileKey` mapping are autofilled.
- Signature fields are never autofilled.
- Re-triggering autofill overwrites the current value with the profile value.

### 8.3 Field Filling by the Contractor

Every field change is captured:

```typescript
const handleFieldChange = (fieldName: string, value: string) => {
    setFilledFieldValues(prev => ({ ...prev, [fieldName]: value }));
};
```

`filledFieldValues` is a `Record<string, string>` — the source of truth used at save time.

### 8.4 Party Restriction Enforcement

**The contractor may only fill fields belonging to exactly one party.**

1. The first field filled determines `contractorPartyId`:
   ```typescript
   const contractorPartyId = firstFilledField?.assignedParty ?? null;
   ```
2. If the contractor attempts to fill a field assigned to a different party:
   - `WrongPartyWarningDialog` is displayed.
   - The value is **reverted** to its previous value:
     ```typescript
     pdfViewerRef.current?.restoreFieldValue(fieldName, previousValue);
     ```
   - The new value is not persisted in `filledFieldValues`.

Unassigned fields (no `assignedParty`) are accessible regardless of which party the contractor is filling.

**Why this exists:** Each party fills their own section sequentially during signing. Allowing the contractor to fill multiple parties' fields would bypass the signing workflow.

### 8.5 Partial Party Validation

A contractor who starts filling a party's fields must complete **all** of that party's fields before saving.

```typescript
const partyValidationWarning = useMemo(() =>
    validatePartyFields(
        selectedTemplate.formFields,
        filledFieldValues,
        selectedTemplate.parties
    ),
    [selectedTemplate, filledFieldValues]
);
```

`validatePartyFields` checks each party: if `filledCount > 0 && filledCount < totalCount` → partial fill. The **Save** button is disabled:

```typescript
const canSave =
    selectedTemplate &&
    contractTitle.trim() &&
    clientName.trim() &&
    documentLoaded &&
    (!validationTriggered || !hasPartialParty);
```

`PartyValidationWarningPopup` lists the specific unfilled fields blocking the save.

### 8.6 Restrictions on Form Field Management

| Action | Allowed | Notes |
|---|---|---|
| Fill text fields | ✓ | Own party's fields only |
| Fill checkbox fields | ✓ | Own party's fields only |
| Fill signature fields | ✓ | Via Apryse signature tool |
| Fill another party's fields | ✗ | Blocked; value reverted |
| Add new form fields | ✗ | `canAddFormFields={false}` |
| Delete existing form fields | ✗ | Contractor role in viewer |
| Change party assignments | ✗ | Read-only from template |
| Rearrange fields | ✗ | Positions fixed from template |

---

## 9. Save Flow

### 9.1 Pre-Save Validation

```
1. hasPartialParty?  → BLOCK — show PartyValidationWarningPopup
2. selectedTemplate? → ABORT — "No template selected"
3. Zod validate contractTitle, clientName → ABORT on error
4. documentLoaded?  → ABORT — "Document is still loading"
```

### 9.2 PDF Export

```typescript
const exportResult = await pdfViewerRef.current?.exportAnnotations(
    {},
    { flatten: false }   // Keep annotations interactive
);
// Returns: { blob: Blob, xfdfString: string }
```

`flatten: false` preserves signatures as annotation objects so other parties can sign later.

Fallback chain for XFDF: exported string → template's `xfdfData` → empty string.

### 9.3 Form Field Export & Merge

```typescript
const rawFields = await pdfViewerRef.current?.exportFormFields();

const mergedFormFields = rawFields.map(field => {
    const templateField = selectedTemplate.formFields?.find(f => f.name === field.name);
    return {
        ...field,
        value: filledFieldValues[field.name] || field.value || '',
        assignedParty: templateField?.assignedParty,
        partyLabel: templateField?.partyLabel,
        partyColor: templateField?.partyColor,
        profileKey: templateField?.profileKey ?? null,
        required: templateField?.required ?? field.required,
        label: templateField?.label ?? field.name,
    };
});
```

The merged array restores party assignments and `profileKey` mappings that Apryse does not natively track.

### 9.4 Contract Metadata Assembly

```typescript
const contractData = {
    name: contractTitle.trim(),
    title: contractTitle.trim(),
    client: clientName.trim(),
    description: description.trim() || `Contract based on ${selectedTemplate.name}`,
    value: contractValue || 'N/A',
    category: selectedTemplate.category,
    status: ContractStatus.DRAFT,
    startDate: finalStartDate,
    endDate: finalEndDate,
    expiresInDays,
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    templateFileName: selectedTemplate.fileName,
    templateDocxBase64: selectedTemplate.docxBase64 || '',
    content: selectedTemplate.content || '',
    xfdfData: finalXfdf,
    fieldValues: filledFieldValues,
    formFields: mergedFormFields,
    hasFormFields: mergedFormFields.length > 0 || selectedTemplate.hasFormFields || false,
    parties: selectedTemplate.parties || [],
    createdBy: currentUser.email,
    teamId: teamId || selectedTeam?._id || null,  // ← team resolved here
};
```

### 9.5 Persist to Database

**First save** (`contractId` state is null):

```typescript
const result = await contractService.createContract(contractData);
// POST /api/contracts → returns { success, contract: { id, ...data } }
contractId = result.contract.id;
```

**Subsequent saves** (re-saving after first):

```typescript
await apiService.updateContractMetadata(contractId, contractData);
// PATCH /api/contracts/{id}
```

### 9.6 Binary PDF Upload

```typescript
await contractService.updateContractSignedPdf(contractId, pdfBlob, finalXfdf);
// 1. PUT /api/file/{id}?type=contract  → stores Buffer + base64 in DB
// 2. PATCH /api/contracts/{id}         → persists xfdfData
```

### 9.7 XFDF Persistence

XFDF is stored separately from the binary PDF so that future signers can restore annotations without re-downloading the full PDF binary.

### 9.8 Success & Post-Save State

```typescript
setSnackbar({ open: true, message: 'Contract Saved successfully!', severity: 'success' });
onSuccess?.();  // Parent refreshes contract list
// Dialog stays open — user can continue or close
```

On dialog close, all state is reset to initial values.

---

## 10. API Reference

### 10.1 POST /api/teams

**File:** `src/app/api/teams/route.ts`

Creates a new team.

#### Request

```
POST /api/teams
Content-Type: application/json

{
    "name": "Legal",
    "createdBy": "user@company.com"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `name` | string | Yes | 1–50 chars after trim; unique per `createdBy` (case-sensitive) |
| `createdBy` | string | Yes | User email |

#### Database Insert

```typescript
const newTeam = {
    name: name.trim(),
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};
await db.collection('teams').insertOne(newTeam);
```

#### Response — 201 Created

```json
{
    "success": true,
    "id": "664a1f2e3b0000000000002a",
    "team": {
        "_id": "664a1f2e3b0000000000002a",
        "name": "Legal",
        "createdBy": "user@company.com",
        "createdAt": "2026-06-01T10:00:00.000Z",
        "updatedAt": "2026-06-01T10:00:00.000Z"
    }
}
```

#### Response — 400 Duplicate Name

```json
{
    "error": "A team with this name already exists"
}
```

---

### 10.2 GET /api/teams

Returns all teams owned by the specified user.

#### Request

```
GET /api/teams?createdBy=user@company.com
```

#### Response — 200 OK

```json
[
    {
        "_id": "664a1f2e3b0000000000002a",
        "name": "Legal",
        "createdBy": "user@company.com",
        "createdAt": "2026-06-01T10:00:00.000Z"
    },
    {
        "_id": "664a1f2e3b0000000000002b",
        "name": "HR",
        "createdBy": "user@company.com",
        "createdAt": "2026-05-15T08:30:00.000Z"
    }
]
```

Sorted by `createdAt` descending (most recent first).

---

### 10.3 PATCH /api/teams/[id]

Renames a team.

#### Request

```
PATCH /api/teams/664a1f2e3b0000000000002a
Content-Type: application/json

{
    "name": "Legal & Compliance",
    "createdBy": "user@company.com"
}
```

#### Database Update

```typescript
await db.collection('teams').updateOne(
    { _id: new ObjectId(id) },
    { $set: { name: name.trim(), updatedAt: new Date().toISOString() } }
);
```

#### Response — 200 OK

```json
{ "success": true }
```

#### Response — 400 Duplicate

```json
{ "error": "A team with this name already exists" }
```

---

### 10.4 DELETE /api/teams/[id]

Deletes a team if and only if it contains no contracts.

#### Request

```
DELETE /api/teams/664a1f2e3b0000000000002a
```

#### Logic

```typescript
const contractCount = await db.collection('contracts')
    .countDocuments({ teamId: id });

if (contractCount > 0) {
    return Response.json(
        { error: `Cannot delete: this team contains ${contractCount} contract(s)` },
        { status: 400 }
    );
}

await db.collection('teams').deleteOne({ _id: new ObjectId(id) });
```

#### Response — 200 OK

```json
{ "success": true }
```

#### Response — 400 Has Contracts

```json
{ "error": "Cannot delete: this team contains 3 contract(s)" }
```

---

### 10.5 POST /api/contracts

**File:** `src/app/api/contracts/route.ts`

Creates the contract metadata record.

#### Request

```
POST /api/contracts
Content-Type: application/json

{
    "name": "Service Agreement – Acme Corp",
    "title": "Service Agreement – Acme Corp",
    "client": "Acme Corp",
    "description": "Annual service agreement for IT support",
    "value": "12000",
    "category": "Service Agreements",
    "status": "draft",
    "startDate": "2026-06-01",
    "endDate": "2027-06-01",
    "expiresInDays": 365,
    "templateId": "664a1f2e3b0000000000001a",
    "templateName": "IT Service Agreement",
    "templateFileName": "it-service-agreement.pdf",
    "templateDocxBase64": "",
    "content": "",
    "xfdfData": "<?xml version=\"1.0\"?>...",
    "fieldValues": { "client_name": "Acme Corp" },
    "formFields": [ { ... } ],
    "hasFormFields": true,
    "parties": [ { "id": "party_1", "label": "Buyer", "color": "#4CAF50", "order": 1 } ],
    "createdBy": "contractor@company.com",
    "teamId": "664a1f2e3b0000000000002a"
}
```

#### Database Insert

```typescript
const newContract = {
    ...requestBody,
    pdf: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: requestBody.status || 'draft',
};
await db.collection('contracts').insertOne(newContract);
```

#### Response — 201 Created

```json
{
    "success": true,
    "id": "664a1f2e3b0000000000003a",
    "message": "Contract metadata created."
}
```

---

### 10.6 PUT /api/file/[id]?type=contract

**File:** `src/app/api/file/[id]/route.ts`

Uploads the binary PDF to the contract record.

#### Request

```
PUT /api/file/664a1f2e3b0000000000003a?type=contract
Content-Type: application/octet-stream

<raw PDF bytes>
```

#### Database Update

```typescript
await db.collection('contracts').updateOne(
    { _id: new ObjectId(id) },
    {
        $set: {
            pdf: Buffer.from(await request.arrayBuffer()),
            signedPdfBase64: base64EncodedPdf,
            updatedAt: new Date().toISOString(),
            version: (currentDoc.version || 0) + 1,
        }
    }
);
```

#### Response — 200 OK

```json
{ "success": true, "size": 204832 }
```

---

### 10.7 PATCH /api/contracts/[id]

**File:** `src/app/api/contracts/[id]/route.ts`

Updates any metadata field on a contract (used to persist XFDF after binary upload).

#### Request

```
PATCH /api/contracts/664a1f2e3b0000000000003a
Content-Type: application/json

{ "xfdfData": "<?xml version=\"1.0\"?>..." }
```

#### Response — 200 OK

```json
{ "success": true, "message": "Contract updated." }
```

---

## 11. Unsaved Changes Handling

If the user tries to close the dialog with unsaved changes (modified fields, filled PDF):

1. `ConfirmationDialog` opens: *"You have unsaved changes. Do you want to save before closing?"*
2. **"Save & Close"** → full save flow runs, then dialog closes.
3. **"Discard"** → all state reset, dialog closes.
4. **"Cancel"** → returns to the dialog.

The same dialog appears if the user tries to proceed to a Review or Signature submission without saving first.

---

## 12. Email Notifications

**No email is sent on contract creation.**

The contract is stored as `DRAFT`, visible only to the creator. Emails are triggered by subsequent workflow stages:

| Action | Recipients |
|---|---|
| Submit for review | Assigned reviewers |
| Reviewer approves / rejects | Contract creator |
| Submit for approval | Assigned approver |
| Approver approves / rejects | Contract creator |
| Submit for signature | Each signer (internal + external) |
| Signer completes | Next signer in sequence (auto-advance) |
| All signers complete | Contract creator |

---

## 13. Complete Restrictions & Validation Reference

### Team Restrictions

| Restriction | Enforcement |
|---|---|
| Team name required | Backend: HTTP 400 on empty/missing name |
| Team name max 50 chars | Backend validation |
| Team name unique per user | Backend: HTTP 400 on duplicate |
| Team cannot be deleted if it has contracts | `DELETE /api/teams/[id]`: checks contract count, returns 400 |
| Teams are user-scoped | `GET /api/teams?createdBy=email` — only own teams returned |
| No team rename to existing name | Backend: uniqueness check excludes self |

### Step 1 Restrictions

| Restriction | Enforcement | Error |
|---|---|---|
| Contract title required | Zod `min(1)` | "Contract title is required" |
| Contract title max 50 chars | Zod `max(50)` | "Contract title must be 50 characters or less" |
| Client name required | Zod `min(1)` | "Client name is required" |
| Client name max 50 chars | Zod `max(50)` | "Client name must be 50 characters or less" |
| Description max 500 chars | Zod `max(500)` | "Description must be 500 characters or less" |
| Template must be selected | Manual check in `handleNextStep()` | "Please select a template" |
| End date ≥ start date | MUI DatePicker `minDate` | Dates before start not selectable |

### Step 2 Restrictions

| Restriction | Enforcement |
|---|---|
| Cannot fill another party's fields | `contractorPartyId` check → revert + `WrongPartyWarningDialog` |
| Cannot partially fill a party | `validatePartyFields()` on save → `PartyValidationWarningPopup` |
| Cannot add new form fields | `canAddFormFields={false}` in viewer |
| Cannot delete existing fields | Contractor role in viewer |
| Cannot change field party assignments | Read-only from template |
| Must wait for document to load | Save button disabled until `documentLoaded=true` |

---

## 14. End-to-End Sequence Diagram

```
User                  contracts/page.tsx        CreateTeamDialog     CreateContractDialog        Services             Database
 │                          │                         │                      │                      │                    │
 │──[Open /contracts]───────→│                         │                      │                      │                    │
 │                          │──GET /api/teams──────────────────────────────────────────────────────→│                    │
 │                          │←──Team[]─────────────────────────────────────────────────────────────│                    │
 │                          │                         │                      │                      │                    │
 │   ┌── ROOT VIEW ─────────────────────────────────────────────────────────────────────────────┐   │                    │
 │   │  Shows TeamCards      │                         │                      │                  │   │                    │
 │   │                       │                         │                      │                  │   │                    │
 │──[Click "+ Create Team"]──→│                         │                      │                  │   │                    │
 │   │                       │──open CreateTeamDialog──→│                      │                  │   │                    │
 │   │  User types "Legal"   │                         │                      │                  │   │                    │
 │──[Click "Create"]──────────────────────────────────→│                      │                  │   │                    │
 │   │                       │                         │──POST /api/teams──────────────────────→│   │                    │
 │   │                       │                         │                      │                  │──→db.teams.insert      │
 │   │                       │                         │                      │                  │←──{ id, team }─────    │
 │   │                       │←onCreated(team)─────────│                      │                  │                    │
 │   │  TeamCard "Legal"     │                         │                      │                  │                    │
 │   │  appears              │                         │                      │                  │                    │
 │   └──────────────────────────────────────────────────────────────────────────────────────────┘   │                    │
 │                          │                         │                      │                      │                    │
 │──[Click "Legal" card]────→│                         │                      │                      │                    │
 │   Navigate to /contracts?team=<teamId>              │                      │                      │                    │
 │                          │                         │                      │                      │                    │
 │   ┌── TEAM VIEW ─────────────────────────────────────────────────────────────────────────────┐   │                    │
 │   │  Breadcrumb: Contracts / Legal                  │                      │                  │   │                    │
 │   │  Shows ContractCards  │                         │                      │                  │   │                    │
 │   │                       │                         │                      │                  │   │                    │
 │──[Click "+ Create Contract"]──────────────────────────────────────────────→│                  │   │                    │
 │   │                       │                         │   open wizard with teamId="legal_id"    │   │                    │
 │   │                       │                         │                      │──getAllTemplates()→│  │                    │
 │   │                       │                         │                      │←──Template[]──────│  │                    │
 │   │                       │                         │                      │                      │                    │
 │   │  ┌── STEP 1 ──────────────────────────────────────────────────────────────────────────┐  │   │                    │
 │   │  │  Team: "Legal" (read-only, pre-assigned)     │                      │              │  │   │                    │
 │   │  │  Select template, fill title/client/dates    │                      │              │  │   │                    │
 │──[Click "Next: Edit Document"]────────────────────────────────────────────→│              │  │   │                    │
 │   │  │  Zod validate + template check               │                      │              │  │   │                    │
 │   │  │  setCurrentStep(2)                           │                      │              │  │   │                    │
 │   │  └────────────────────────────────────────────────────────────────────────────────────┘  │   │                    │
 │   │                       │                         │                      │                  │   │                    │
 │   │  ┌── STEP 2 ──────────────────────────────────────────────────────────────────────────┐  │   │                    │
 │   │  │  PDF viewer loads template PDF + xfdfData    │                      │              │  │   │                    │
 │   │  │  onDocumentLoaded() → silent autofill        │                      │              │  │   │                    │
 │   │  │                                              │                      │              │  │   │                    │
 │   │  │  User fills fields (own party only)          │                      │              │  │   │                    │
 │   │  │  onFieldChange() → filledFieldValues{}       │                      │              │  │   │                    │
 │   │  │                                              │                      │              │  │   │                    │
 │──[Click "Save Contract"]───────────────────────────────────────────────────→│              │  │   │                    │
 │   │  │  Pre-save validation (partial party? Zod?)   │                      │              │  │   │                    │
 │   │  │  exportAnnotations() → { blob, xfdfString }  │                      │              │  │   │                    │
 │   │  │  exportFormFields()  → merge with template   │                      │              │  │   │                    │
 │   │  │  Build contractData { ..., teamId: "legal_id" }                     │              │  │   │                    │
 │   │  │                                              │                      │──createContract()→│  │                    │
 │   │  │                                              │                      │  POST /contracts  │──→db.contracts.insert  │
 │   │  │                                              │                      │←──{ id }──────────│  │                    │
 │   │  │                                              │                      │──updateSignedPdf()→│  │                    │
 │   │  │                                              │                      │  PUT /file/{id}   │──→db.$set pdf/base64  │
 │   │  │                                              │                      │  PATCH /contracts │──→db.$set xfdfData    │
 │   │  │  Show "Contract Saved!" snackbar             │                      │              │  │   │                    │
 │   │  │  onSuccess() → reload contract list          │                      │              │  │   │                    │
 │   │  └────────────────────────────────────────────────────────────────────────────────────┘  │   │                    │
 │   └──────────────────────────────────────────────────────────────────────────────────────────┘   │                    │
```

---

## 15. File Reference

| File | Role |
|---|---|
| `src/app/contracts/page.tsx` | Root and team views; team/contract create guards; URL-driven navigation |
| `src/app/all-contracts/ContractsTab.tsx` | Alternative contract creation entry point (no team) |
| `src/components/teams/CreateTeamDialog.tsx` | Team creation dialog |
| `src/components/teams/RenameTeamDialog.tsx` | Team rename dialog |
| `src/components/teams/TeamCard.tsx` | Team card display at root view |
| `src/components/contracts/CreateContractDialog.tsx` | Full creation wizard (~1 212 lines) |
| `src/components/viewer/PDFViewerContainer.tsx` | Apryse WebViewer wrapper |
| `src/components/contracts/AutofillPartyDialog.tsx` | Party selector for manual autofill |
| `src/components/viewer/pdfViewer/WrongPartyWarningDialog.tsx` | Warns contractor of wrong-party field fill |
| `src/components/viewer/pdfViewer/PartyValidationWarningPopup.tsx` | Lists unfilled fields blocking save |
| `src/types/team.ts` | `Team` interface |
| `src/types/contract.ts` | `Contract` interface, `ContractStatus` enum |
| `src/types/template.ts` | `Template`, `PartyConfiguration`, `FormFieldDefinition` |
| `src/schemas/contractSchema.ts` | Zod schema for Step 1 form |
| `src/services/contractService.ts` | `createContract`, `updateContractSignedPdf` |
| `src/services/templateService.ts` | `getAllTemplates` |
| `src/services/apiService.ts` | Raw HTTP: teams, contracts, file upload |
| `src/services/authService.ts` | `getCurrentUser` — provides profile for autofill |
| `src/app/api/teams/route.ts` | `GET`, `POST /api/teams` |
| `src/app/api/teams/[id]/route.ts` | `PATCH`, `DELETE /api/teams/[id]` |
| `src/app/api/contracts/route.ts` | `POST /api/contracts` — insert to MongoDB |
| `src/app/api/contracts/[id]/route.ts` | `PATCH /api/contracts/[id]` — update metadata |
| `src/app/api/file/[id]/route.ts` | `PUT /api/file/[id]?type=contract` — binary PDF upload |
| `src/lib/db.ts` | MongoDB connection (`teams`, `contracts` collections) |
| `src/utils/profileKeyOptions.ts` | `buildProfileData()` for autofill mapping |
| `src/utils/partyValidation.ts` | `validatePartyFields()` for partial-fill detection |
