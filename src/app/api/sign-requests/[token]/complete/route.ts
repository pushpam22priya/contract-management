
import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        // 1. Parse FormData
        const formData = await request.formData();
        const pdfFile = formData.get('pdf') as File;
        const xfdf = (formData.get('xfdf') as string) || '';
        const fieldValuesStr = (formData.get('fieldValues') as string) || '';
        const formFieldsStr = (formData.get('formFields') as string) || '';
        const isAutoSave = formData.get('isAutoSave') === 'true'; // ✅ Check if this is auto-save

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

        // 2. Locate Request
        const signRequest = await db.collection('signature_requests').findOne({ token });
        if (!signRequest) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }

        // ✅ Only block if already signed AND this is not an auto-save
        // Auto-save should still be able to save progress even if status is 'signed' (edge case)
        if ((signRequest.status === 'signed' || signRequest.status === 'cancelled') && !isAutoSave) {
            return NextResponse.json({ error: 'Request no longer pending' }, { status: 400 });
        }

        const now = new Date().toISOString();

        // ✅ AUTO-SAVE vs FINAL SUBMIT handling
        if (isAutoSave) {
            // 3a. Auto-save: Only save progress, don't change status
            console.log('💾 [AUTO-SAVE] Saving external signer progress (not marking as signed)');

            await db.collection('signature_requests').updateOne(
                { token },
                {
                    $set: {
                        lastSavedAt: now,
                        savedXfdf: xfdf // Save XFDF progress separately
                    },
                    $push: {
                        events: { type: 'auto-saved', at: now }
                    }
                } as any
            );

            // Update contract PDF and XFDF without changing status
            const contractUpdate: Record<string, any> = {
                pdf: buffer,
                xfdfData: xfdf,
            };

            // Merge field values
            const existingContract = await db.collection('contracts').findOne(
                { _id: new ObjectId(signRequest.contractId) },
                { projection: { fieldValues: 1 } }
            );

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

            return NextResponse.json({ success: true, message: 'Progress saved' });
        }

        // 3b. Final Submit: Update Request Status to signed
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

        // 4. Update Original Contract with Signed PDF
        // ✅ FIX: Also persist fieldValues and formFields like contract creation does
        const contractUpdate: Record<string, any> = {
            status: 'signed',
            pdf: buffer,
            signedDate: now,
            xfdfData: xfdf,
            'signer.status': 'signed',
            'signer.signedAt': now,
        };

        // Fetch existing contract to merge field values and form fields
        const existingContract = await db.collection('contracts').findOne(
            { _id: new ObjectId(signRequest.contractId) },
            { projection: { fieldValues: 1, formFields: 1 } }
        );

        // Merge client's field values with existing contract field values
        if (fieldValues) {
            contractUpdate.fieldValues = {
                ...(existingContract?.fieldValues || {}),
                ...fieldValues
            };
        }

        // ✅ FIX: Merge formFields instead of overwriting to preserve fields from contract creation
        if (formFields && formFields.length > 0) {
            const existingFormFields = existingContract?.formFields || [];

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

        await db.collection('contracts').updateOne(
            { _id: new ObjectId(signRequest.contractId) },
            { $set: contractUpdate }
        );

        return NextResponse.json({ success: true, message: 'Signature completed' });

    } catch (error: any) {
        console.error('Signature completion failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
