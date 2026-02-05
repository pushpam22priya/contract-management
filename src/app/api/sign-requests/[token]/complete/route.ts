/**
 * API Route: PUT /api/sign-requests/[token]/complete
 *
 * Completes a signing request by updating the contract document directly.
 * Also supports backward compatibility with old signature_requests collection.
 * Stores the signed PDF and merges field values.
 */

import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        console.log(`📋 [SignRequest COMPLETE] Processing completion for token: ${token}`);

        // 1. Parse FormData
        const formData = await request.formData();
        const pdfFile = formData.get('pdf') as File;
        const xfdf = (formData.get('xfdf') as string) || '';
        const fieldValuesStr = (formData.get('fieldValues') as string) || '';
        const formFieldsStr = (formData.get('formFields') as string) || '';

        if (!pdfFile) {
            return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
        }

        // Convert File to Buffer
        const arrayBuffer = await pdfFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
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

        // 2. Try to find contract by token (new approach)
        let contract = await db.collection('contracts').findOne({ externalSigningToken: token });
        let isLegacy = false;
        let legacyRequest = null;

        if (!contract || !contract.signingRequest) {
            // BACKWARD COMPATIBILITY: Check old signature_requests collection
            console.log(`⚠️ [SignRequest COMPLETE] Contract not found with embedded signingRequest, checking legacy...`);

            legacyRequest = await db.collection('signature_requests').findOne({ token });

            if (!legacyRequest) {
                return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
            }

            if (legacyRequest.status === 'signed' || legacyRequest.status === 'cancelled') {
                return NextResponse.json({ error: 'Request no longer pending' }, { status: 400 });
            }

            // Get the contract from legacy request
            contract = await db.collection('contracts').findOne({ _id: new ObjectId(legacyRequest.contractId) });

            if (!contract) {
                return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
            }

            isLegacy = true;
            console.log(`✅ [SignRequest COMPLETE] Using legacy flow for contract: ${contract._id}`);
        } else {
            // Check signing request status (new approach)
            if (contract.signingRequest.status === 'signed' || contract.signingRequest.status === 'cancelled') {
                return NextResponse.json({ error: 'Request no longer pending' }, { status: 400 });
            }
            console.log(`✅ [SignRequest COMPLETE] Using new flow for contract: ${contract._id}`);
        }

        const now = new Date().toISOString();

        // 3. Build update object for contract
        const contractUpdate: Record<string, any> = {
            // Update contract status
            status: 'signed',
            signedDate: now,

            // Update PDF and XFDF
            pdf: buffer,
            xfdfData: xfdf,

            // Update signer info
            'signer.status': 'signed',
            'signer.signedAt': now,
        };

        // For new approach, also update the embedded signingRequest
        if (!isLegacy) {
            contractUpdate['signingRequest.status'] = 'signed';
            contractUpdate['signingRequest.signedAt'] = now;
            contractUpdate['signingRequest.signedXfdf'] = xfdf;
        }

        // Merge client's field values with existing contract field values
        if (fieldValues) {
            contractUpdate.fieldValues = {
                ...(contract.fieldValues || {}),
                ...fieldValues
            };
        }

        // Merge formFields instead of overwriting to preserve fields from contract creation
        if (formFields && formFields.length > 0) {
            const existingFormFields = contract.formFields || [];

            // Create a map of existing fields by name for quick lookup
            const existingFieldsMap = new Map<string, any>();
            for (const field of existingFormFields) {
                if (field.name) {
                    existingFieldsMap.set(field.name, field);
                }
            }

            // Update existing fields with signer's changes, add new fields
            for (const signerField of formFields) {
                if (signerField.name) {
                    existingFieldsMap.set(signerField.name, {
                        ...(existingFieldsMap.get(signerField.name) || {}),
                        ...signerField
                    });
                }
            }

            // Convert map back to array
            contractUpdate.formFields = Array.from(existingFieldsMap.values());
        }

        // 4. Update contract
        const updateQuery = isLegacy
            ? { _id: new ObjectId(legacyRequest!.contractId) }
            : { externalSigningToken: token };

        const updateOperation: any = { $set: contractUpdate };

        // Add event push for new approach
        if (!isLegacy) {
            updateOperation.$push = {
                'signingRequest.events': { type: 'signed', at: now }
            };
        }

        await db.collection('contracts').updateOne(updateQuery, updateOperation);

        // 5. For legacy flow, also update the signature_requests collection
        if (isLegacy && legacyRequest) {
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
        }

        console.log(`✅ [SignRequest COMPLETE] Signature completed for contract ${contract._id}`);

        return NextResponse.json({ success: true, message: 'Signature completed' });

    } catch (error: any) {
        console.error('❌ [SignRequest COMPLETE] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
