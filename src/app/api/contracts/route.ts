import { NextResponse } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();

        // Use URL params to filter if needed, or just return all for demo
        const contracts = await db.collection('contracts')
            .find({})
            .project({ pdf: 0, fileData: 0, signedPdfBase64: 0 })
            .sort({ createdAt: -1 })
            .toArray();

        const mappedContracts = contracts.map(c => ({
            ...c,
            id: c._id.toString(),
            // URL to fetch the contract PDF
            fileUrl: `/api/file/${c._id.toString()}?type=contract`,
            _id: undefined
        }));

        return NextResponse.json(mappedContracts);
    } catch (e) {
        console.error('Failed to fetch contracts:', e);
        return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const data = await request.json();

        const newContract = {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: data.status || 'draft',
            // Ensure binary fields are null initially
            pdf: null,
        };

        const result = await db.collection('contracts').insertOne(newContract);

        return NextResponse.json({
            success: true,
            id: result.insertedId.toString(),
            message: 'Contract metadata created.'
        });

    } catch (e) {
        console.error('Failed to create contract:', e);
        return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
    }
}
