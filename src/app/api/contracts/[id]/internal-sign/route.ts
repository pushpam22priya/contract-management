/**
 * API Route: POST /api/contracts/[id]/internal-sign
 *
 * Handles internal signer completion from the Signatures page.
 * Called when an internal user completes filling their assigned party fields.
 *
 * - Updates the internal signer's status to 'completed'
 * - Updates the party completion record
 * - Saves the PDF and XFDF data
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { autoAdvanceWorkflow } from '@/lib/workflow/autoAdvance';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { signerEmail, pdfBase64, xfdfData, fieldValues, formFields } = body;

        console.log(`🔏 [InternalSign] Processing internal signer completion for contract: ${id}`);
        console.log(`   Signer: ${signerEmail}`);

        if (!signerEmail) {
            return NextResponse.json({ success: false, error: 'Signer email is required' }, { status: 400 });
        }

        const { db } = await connectToDatabase();

        // 1. Fetch the contract
        const contract = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 0 } } // Exclude large PDF binary, but keep signedPdfBase64 for now
        );

        if (!contract) {
            console.log(`❌ [InternalSign] Contract not found: ${id}`);
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        // 2. Find the internal signer
        const internalSigners = contract.internalSigners || [];
        const signerIndex = internalSigners.findIndex(
            (s: any) => s.email === signerEmail && s.status === 'unlocked'
        );

        if (signerIndex === -1) {
            console.log(`❌ [InternalSign] Internal signer not found or not unlocked: ${signerEmail}`);
            return NextResponse.json({
                success: false,
                error: 'You are not authorized to sign this contract or it is not your turn'
            }, { status: 403 });
        }

        const signer = internalSigners[signerIndex];
        const now = new Date().toISOString();

        console.log(`   Found signer at index ${signerIndex}, party: ${signer.partyId}, order: ${signer.order}`);

        // 3. Update the internal signer's status
        const updatedInternalSigners = [...internalSigners];
        updatedInternalSigners[signerIndex] = {
            ...signer,
            status: 'completed',
            completedAt: now,
        };

        // 4. Update party completions
        const partyCompletions = contract.partyCompletions || [];
        const updatedPartyCompletions = partyCompletions.map((pc: any) => {
            if (pc.partyId === signer.partyId && pc.assigneeEmail === signerEmail) {
                return {
                    ...pc,
                    status: 'completed',
                    completedBy: signerEmail,
                    completedByName: signer.name,
                    completedAt: now,
                };
            }
            return pc;
        });

        // Build contract update object
        const contractVersion = contract.version || 0;
        const updateData: any = {
            internalSigners: updatedInternalSigners,
            partyCompletions: updatedPartyCompletions,
            updatedAt: now,
            version: contractVersion + 1,
        };

        // ✅ SYNC FIX: Also update the 'pdf' binary field so download APIs (which use binary) stay in sync
        try {
            const buffer = Buffer.from(pdfBase64, 'base64');
            if (buffer.length > 0) {
                updateData.pdf = buffer;
                console.log(`🔄 [InternalSign] Synchronized pdfBase64 to binary pdf field (${buffer.length} bytes)`);
            }
        } catch (syncError) {
            console.warn('⚠️ [InternalSign] Failed to convert pdfBase64 to buffer for binary sync:', syncError);
        }

        // 6. Save PDF and XFDF if provided
        if (pdfBase64) {
            updateData.signedPdfBase64 = pdfBase64;
            console.log(`   Saving signed PDF: ${pdfBase64.length} chars`);
        }
        if (xfdfData) {
            updateData.xfdfData = xfdfData;
            console.log(`   Saving XFDF data: ${xfdfData.length} chars`);
        }
        if (fieldValues) {
            // Merge with existing field values
            updateData.fieldValues = {
                ...(contract.fieldValues || {}),
                ...fieldValues,
            };
        }
        if (formFields && formFields.length > 0) {
            // ✅ MERGE formFields instead of overwriting to preserve custom metadata
            // (e.g., assignedParty, partyLabel, lockedBy) that PDFTron exports don't include
            const existingFormFields = contract.formFields || [];
            const existingFieldsMap = new Map<string, any>();

            for (const field of existingFormFields) {
                if (field.name) {
                    existingFieldsMap.set(field.name, field);
                }
            }

            for (const signerField of formFields) {
                if (signerField.name) {
                    existingFieldsMap.set(signerField.name, {
                        ...(existingFieldsMap.get(signerField.name) || {}),
                        ...signerField
                    });
                }
            }

            updateData.formFields = Array.from(existingFieldsMap.values());
        }

        // 7. Update the contract
        const newVersion = contractVersion + 1;
        await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        // ✅ SYNC FIX: Update other pending signature requests with the new version
        // This prevents external signers from getting a 409 Conflict error
        // when they submit after an internal party has already signed.
        try {
            const updateResult = await db.collection('signature_requests').updateMany(
                {
                    contractId: id,
                    status: 'pending'
                },
                {
                    $set: { contractVersion: newVersion }
                }
            );
            if (updateResult.modifiedCount > 0) {
                console.log(`🔄 [InternalSign] Updated ${updateResult.modifiedCount} pending external signature requests to version ${newVersion}`);
            }
        } catch (syncError) {
            console.warn('⚠️ [InternalSign] Failed to sync version to signature requests:', syncError);
        }

        console.log(`✅ [InternalSign] Internal signer ${signerEmail} completed for party ${signer.partyId}`);

        // 8. Auto-advance to the next signing order if the current one is now complete.
        //    Returns newly unlocked external signers so the client can email them.
        let unlockedExternalSigners: { email: string; token: string; name: string; partyLabel: string }[] = [];
        try {
            const advanceResult = await autoAdvanceWorkflow(db, id);
            unlockedExternalSigners = advanceResult.newlyUnlockedExternal;
        } catch (advanceError) {
            // Auto-advance failure must never fail the signing response
            console.error('❌ [InternalSign] Auto-advance error (non-fatal):', advanceError);
        }

        // 9. Check if all signers at current order are complete (for response metadata)
        const currentOrder = contract.currentSigningOrder;
        const externalSigners = contract.externalSigners || [];

        const internalAtCurrentOrder = updatedInternalSigners.filter((s: any) => s.order === currentOrder);
        const externalAtCurrentOrder = externalSigners.filter((s: any) => s.order === currentOrder);

        const allInternalComplete = internalAtCurrentOrder.every((s: any) => s.status === 'completed');
        const allExternalComplete = externalAtCurrentOrder.every((s: any) => s.status === 'completed');
        const currentOrderComplete = allInternalComplete && allExternalComplete;

        console.log(`   Current order: ${currentOrder}`);
        console.log(`   Internal at order ${currentOrder}: ${internalAtCurrentOrder.length}, all complete: ${allInternalComplete}`);
        console.log(`   External at order ${currentOrder}: ${externalAtCurrentOrder.length}, all complete: ${allExternalComplete}`);
        console.log(`   Current order complete: ${currentOrderComplete}`);

        // 9. Check if ALL signers across ALL orders are complete → update status
        const allInternalEverComplete = updatedInternalSigners.every((s: any) => s.status === 'completed');
        const allExternalEverComplete = externalSigners.length === 0 || externalSigners.every((s: any) => s.status === 'completed');
        const allSignersComplete = allInternalEverComplete && allExternalEverComplete;

        if (allSignersComplete && contract.signatureFlowStatus === 'pending_signatures') {
            console.log(`🎉 [InternalSign] All signers (external + internal) have completed!`);
            await db.collection('contracts').updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        signatureFlowStatus: 'all_completed',
                        status: 'signed_by_everyone',
                        updatedAt: now,
                    }
                }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Signature saved successfully',
            signerEmail,
            partyId: signer.partyId,
            partyLabel: signer.partyLabel,
            currentOrderComplete,
            // Newly unlocked external signers — client sends signing emails to these
            unlockedExternalSigners,
        });

    } catch (error: any) {
        console.error('❌ [InternalSign] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
