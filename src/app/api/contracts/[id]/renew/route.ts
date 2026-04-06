import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';
import { ContractStatus } from '@/types/contract';

/**
 * POST /api/contracts/[id]/renew
 *
 * Creates a renewal draft contract from an expiring/expired contract.
 * The original is NOT marked as renewed here — that happens when the draft is saved in the UI.
 * If a draft renewal already exists for this contract, returns its ID (idempotent).
 *
 * Body:
 *   startDate      string  ISO date — must be strictly after original endDate
 *   endDate        string  ISO date — must be strictly after startDate
 *   notes?         string  optional notes for the renewal
 *   documentSource 'same' | 'template'
 *   templateId?    string  required when documentSource === 'template'
 *   createdBy      string  email of the user creating the renewal
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid contract ID' }, { status: 400 });
        }

        const body = await request.json();
        const { startDate, endDate, notes, documentSource, templateId, createdBy } = body;

        // ── Validate required fields ───────────────────────────────────────────
        if (!createdBy) {
            return NextResponse.json({ error: 'createdBy is required' }, { status: 400 });
        }
        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
        }
        if (!['same', 'template'].includes(documentSource)) {
            return NextResponse.json({ error: 'documentSource must be "same" or "template"' }, { status: 400 });
        }
        if (documentSource === 'template' && !templateId) {
            return NextResponse.json({ error: 'templateId is required when documentSource is "template"' }, { status: 400 });
        }

        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);

        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
            return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }
        if (newEnd <= newStart) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();

        // ── Fetch original contract ────────────────────────────────────────────
        const original = await db.collection('contracts').findOne({ _id: new ObjectId(id) });
        if (!original) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // ── Guard: only expiring or expired contracts can be renewed ──────────
        const renewableStatuses = [ContractStatus.EXPIRING, ContractStatus.EXPIRED, ContractStatus.ACTIVE];
        if (!renewableStatuses.includes(original.status)) {
            return NextResponse.json(
                { error: `Cannot renew a contract with status "${original.status}"` },
                { status: 400 }
            );
        }

        // ── Guard: block if a renewal is already confirmed (marked in_progress) ─
        // renewalStatus is only set after the user actually saves the renewal draft.
        // If it's still 'in_progress' from a previous confirmed save, block a new one.
        if (original.renewalStatus === 'in_progress' || original.renewalStatus === 'renewed') {
            return NextResponse.json(
                { error: 'This contract has already been renewed' },
                { status: 409 }
            );
        }

        // ── Validate startDate is strictly after original endDate ─────────────
        if (original.endDate) {
            const origEnd = new Date(original.endDate);
            origEnd.setHours(0, 0, 0, 0);
            const candidateStart = new Date(startDate);
            candidateStart.setHours(0, 0, 0, 0);
            if (candidateStart <= origEnd) {
                return NextResponse.json(
                    { error: 'Renewal start date must be after the original contract end date' },
                    { status: 400 }
                );
            }
        }

        // ── Idempotency: return existing renewal draft if one exists ─────────
        // This handles the case where the user clicks Next multiple times
        // (e.g. goes back to Step 1 and clicks Next again). We already set
        // renewalStatus = 'in_progress' above guard, so this path is only
        // reached on the first call. But keep as safety net.
        const existingDraft = await db.collection('contracts').findOne({
            renewedFromId: id,
        }, { projection: { _id: 1 } });
        if (existingDraft) {
            return NextResponse.json({ success: true, renewalId: existingDraft._id.toString() }, { status: 200 });
        }

        // ── Compute renewal number by walking chain backward ─────────────────
        // Walk renewedFromId links to the root to count how deep we are.
        let renewalNumber = 1;
        let cursor = original;
        while (cursor.renewedFromId) {
            renewalNumber++;
            cursor = await db.collection('contracts').findOne(
                { _id: new ObjectId(cursor.renewedFromId) },
                { projection: { renewedFromId: 1 } }
            ) || cursor;
            if (!cursor.renewedFromId) break;
        }

        // Strip any existing (RenewalN) or (Renewal) suffix from the base title
        const baseTitle = original.title.replace(/\s*\(Renewal\d*\)\s*$/i, '').trim();
        const renewalTitle = `${baseTitle} (Renewal${renewalNumber})`;

        // ── Resolve document source ────────────────────────────────────────────
        let renewalPdf: Buffer | null = null;
        let renewalFormFields: any[] = [];
        let renewalParties: any[] = [];
        let renewalXfdf: string | null = null;

        // Helper: enrich formFields with partyLabel/partyColor from parties array.
        // Always clears values regardless of whether parties are present.
        const enrichFormFields = (fields: any[], parties: any[]): any[] => {
            const partyMap = new Map(parties.map((p: any) => [p.id, p]));
            return fields.map((f: any) => {
                const party = f.assignedParty ? partyMap.get(f.assignedParty) : null;
                return {
                    ...f,
                    value: '',          // always clear — never carry over filled values
                    partyLabel: f.partyLabel || party?.label || f.assignedParty || '',
                    partyColor: f.partyColor || party?.color || '#888',
                };
            });
        };

        // Resolve which templateId to carry forward onto the renewal.
        // Renewal contracts don't inherit templateId automatically, so without this
        // a 2nd-generation renewal can't find the clean template PDF and falls back
        // to the signed/filled contract PDF.
        const resolvedTemplateId: string | null =
            documentSource === 'template' ? (templateId || null) :
            (original.templateId || null);

        if (documentSource === 'template' && templateId) {
            // Use a different template
            if (!ObjectId.isValid(templateId)) {
                return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });
            }
            const template = await db.collection('templates').findOne({ _id: new ObjectId(templateId) });
            if (!template) {
                return NextResponse.json({ error: 'Template not found' }, { status: 404 });
            }
            renewalPdf = template.pdf || template.fileData || null;
            renewalParties = template.parties || [];
            renewalFormFields = enrichFormFields(template.formFields || [], renewalParties);
            renewalXfdf = null;
        } else {
            // Use the original template's clean PDF so form fields have no embedded values.
            // The contract's saved pdf has values baked into the PDF binary by PDFTron;
            // only the template PDF is guaranteed to be clean.
            if (original.templateId && ObjectId.isValid(original.templateId)) {
                const sourceTemplate = await db.collection('templates').findOne(
                    { _id: new ObjectId(original.templateId) },
                    { projection: { pdf: 1, formFields: 1, parties: 1 } }
                );
                if (sourceTemplate) {
                    renewalPdf = sourceTemplate.pdf || null;
                    renewalParties = sourceTemplate.parties || original.parties || [];
                    renewalFormFields = enrichFormFields(sourceTemplate.formFields || original.formFields || [], renewalParties);
                } else {
                    // Template deleted — fall back to contract PDF (values will be visible)
                    renewalPdf = original.pdf || original.fileData || null;
                    renewalParties = original.parties || [];
                    renewalFormFields = enrichFormFields(original.formFields || [], renewalParties);
                }
            } else {
                // No templateId (uploaded PDF) — no clean copy available; use contract PDF
                renewalPdf = original.pdf || original.fileData || null;
                renewalParties = original.parties || [];
                renewalFormFields = enrichFormFields(original.formFields || [], renewalParties);
            }
            renewalXfdf = null; // always start clean
        }

        // ── Calculate expiresInDays ────────────────────────────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        newEnd.setHours(0, 0, 0, 0);
        const expiresInDays = Math.ceil((newEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // ── Build renewal contract document ────────────────────────────────────
        const renewalDoc: any = {
            // Inherit key metadata from original
            title: renewalTitle,
            description: original.description || '',
            client: original.client || '',
            category: original.category || '',
            teamId: original.teamId || null,

            // New dates
            startDate: startDate,
            endDate: endDate,
            expiresInDays,

            // Document
            pdf: renewalPdf,
            fileData: renewalPdf,
            formFields: renewalFormFields,
            parties: renewalParties,
            xfdfData: renewalXfdf,
            // Store the source templateId so future renewals can find the clean PDF
            templateId: resolvedTemplateId,

            // Workflow — start fresh as draft
            status: ContractStatus.DRAFT,
            reviewStatus: null,
            signatureFlowStatus: null,
            internalSigners: [],
            externalSigners: [],
            partyCompletions: [],
            currentSigningOrder: null,

            // Renewal chain
            renewedFromId: id,

            // Audit
            createdBy,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (notes?.trim()) {
            renewalDoc.renewalNotes = notes.trim();
        }

        const insertResult = await db.collection('contracts').insertOne(renewalDoc);
        const renewalId = insertResult.insertedId.toString();

        // NOTE: The original contract is NOT marked here.
        // It is only marked as 'in_progress' after the user actually saves
        // the renewal draft (via POST /api/contracts/[id]/mark-renewal).
        // If the user closes without saving, the renewal draft is deleted by the dialog.

        return NextResponse.json({ success: true, renewalId }, { status: 201 });
    } catch (e) {
        console.error('Failed to create renewal:', e);
        return NextResponse.json({ error: 'Failed to create renewal contract' }, { status: 500 });
    }
}
