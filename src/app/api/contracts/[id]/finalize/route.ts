/**
 * API Route: POST /api/contracts/[id]/finalize
 *
 * Finalizes a contract after all parties have completed their fields.
 * - Marks the contract as 'active'
 * - Sends download emails to all external signers
 * - Records finalization metadata
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { finalizedBy, finalizedByName } = body;

        console.log(`🏁 [Finalize] Starting finalization for contract: ${id}`);
        console.log(`   Finalized by: ${finalizedBy}`);

        const { db } = await connectToDatabase();

        // 1. Fetch the contract
        const contract = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 0 } } // Exclude binary for this check
        );

        if (!contract) {
            console.log(`❌ [Finalize] Contract not found: ${id}`);
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        console.log(`📋 [Finalize] Contract found: ${contract.title}`);
        console.log(`   Current status: ${contract.status}`);
        console.log(`   Signature flow status: ${contract.signatureFlowStatus}`);

        // 2. Validate that all external signers have completed
        const externalSigners = contract.externalSigners || [];
        const pendingSigners = externalSigners.filter((s: any) => s.status !== 'completed');

        if (pendingSigners.length > 0) {
            console.log(`❌ [Finalize] Cannot finalize - ${pendingSigners.length} signers still pending`);
            return NextResponse.json({
                success: false,
                error: `Cannot finalize: ${pendingSigners.length} external signer(s) have not completed their fields`,
                pendingSigners: pendingSigners.map((s: any) => ({
                    email: s.email,
                    partyLabel: s.partyLabel
                }))
            }, { status: 400 });
        }

        const now = new Date().toISOString();

        // 3. Calculate date-based status
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startDate = contract.startDate ? new Date(contract.startDate) : null;
        const endDate = contract.endDate ? new Date(contract.endDate) : null;
        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(0, 0, 0, 0);

        let finalStatus = 'active'; // default
        if (endDate && today > endDate) {
            finalStatus = 'expired';
        } else if (endDate) {
            const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 30) {
                finalStatus = 'expiring';
            } else if (startDate && today < startDate) {
                finalStatus = 'signed';
            } else {
                finalStatus = 'active';
            }
        } else if (startDate && today < startDate) {
            finalStatus = 'signed';
        }

        console.log(`📊 [Finalize] Calculated status: ${finalStatus} (start: ${contract.startDate}, end: ${contract.endDate})`);

        // 4. Update contract status
        const updateResult = await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: finalStatus,
                    signatureFlowStatus: 'finalized',
                    finalizedAt: now,
                    finalizedBy: finalizedBy,
                    finalizedByName: finalizedByName || finalizedBy,
                    updatedAt: now,
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            console.log(`⚠️ [Finalize] No changes made to contract`);
        }

        console.log(`✅ [Finalize] Contract status updated to '${finalStatus}'`);

        // 4. Collect email recipients for the response
        // (Actual email sending will be handled by the frontend using emailService)
        const emailRecipients = externalSigners.map((signer: any) => ({
            email: signer.email,
            name: signer.name || signer.email,
            partyLabel: signer.partyLabel,
        }));

        console.log(`📧 [Finalize] Email recipients prepared: ${emailRecipients.length}`);
        emailRecipients.forEach((r: any) => {
            console.log(`   - ${r.email} (${r.partyLabel})`);
        });

        return NextResponse.json({
            success: true,
            message: 'Contract finalized successfully',
            finalizedAt: now,
            emailRecipients,
        });

    } catch (error: any) {
        console.error('❌ [Finalize] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
