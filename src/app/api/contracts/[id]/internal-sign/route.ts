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

        // 5. Build update object
        const updateData: any = {
            internalSigners: updatedInternalSigners,
            partyCompletions: updatedPartyCompletions,
            updatedAt: now,
        };

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
        await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        console.log(`✅ [InternalSign] Internal signer ${signerEmail} completed for party ${signer.partyId}`);

        // 8. Check if all signers at current order are complete
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
        });

    } catch (error: any) {
        console.error('❌ [InternalSign] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
