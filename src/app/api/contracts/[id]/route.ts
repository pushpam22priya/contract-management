import { NextResponse, NextRequest } from 'next/server';
import clientPromise from '@/lib/db';
import { ObjectId } from 'mongodb';
 
/**
* PATCH /api/contracts/[id]
* Update contract metadata including XFDF data
*/
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const id = resolvedParams.id;
 
        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }
 
        const body = await request.json();
        const client = await clientPromise;
        const db = client.db();
 
        // Build update object dynamically based on what fields are provided
        const updateFields: any = {
            updatedAt: new Date().toISOString()
        };
 
        // Allow updating XFDF data
        if (body.xfdfData !== undefined) {
            updateFields.xfdfData = body.xfdfData;
        }
 
        // ✅ FIX: Fetch existing contract to merge formFields and fieldValues
        const existingContract = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: { formFields: 1, fieldValues: 1 } }
        );
 
        // ✅ FIX: Merge formFields instead of overwriting to preserve fields from contract creation
        if (body.formFields !== undefined && Array.isArray(body.formFields)) {
            const existingFormFields = existingContract?.formFields || [];
 
            // Create a map of existing fields by name for quick lookup
            const existingFieldsMap = new Map<string, any>();
            for (const field of existingFormFields) {
                if (field.name) {
                    existingFieldsMap.set(field.name, field);
                }
            }
 
            // Update existing fields with new changes, add new fields
            for (const newField of body.formFields) {
                if (newField.name) {
                    existingFieldsMap.set(newField.name, {
                        ...(existingFieldsMap.get(newField.name) || {}),
                        ...newField
                    });
                }
            }
 
            // Convert map back to array
            updateFields.formFields = Array.from(existingFieldsMap.values());
        }
 
        // Allow updating any other contract fields
        const allowedFields = [
            'name', 'title', 'description', 'client', 'value', 'category',
            'status', 'content', 'startDate', 'endDate',
            'reviewers', 'approver', 'signer', 'reviewStatus', 'approvalStatus',
            'modificationComments', 'modificationRequests'
        ];
 
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateFields[field] = body[field];
            }
        }
 
        // ✅ FIX: Merge fieldValues instead of overwriting
        if (body.fieldValues !== undefined) {
            updateFields.fieldValues = {
                ...(existingContract?.fieldValues || {}),
                ...body.fieldValues
            };
        }
 
        const result = await db.collection('contracts').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
 
        if (result.matchedCount === 0) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }
 
        return NextResponse.json({
            success: true,
            message: 'Contract updated successfully'
        });
 
    } catch (e) {
        console.error('Update contract error:', e);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
 
/**
* GET /api/contracts/[id]
* Get contract details by ID
*/
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const id = resolvedParams.id;
 
        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }
 
        const client = await clientPromise;
        const db = client.db();
 
        // Exclude large binary fields from default response
        const contract = await db.collection('contracts').findOne(
            { _id: new ObjectId(id) },
            { projection: { pdf: 0, fileData: 0, signedPdfBase64: 0 } }
        );
 
        if (!contract) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }
 
        return NextResponse.json({
            ...contract,
            id: contract._id.toString(),
            fileUrl: `/api/file/${contract._id.toString()}?type=contract`,
            _id: undefined
        });
 
    } catch (e) {
        console.error('Get contract error:', e);
        return NextResponse.json({ error: 'Failed to fetch contract' }, { status: 500 });
    }
}