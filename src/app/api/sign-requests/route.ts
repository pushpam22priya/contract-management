
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            token,
            contractId,
            contractTitle,
            signerEmail,
            createdBy,
            createdByName,
            createdAt,
            expiresAt,
            templateId,
            formFields,
            hasFormFields,
            xfdfData
        } = body;

        const { db } = await connectToDatabase();

        // Validate contract exists
        const contract = await db.collection('contracts').findOne({ _id: new ObjectId(contractId) });
        if (!contract) {
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        const newRequest = {
            token,
            contractId,
            contractTitle,
            signerEmail,
            createdBy,
            createdByName,
            createdAt,
            expiresAt,
            templateId,
            status: 'pending',
            formFields,
            hasFormFields,
            xfdfData,
            // Track events
            events: [{ type: 'created', at: new Date().toISOString() }]
        };

        const result = await db.collection('signature_requests').insertOne(newRequest);

        return NextResponse.json({
            success: true,
            id: result.insertedId.toString(),
            token // Confirm token
        });

    } catch (error: any) {
        console.error('Failed to create signature request:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
