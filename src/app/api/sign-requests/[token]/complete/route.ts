
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

        if (signRequest.status === 'signed' || signRequest.status === 'cancelled') {
            return NextResponse.json({ error: 'Request no longer pending' }, { status: 400 });
        }

        // 3. Update Request Status
        const now = new Date().toISOString();
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

        // Merge client's field values with existing contract field values
        if (fieldValues) {
            // Fetch existing contract to merge field values
            const existingContract = await db.collection('contracts').findOne(
                { _id: new ObjectId(signRequest.contractId) },
                { projection: { fieldValues: 1 } }
            );
            contractUpdate.fieldValues = {
                ...(existingContract?.fieldValues || {}),
                ...fieldValues
            };
        }

        if (formFields) {
            contractUpdate.formFields = formFields;
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
