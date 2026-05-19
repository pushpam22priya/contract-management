/**
 * API Route: GET /api/contracts/[id]/history
 *
 * Returns the full version chain for a contract by walking the
 * renewedFromId (backward) and renewedContractId (forward) links.
 *
 * Each entry in the chain is a lightweight summary — no PDF binary,
 * no formFields — just enough data for the History panel UI.
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

const LIGHTWEIGHT_PROJECTION = {
    pdf: 0,
    fileData: 0,
    formFields: 0,
    fieldValues: 0,
    xfdfData: 0,
    signedPdfBase64: 0,
    templateDocxBase64: 0,
    content: 0,
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ success: false, error: 'Invalid contract ID' }, { status: 400 });
        }

        const { db } = await connectToDatabase();

        // Fetch the starting contract
        const start = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: LIGHTWEIGHT_PROJECTION }
        );

        if (!start) {
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        const chain: any[] = [];
        const visited = new Set<string>();

        // ── Walk BACKWARD via renewedFromId ───────────────────────────────────
        let current: any = start;
        while (current && !visited.has(current._id.toString())) {
            visited.add(current._id.toString());
            chain.push(current);

            if (current.renewedFromId && ObjectId.isValid(current.renewedFromId)) {
                const prev = await db.collection('contracts').findOne(
                    { _id: new ObjectId(current.renewedFromId) },
                    { projection: LIGHTWEIGHT_PROJECTION }
                );
                current = prev;
            } else {
                break;
            }
        }

        // ── Walk FORWARD via renewedContractId ────────────────────────────────
        current = start;
        while (current?.renewedContractId && ObjectId.isValid(current.renewedContractId)) {
            if (visited.has(current.renewedContractId)) break;
            const next = await db.collection('contracts').findOne(
                { _id: new ObjectId(current.renewedContractId) },
                { projection: LIGHTWEIGHT_PROJECTION }
            );
            if (!next) break;
            visited.add(next._id.toString());
            chain.push(next);
            current = next;
        }

        // ── Compute effective status (same logic as main contracts API) ──────────
        const SIGNED_STATUSES = new Set(['signed', 'active', 'expiring', 'expired']);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        function effectiveStatus(c: any): string {
            const raw: string = c.status || 'draft';
            // Never override terminal/workflow statuses
            if (!SIGNED_STATUSES.has(raw)) return raw;

            const startDate = c.startDate ? new Date(c.startDate) : null;
            const endDate   = c.endDate   ? new Date(c.endDate)   : null;
            if (startDate) startDate.setHours(0, 0, 0, 0);
            if (endDate)   endDate.setHours(0, 0, 0, 0);

            if (endDate && today > endDate)  return 'expired';
            if (endDate) {
                const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000);
                if (daysLeft <= 60) return 'expiring';
            }
            if (startDate && today >= startDate) return 'active';
            if (startDate && today < startDate)  return 'signed';
            return raw;
        }

        // ── Normalise and sort by startDate ascending ─────────────────────────
        const normalised = chain.map(c => ({
            id:                 c._id.toString(),
            title:              c.title || '',
            startDate:          c.startDate || null,
            endDate:            c.endDate || null,
            status:             effectiveStatus(c),
            createdAt:          c.createdAt || null,
            finalizedAt:        c.finalizedAt || null,
            renewedFromId:      c.renewedFromId || null,
            renewedContractId:  c.renewedContractId || null,
            renewalStatus:      c.renewalStatus || null,
            renewalStartDate:   c.renewalStartDate || null,
            renewalNotes:       c.renewalNotes || null,
            client:             c.client || '',
            category:           c.category || '',
            templateName:       c.templateName || '',
            createdBy:          c.createdBy || '',
            externalSigners:    (c.externalSigners || []).map((s: any) => ({
                email: s.email,
                partyLabel: s.partyLabel,
                status: s.status,
                completedAt: s.completedAt || null,
            })),
            internalSigners:    (c.internalSigners || []).map((s: any) => ({
                email: s.email,
                partyLabel: s.partyLabel,
                status: s.status,
                completedAt: s.completedAt || null,
            })),
        }));

        // Sort: no startDate goes last (drafts/upcoming), rest by startDate
        normalised.sort((a, b) => {
            if (!a.startDate && !b.startDate) return 0;
            if (!a.startDate) return 1;
            if (!b.startDate) return -1;
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

        return NextResponse.json({ success: true, chain: normalised });

    } catch (error: any) {
        console.error('❌ [History] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
