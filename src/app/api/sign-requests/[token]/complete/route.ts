/**
 * API Route: PUT /api/sign-requests/[token]/complete
 *
 * Completes a signature request (external signer submitting their changes).
 * Supports multi-party signature flow with:
 * - Version checking (optimistic locking)
 * - Party completion tracking
 * - Auto-save vs final submit
 */

import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { autoAdvanceWorkflow } from '@/lib/workflow/autoAdvance';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        console.log(`📋 [SignComplete] Processing completion for token: ${token}`);

        // 1. Parse FormData
        const formData = await request.formData();
        const pdfFile = formData.get('pdf') as File;
        const xfdf = (formData.get('xfdf') as string) || '';
        const fieldValuesStr = (formData.get('fieldValues') as string) || '';
        const formFieldsStr = (formData.get('formFields') as string) || '';
        const isAutoSave = formData.get('isAutoSave') === 'true';
        const signerName = (formData.get('signerName') as string) || '';

        if (!pdfFile) {
            console.log(`❌ [SignComplete] No PDF file provided`);
            return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
        }

        // Convert File to Buffer
        const arrayBuffer = await pdfFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
            console.log(`❌ [SignComplete] Empty PDF body`);
            return NextResponse.json({ error: 'Empty PDF body' }, { status: 400 });
        }

        // Parse optional fieldValues and formFields
        let fieldValues: Record<string, string> | undefined;
        let formFields: any[] | undefined;
        try {
            if (fieldValuesStr) fieldValues = JSON.parse(fieldValuesStr);
        } catch (e) { /* ignore parse errors */ }
        try {
            if (formFieldsStr) formFields = JSON.parse(formFieldsStr);
        } catch (e) { /* ignore parse errors */ }

        const { db } = await connectToDatabase();

        // 2. Locate Request
        const signRequest = await db.collection('signature_requests').findOne({ token });
        if (!signRequest) {
            console.log(`❌ [SignComplete] Invalid token: ${token}`);
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }

        console.log(`📋 [SignComplete] Found request for contract: ${signRequest.contractId}`);
        console.log(`   Signer: ${signRequest.signerEmail}`);
        console.log(`   Assigned Party: ${signRequest.assignedParty || 'none'}`);
        console.log(`   Is Auto-Save: ${isAutoSave}`);

        // ✅ Only block if already signed AND this is not an auto-save
        if ((signRequest.status === 'signed' || signRequest.status === 'cancelled') && !isAutoSave) {
            console.log(`❌ [SignComplete] Request no longer pending (status: ${signRequest.status})`);
            return NextResponse.json({ error: 'Request no longer pending' }, { status: 400 });
        }

        // 3. Fetch existing contract for version checking and merging
        const existingContract = await db.collection('contracts').findOne(
            { _id: new ObjectId(signRequest.contractId) },
            { projection: { fieldValues: 1, formFields: 1, version: 1, partyCompletions: 1, externalSigners: 1, internalSigners: 1, signatureFlowStatus: 1, parties: 1 } }
        );

        if (!existingContract) {
            console.log(`❌ [SignComplete] Contract not found: ${signRequest.contractId}`);
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // 4. VERSION CHECK (Optimistic Locking) - Only for final submit, not auto-save
        const contractVersion = existingContract.version || 0;
        const requestVersion = signRequest.contractVersion;

        if (!isAutoSave && requestVersion !== undefined && requestVersion !== contractVersion) {
            console.log(`⚠️ [SignComplete] Version mismatch! Request: ${requestVersion}, Contract: ${contractVersion}`);
            return NextResponse.json({
                error: 'Document has been modified by another party. Please reload and try again.',
                code: 'VERSION_MISMATCH',
                currentVersion: contractVersion
            }, { status: 409 });
        }

        const now = new Date().toISOString();

        // ═══════════════════════════════════════════════════════════════════════════
        // AUTO-SAVE HANDLING
        // ═══════════════════════════════════════════════════════════════════════════
        if (isAutoSave) {
            console.log('💾 [SignComplete] Auto-save: Saving progress without marking as completed');

            await db.collection('signature_requests').updateOne(
                { token },
                {
                    $set: {
                        lastSavedAt: now,
                        savedXfdf: xfdf,
                        // Sync version so final submit won't hit VERSION_MISMATCH
                        contractVersion: contractVersion
                    },
                    $push: {
                        events: { type: 'auto-saved', at: now }
                    }
                } as any
            );

            // Update contract PDF and XFDF without changing status or incrementing version
            const contractUpdate: Record<string, any> = {
                pdf: buffer,
                xfdfData: xfdf,
                updatedAt: now,
            };

            if (fieldValues) {
                contractUpdate.fieldValues = {
                    ...(existingContract?.fieldValues || {}),
                    ...fieldValues
                };
            }

            await db.collection('contracts').updateOne(
                { _id: new ObjectId(signRequest.contractId) },
                { $set: contractUpdate }
            );

            console.log(`✅ [SignComplete] Auto-save completed`);
            return NextResponse.json({ success: true, message: 'Progress saved' });
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // FINAL SUBMIT HANDLING
        // ═══════════════════════════════════════════════════════════════════════════
        console.log('✍️ [SignComplete] Final submit: Marking as completed');

        // Update signature request status
        await db.collection('signature_requests').updateOne(
            { token },
            {
                $set: {
                    status: 'signed',
                    signedAt: now,
                    signedXfdf: xfdf
                },
                $push: {
                    events: { type: 'signed', at: now }
                }
            } as any
        );

        // Build contract update
        const contractUpdate: Record<string, any> = {
            pdf: buffer,
            xfdfData: xfdf,
            updatedAt: now,
            // Increment version for optimistic locking
            version: contractVersion + 1,
        };

        // ✅ SYNC FIX: Also update 'signedPdfBase64' field so contractor UI (which uses Base64) stays in sync
        try {
            const pdfBase64 = buffer.toString('base64');
            if (pdfBase64) {
                contractUpdate.signedPdfBase64 = pdfBase64;
                console.log(`🔄 [SignComplete] Synchronized binary pdf to signedPdfBase64 field (${pdfBase64.length} chars)`);
            }
        } catch (syncError) {
            console.warn('⚠️ [SignComplete] Failed to convert binary buffer to base64 for sync:', syncError);
        }

        // Merge field values
        if (fieldValues) {
            contractUpdate.fieldValues = {
                ...(existingContract?.fieldValues || {}),
                ...fieldValues
            };
        }

        // Merge formFields
        if (formFields && formFields.length > 0) {
            const existingFormFields = existingContract?.formFields || [];
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

            contractUpdate.formFields = Array.from(existingFieldsMap.values());
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // MULTI-PARTY: Update party completion tracking
        // ═══════════════════════════════════════════════════════════════════════════
        const assignedParty = signRequest.assignedParty;

        if (assignedParty) {
            console.log(`🏷️ [SignComplete] Updating party completion for: ${assignedParty}`);

            // Update externalSigners status
            const externalSigners = existingContract.externalSigners || [];
            const updatedSigners = externalSigners.map((signer: any) => {
                if (signer.token === token) {
                    return {
                        ...signer,
                        status: 'completed',
                        completedAt: now,
                    };
                }
                return signer;
            });
            contractUpdate.externalSigners = updatedSigners;

            // Update partyCompletions
            const partyCompletions = existingContract.partyCompletions || [];
            let partyFound = false;

            const updatedCompletions = partyCompletions.map((pc: any) => {
                if (pc.partyId === assignedParty) {
                    partyFound = true;
                    return {
                        ...pc,
                        status: 'completed',
                        completedBy: signRequest.signerEmail,
                        completedByName: signerName || signRequest.signerName || signRequest.signerEmail,
                        completedAt: now,
                        isContractor: false,
                    };
                }
                return pc;
            });

            // If party wasn't in completions yet, add it
            if (!partyFound) {
                const partyConfig = (existingContract.parties || []).find((p: any) => p.id === assignedParty);
                updatedCompletions.push({
                    partyId: assignedParty,
                    partyLabel: partyConfig?.label || signRequest.assignedPartyLabel || assignedParty,
                    status: 'completed',
                    completedBy: signRequest.signerEmail,
                    completedByName: signerName || signRequest.signerName || signRequest.signerEmail,
                    completedAt: now,
                    isContractor: false,
                });
            }

            contractUpdate.partyCompletions = updatedCompletions;

            // Check if ALL parties (external + internal) are now complete
            const allExternalComplete = updatedSigners.length > 0 && updatedSigners.every((s: any) => s.status === 'completed');
            const internalSigners = existingContract.internalSigners || [];
            const allInternalComplete = internalSigners.length === 0 || internalSigners.every((s: any) => s.status === 'completed');
            const allCompleted = allExternalComplete && allInternalComplete;

            if (allCompleted && existingContract.signatureFlowStatus === 'pending_signatures') {
                console.log(`🎉 [SignComplete] All signers (external + internal) have completed!`);
                contractUpdate.signatureFlowStatus = 'all_completed';
                contractUpdate.status = 'signed_by_everyone';
            }

            console.log(`✅ [SignComplete] Party ${assignedParty} marked as completed`);
        } else {
            // Legacy single-signer flow
            console.log(`📝 [SignComplete] Legacy flow: Updating signer status`);
            contractUpdate.status = 'signed';
            contractUpdate.signedDate = now;
            contractUpdate['signer.status'] = 'signed';
            contractUpdate['signer.signedAt'] = now;
        }

        await db.collection('contracts').updateOne(
            { _id: new ObjectId(signRequest.contractId) },
            { $set: contractUpdate }
        );

        // ═══════════════════════════════════════════════════════════════════════════
        // MULTI-PARTY: Update other pending signature requests with new version
        // ═══════════════════════════════════════════════════════════════════════════
        // This ensures other parties in the same multi-party flow won't get VERSION_MISMATCH
        // when they submit after this party completes.
        const newVersion = contractVersion + 1;

        if (assignedParty) {
            const updateResult = await db.collection('signature_requests').updateMany(
                {
                    contractId: signRequest.contractId,
                    token: { $ne: token },  // Don't update the current one
                    status: 'pending'       // Only update pending requests
                },
                {
                    $set: { contractVersion: newVersion }
                }
            );

            if (updateResult.modifiedCount > 0) {
                console.log(`🔄 [SignComplete] Updated ${updateResult.modifiedCount} other pending signature requests to version ${newVersion}`);
            }
        }

        console.log(`✅ [SignComplete] Signature completed successfully`);
        console.log(`   New version: ${newVersion}`);

        // Auto-advance to the next signing order for multi-party contracts.
        // This replaces the manual "Unlock Next Order" action the contractor used to perform.
        let unlockedExternalSigners: { email: string; token: string; name: string; partyLabel: string }[] = [];
        if (assignedParty) {
            try {
                const advanceResult = await autoAdvanceWorkflow(db, signRequest.contractId);
                unlockedExternalSigners = advanceResult.newlyUnlockedExternal;
            } catch (advanceError) {
                // Auto-advance failure must never fail the signing response
                console.error('❌ [SignComplete] Auto-advance error (non-fatal):', advanceError);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Signature completed',
            newVersion,
            // Newly unlocked external signers — client sends signing emails to these
            unlockedExternalSigners,
        });

    } catch (error: any) {
        console.error('❌ [SignComplete] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
