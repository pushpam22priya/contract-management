'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { templateStep1Schema, TemplateStep1Form } from '@/schemas/templateSchema';
import {
    Box,
    TextField,
    Autocomplete,
    Typography,
    IconButton,
    Chip,
    alpha,
    Alert,
    AlertColor,
    LinearProgress,
    useTheme,
} from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import PDFViewerContainer, { PDFViewerHandle, FormFieldDefinitionWithParty } from '@/components/viewer/PDFViewerContainer';
import PartyConfigDialog from '@/components/template/PartyConfigDialog';
import PartyAssignmentPanel from '@/components/template/PartyAssignmentPanel';
import ProfileFieldMappingDialog from '@/components/template/ProfileFieldMappingDialog';
import { PartyConfiguration, FormFieldDefinition, Category } from '@/types/template';
import { createDefaultParties, groupFieldsByParty } from '@/utils/partyValidation';
import { getProfileKeyOptions, ProfileKeyOption } from '@/utils/profileKeyOptions';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';

interface UploadTemplateDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function UploadTemplateDialog({
    open,
    onClose,
    onSuccess,
}: UploadTemplateDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Wizard state
    const [currentStep, setCurrentStep] = useState<1 | 2>(1);
    const pdfViewerRef = useRef<PDFViewerHandle>(null);
    const { control, reset, watch, setValue, trigger, formState: { errors: fieldErrors } } = useForm<TemplateStep1Form>({
        resolver: zodResolver(templateStep1Schema),
        defaultValues: { templateName: '', description: '', category: '' },
    });
    const { templateName, description, category: selectedCategory } = watch();
    const [fileError, setFileError] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [newCategory, setNewCategory] = useState('');
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [documentUrl, setDocumentUrl] = useState(''); // For PDFViewerContainer
    const [documentLoaded, setDocumentLoaded] = useState(false);

    // Multi-party configuration state
    const [parties, setParties] = useState<PartyConfiguration[]>([]);
    const [showPartyConfigDialog, setShowPartyConfigDialog] = useState(false);
    const [formFields, setFormFields] = useState<FormFieldDefinition[]>([]);
    const [selectedFieldName, setSelectedFieldName] = useState<string | null>(null);
    const [showPartyPanel, setShowPartyPanel] = useState(true);

    // Profile mapping state
    const [showMappingDialog, setShowMappingDialog] = useState(false);
    const [profileKeyOptions, setProfileKeyOptions] = useState<ProfileKeyOption[]>([]);
    const pendingExportRef = useRef<{ exportedFormFields: any[]; xfdfData: string; fileToUpload: File | Blob } | null>(null);
    const closePendingRef = useRef(false);

    // Load categories from backend and profileKeyOptions on mount
    useEffect(() => {
        if (!open) return;

        const loadCategories = async () => {
            console.log('[UploadTemplateDialog] Loading categories from backend');
            try {
                const allCategories = await categoryService.getAllCategories();
                setCategories(allCategories);
                console.log(`[UploadTemplateDialog] Categories loaded: ${allCategories.length}`);
            } catch (err) {
                console.error('[UploadTemplateDialog] Failed to load categories:', err);
                setError('Failed to load categories. Please try again.');
            }
        };

        loadCategories();

        const user = authService.getCurrentUser();
        if (user) setProfileKeyOptions(getProfileKeyOptions(user));
    }, [open]);

    // Handle file upload
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setFileError('');
        }
    };

    // Handle drag events
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    // Handle drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedFile(e.dataTransfer.files[0]);
        }
    };

    // Remove file
    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (documentUrl) {
            URL.revokeObjectURL(documentUrl);
            setDocumentUrl('');
        }
    };

    // Add new category
    const handleAddNewCategory = async () => {
        if (!newCategory.trim()) return;

        setError('');
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to create categories');
            return;
        }

        console.log(`[UploadTemplateDialog] Creating category: "${newCategory.trim()}"`);

        const result = await categoryService.createCategory(
            { name: newCategory.trim() },
            currentUser.email
        );

        if (result.success && result.category) {
            console.log('[UploadTemplateDialog] Category created, updating list:', result.category);
            setCategories(prev => [...prev, result.category!]);
            setValue('category', result.category.name);
            setNewCategory('');
            setShowNewCategoryInput(false);
        } else {
            console.warn('[UploadTemplateDialog] Category creation failed:', result.message);
            setError(result.message);
        }
    };

    // Delete category
    const handleDeleteCategory = async (e: React.MouseEvent, categoryId: string) => {
        e.stopPropagation();
        e.preventDefault();

        const result = await categoryService.deleteCategory(categoryId);
        if (result.success) {
            const categoryToDelete = categories.find(c => c.id === categoryId);
            if (categoryToDelete && selectedCategory === categoryToDelete.name) {
                setValue('category', '');
            }
            setCategories(prev => prev.filter(c => c.id !== categoryId));
        } else {
            setError(result.message);
        }
    };

    // Navigate to Step 2
    const handleNext = async () => {
        const valid = await trigger(['templateName', 'category']);
        if (!valid) return;
        if (!selectedFile) {
            setFileError('Please upload a file');
            return;
        }
        if (selectedFile.type !== 'application/pdf') {
            setFileError('Please upload a PDF file to use the form builder');
            return;
        }
        setFileError('');
        const url = URL.createObjectURL(selectedFile);
        setDocumentUrl(url);
        setCurrentStep(2);
    };

    // Go back to Step 1
    const handleBack = () => {
        setCurrentStep(1);
        // Clean up blob URL
        if (documentUrl) {
            URL.revokeObjectURL(documentUrl);
            setDocumentUrl('');
        }
        setDocumentLoaded(false);
    };

    // Handle party configuration save
    const handlePartiesSave = (newParties: PartyConfiguration[]) => {
        console.log('[UPLOAD-TEMPLATE] Parties configured:', newParties);
        setParties(newParties);
    };

    // Handle party assignment to a field
    const handlePartySelected = (partyId: string) => {
        if (!selectedFieldName || !pdfViewerRef.current) return;

        const party = parties.find(p => p.id === partyId);
        if (!party) return;

        console.log(`[UPLOAD-TEMPLATE] Assigning field "${selectedFieldName}" to party "${partyId}" (${party.label})`);

        // Call the viewer method to assign the field to the party
        const success = pdfViewerRef.current.assignFieldToParty(
            selectedFieldName,
            partyId,
            party.label,
            party.color
        );

        if (success) {
            // Update local form fields state
            setFormFields(prev => prev.map(f =>
                f.name === selectedFieldName
                    ? { ...f, assignedParty: partyId, partyLabel: party.label }
                    : f
            ));
            setSelectedFieldName(null); // Clear selection after assignment
        }
    };

    // Handle multi-select assignment
    const handleMultipleFieldsAssign = (fieldNames: string[], partyId: string) => {
        if (!pdfViewerRef.current) return;
        const party = parties.find(p => p.id === partyId);
        if (!party) return;

        console.log(`[UPLOAD-TEMPLATE] Assigning ${fieldNames.length} fields to party "${partyId}" (${party.label})`);

        const assignedNames: string[] = [];
        fieldNames.forEach(fieldName => {
            const success = pdfViewerRef.current!.assignFieldToParty(fieldName, partyId, party.label, party.color);
            if (success) assignedNames.push(fieldName);
        });

        if (assignedNames.length > 0) {
            setFormFields(prev => prev.map(f =>
                assignedNames.includes(f.name)
                    ? { ...f, assignedParty: partyId, partyLabel: party.label }
                    : f
            ));
            setSelectedFieldName(null);
        }
    };

    // Handle unassign field from party
    const handleFieldUnassigned = (fieldName: string) => {
        if (!pdfViewerRef.current) return;
        console.log(`[UPLOAD-TEMPLATE] Unassigning field "${fieldName}"`);

        const success = pdfViewerRef.current.assignFieldToParty(fieldName, 'unassigned', '', '');
        if (success) {
            setFormFields(prev => prev.map(f =>
                f.name === fieldName
                    ? { ...f, assignedParty: undefined, partyLabel: undefined }
                    : f
            ));
        }
    };

    // Handle field selection (when user clicks on a field in the PDF)
    const handleFieldChange = (fieldName: string, value: any) => {
        console.log(`[UPLOAD-TEMPLATE] Field changed: ${fieldName}`);
        // When a field is selected/focused, set it as the selected field for party assignment
        if (parties.length > 0) {
            setSelectedFieldName(fieldName);
        }
    };

    // Handle party highlighting
    const handleHighlightParty = (partyId: string | null) => {
        if (pdfViewerRef.current) {
            pdfViewerRef.current.highlightPartyFields(partyId);
        }
    };

    // Refresh form fields list from viewer — preserves profileKey, skips 0-field results
    const refreshFormFields = async () => {
        if (pdfViewerRef.current) {
            try {
                const fields = await pdfViewerRef.current.exportFormFieldsWithParty();
                console.log(`[UPLOAD-TEMPLATE] refreshFormFields: got ${fields.length} fields from PDF`);
                if (fields.length === 0) {
                    console.log('[UPLOAD-TEMPLATE] refreshFormFields: skipping update (0 fields returned)');
                    return;
                }
                setFormFields(prev => {
                    const prevMap = new Map(prev.map((f: any) => [f.name, f]));
                    return (fields as FormFieldDefinition[]).map((f: any) => ({
                        ...f,
                        profileKey: prevMap.get(f.name)?.profileKey ?? f.profileKey ?? null,
                    }));
                });
            } catch (e) {
                console.warn('[UPLOAD-TEMPLATE] Failed to refresh form fields:', e);
            }
        }
    };


    // Unsaved changes confirmation dialog
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({ open: false, message: '', severity: 'success' });
    const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

    // State for modification tracking
    const [pdfModified, setPdfModified] = useState(false);

    // Upload progress: -1 = idle, 0-100 = uploading (only active during chunked uploads ≥50MB)
    const [uploadProgress, setUploadProgress] = useState<number>(-1);

    // ✅ AUTO-SAVE: Handle change notifications during template editing
    // Note: For NEW templates, we don't save to JSONBin until final submit
    // (because template doesn't exist yet). This handler just logs changes.
    // For EDITING existing templates, this could be enhanced to actually save.
    const handleAutoSave = async (fileData: string, xfdfData: string) => {
        console.log('💾 [AUTO-SAVE] Template change detected');
        console.log(`📄 File data length: ${fileData?.length || 0}`);
        console.log(`📋 XFDF data length: ${xfdfData?.length || 0}`);
        console.log('ℹ️  [AUTO-SAVE] Changes will be captured on final submit');

        // Note: We don't actually save here because:
        // 1. Template doesn't exist in JSONBin yet (no ID)
        // 2. We always do a fresh export on submit to ensure latest state
        // 3. This avoids race conditions with debounced auto-save
    };

    // executeSave: performs the actual upload/update with resolved form fields
    const executeSave = async (resolvedFormFields: any[], xfdfData: string, fileToUpload: File | Blob): Promise<boolean> => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to upload templates');
            setUploading(false);
            return false;
        }

        try {
            let templateId = savedTemplateId;

            if (templateId) {
                console.log('💾 Updating existing template via Service (re-save)...', templateId);
                const hasNewBinary = fileToUpload !== selectedFile || pdfModified;
                const updateData: any = {
                    name: templateName.trim(),
                    description: description.trim(),
                    category: selectedCategory,
                    formFields: resolvedFormFields,
                    hasFormFields: resolvedFormFields.length > 0,
                    xfdfData: xfdfData,
                    parties: parties.length > 0 ? parties : undefined,
                };
                if (hasNewBinary) {
                    updateData.file = fileToUpload;
                    updateData.fileName = selectedFile!.name;
                    updateData.fileType = 'pdf';
                    console.log(`  - Replacing binary: ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
                    setUploadProgress(0);
                    updateData.onProgress = (progress: number) => {
                        console.log(`[UploadTemplateDialog] Update progress: ${progress}%`);
                        setUploadProgress(progress);
                    };
                }
                const result = await templateService.updateTemplate(templateId, updateData, currentUser.email);
                if (hasNewBinary) setUploadProgress(-1);
                if (!result.success) {
                    setError(result.message || 'Failed to update template. Please try again.');
                    return false;
                }
                console.log('✅ Template updated successfully!', templateId);
            } else {
                console.log('💾 Saving template via Service...');
                console.log(`  - Parties: ${parties.length}`);
                console.log(`  - Form fields: ${resolvedFormFields.length}`);
                console.log(`  - File size: ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
                setUploadProgress(0);
                const savedTemplate = await templateService.saveTemplate({
                    name: templateName.trim(),
                    description: description.trim(),
                    category: selectedCategory!,
                    fileName: selectedFile!.name,
                    file: fileToUpload,
                    xfdfData: xfdfData,
                    formFields: resolvedFormFields,
                    parties: parties.length > 0 ? parties : undefined,
                    onProgress: (progress) => {
                        console.log(`[UploadTemplateDialog] Upload progress: ${progress}%`);
                        setUploadProgress(progress);
                    },
                }, currentUser.email);
                setUploadProgress(-1);
                if (!savedTemplate.success) {
                    console.error('❌ Template save failed:', savedTemplate.message);
                    setError(savedTemplate.message || 'Failed to upload template. Please try again.');
                    return false;
                }
                templateId = (savedTemplate as any).id || null;
                setSavedTemplateId(templateId);
                console.log('✅ Template saved successfully!', templateId);
            }

            if (pdfViewerRef.current && pdfViewerRef.current.setToolbarGroup) {
                pdfViewerRef.current.setToolbarGroup('toolbarGroup-View');
            }

            setSnackbar({ open: true, message: 'Template saved successfully!', severity: 'success' });
            onSuccess?.();

            if (closePendingRef.current) {
                closePendingRef.current = false;
                handleClose();
            }

            return true;
        } catch (err: any) {
            console.error('❌ Error uploading template:', err);
            setError(err.message || 'Failed to upload template. Please try again.');
            return false;
        } finally {
            setUploading(false);
        }
    };

    // Handle submit
    const handleSubmit = async (): Promise<boolean> => {
        setError('');
        setSuccess('');

        const valid = await trigger(['templateName', 'category']);
        if (!valid) return false;
        if (!selectedFile) {
            setFileError('Please upload a file');
            return false;
        }
        setFileError('');

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to upload templates');
            return false;
        }

        setUploading(true);

        try {
            if (pdfViewerRef.current) {
                console.log('🔧 [SUBMIT] Switching to View mode and Pan tool before export...');
                const switched = await pdfViewerRef.current.switchToViewMode();
                if (!switched) {
                    console.error('❌ [SUBMIT] Failed to switch to View mode — aborting upload');
                    setError('Failed to switch to View mode. Please try again.');
                    setUploading(false);
                    return false;
                }
                console.log('✅ [SUBMIT] View mode switch verified — proceeding with export');
            }

            let xfdfData = '';
            let exportedFormFields: any[] = [];
            let fileToUpload: File | Blob = selectedFile;

            // IF on step 2 (Designer) and viewer is active
            if (currentStep === 2 && pdfViewerRef.current) {
                console.log('═══════════════════════════════════════════════════════════════════');
                console.log('📦 [UploadTemplateDialog] Exporting data from Viewer...');
                console.log('✅ [UploadTemplateDialog] Commit process will run in exportAnnotations');
                console.log('═══════════════════════════════════════════════════════════════════');

                console.log('📋 [UploadTemplateDialog] Performing fresh export on submit');

                try {
                    const exportResult = await pdfViewerRef.current.exportAnnotations(undefined, { skipToolbarSwitch: true });
                    if (exportResult) {
                        xfdfData = exportResult.xfdfString;
                        console.log(`  ✓ Extracted XFDF (${xfdfData.length} chars)`);
                    }
                } catch (ex) {
                    console.error('Failed to export annotations:', ex);
                    throw new Error('Failed to prepare document for upload.');
                }

                try {
                    const exportedFields = await pdfViewerRef.current.exportFormFieldsWithParty();
                    exportedFormFields = exportedFields;
                    console.log(`  ✓ Extracted ${exportedFormFields.length} form field definitions with party assignments`);
                    const partyAssignments = pdfViewerRef.current.getAllFieldPartyAssignments();
                    console.log('  ✓ Party assignments:', partyAssignments);
                } catch (e) {
                    console.warn('Failed to export form fields metadata:', e);
                    try {
                        exportedFormFields = await pdfViewerRef.current.exportFormFields();
                        console.log(`  ✓ Fallback: Extracted ${exportedFormFields.length} form field definitions`);
                    } catch (e2) {
                        console.warn('Fallback export also failed:', e2);
                    }
                }

                if (pdfModified) {
                    console.log('  ⚠️ PDF was modified, using exported binary Blob...');
                    try {
                        const exportResult = await pdfViewerRef.current.exportAnnotations(undefined, { skipToolbarSwitch: true });
                        if (exportResult) {
                            fileToUpload = exportResult.blob;
                            console.log(`  ✓ Using exported Blob (${fileToUpload.size} bytes)`);
                        }
                    } catch (ex) {
                        console.error('Failed to export PDF blob:', ex);
                        throw new Error('Failed to prepare document for upload.');
                    }
                } else {
                    console.log('  ✓ PDF not modified, uploading original file.');
                }
            }

            // Merge profileKey from component state formFields into exportedFormFields
            // (profileKey is not stored in PDF/XFDF — it lives only in our state)
            if (exportedFormFields.length > 0 && formFields.length > 0) {
                exportedFormFields = exportedFormFields.map((ef: any) => {
                    const stateField = formFields.find((sf) => sf.name === ef.name);
                    return stateField?.profileKey != null
                        ? { ...ef, profileKey: stateField.profileKey }
                        : ef;
                });
            }

            // If there are mappable (non-signature) fields, show mapping dialog first
            const mappableCount = exportedFormFields.filter(
                (f: any) => f.type !== 'Sig' && f.type !== 'signature'
            ).length;

            if (mappableCount > 0) {
                pendingExportRef.current = { exportedFormFields, xfdfData, fileToUpload };
                setUploading(false);
                setShowMappingDialog(true);
                return false;
            }

            return await executeSave(exportedFormFields, xfdfData, fileToUpload);
        } catch (err: any) {
            console.error('❌ Error uploading template:', err);
            setError(err.message || 'Failed to upload template. Please try again.');
            setUploading(false);
            return false;
        }
    };


    // Handle close attempt — show confirmation if user has entered any data
    const handleCloseAttempt = () => {
        if (uploading) return;
        const hasData = !!(templateName || selectedCategory || selectedFile || currentStep === 2);
        if (hasData) {
            setShowUnsavedDialog(true);
        } else {
            handleClose();
        }
    };

    const handleUnsavedYes = async () => {
        setShowUnsavedDialog(false);
        closePendingRef.current = true;
        await handleSubmit();
        // If handleSubmit returned false because of the mapping dialog,
        // executeSave will call handleClose() via closePendingRef after the user saves mappings.
    };

    const handleUnsavedNo = () => {
        setShowUnsavedDialog(false);
        handleClose();
    };

    const handleUnsavedCancel = () => {
        setShowUnsavedDialog(false);
    };

    // Handle close
    const handleClose = () => {
        if (!uploading) {
            setCurrentStep(1);
            reset();
            setSelectedFile(null);
            setNewCategory('');
            setShowNewCategoryInput(false);
            setError('');
            setFileError('');
            setSuccess('');
            setPdfModified(false);
            setSavedTemplateId(null);
            setUploadProgress(-1);
            setParties([]);
            setFormFields([]);
            setSelectedFieldName(null);
            setShowPartyPanel(true);
            setShowMappingDialog(false);
            pendingExportRef.current = null;
            closePendingRef.current = false;
            if (documentUrl) {
                URL.revokeObjectURL(documentUrl);
                setDocumentUrl('');
            }
            setDocumentLoaded(false);
            onClose();
        }
    };

    // Dialog actions - Step based
    const step1Actions = (
        <AppButton
            onClick={handleNext}
            variant="contained"
            endIcon={<ArrowForward />}
            disabled={!templateName || !selectedCategory || !selectedFile}
            sx={{
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 2,
                bgcolor: 'primary.main',
                boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}40`,
                '&:hover': {
                    bgcolor: 'primary.dark',
                    boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}59`,
                },
                '&.Mui-disabled': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
                    color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.26)',
                },
            }}
        >
            Next: Add Form Fields
        </AppButton>
    );

    const step2Actions = (
        <>
            <AppButton
                variant="outlined"
                onClick={handleBack}
                startIcon={<ArrowBack />}
                sx={{
                    padding: '4px 10px',
                    borderRadius: 2,
                }}
            >
                Back
            </AppButton>
            <AppButton
                onClick={() => setShowPartyConfigDialog(true)}
                variant="outlined"
                sx={{
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                }}
            >
                {parties.length > 0 ? `${parties.length} Parties` : 'Configure Parties'}
            </AppButton>
            <AppButton
                onClick={handleSubmit}
                variant="contained"
                loading={uploading}
                sx={{
                    px: 2,
                    py: 0.5,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                    boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
                    '&:hover': {
                        bgcolor: 'primary.dark',
                        boxShadow: '0 4px 12px rgba(15, 118, 110, 0.35)',
                    },
                }}
            >
                {uploading ? 'Uploading...' : 'Upload Template'}
            </AppButton>
        </>
    );

    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <>
        <BaseDialog
            open={open}
            onClose={handleCloseAttempt}
            title={currentStep === 1 ? "Upload Template - Step 1: Basic Information" : "Upload Template - Step 2: Add Form Fields"}
            actions={dialogActions}
            maxWidth={currentStep === 1 ? 'sm' : 'xl'}
            fullWidth
            fullScreen={currentStep === 2}
            noPadding={currentStep === 2}
        >
            {/* STEP 1: Basic Information */}
            {currentStep === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Error/Success Messages */}
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success">
                            {success}
                        </Alert>
                    )}

                    {/* File Upload Area */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 0.5,
                                color: 'text.primary',
                            }}
                        >
                            Template File <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>

                        {!selectedFile ? (
                            <Box
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                sx={{
                                    border: '2px dashed',
                                    borderColor: dragActive ? 'primary.main' : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'),
                                    borderRadius: 2,
                                    p: 1,
                                    textAlign: 'center',
                                    bgcolor: dragActive
                                        ? (t: any) => alpha(t.palette.primary.main, 0.06)
                                        : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                    transition: 'all 0.3s',
                                    cursor: 'pointer',
                                    '&:hover': {
                                        borderColor: 'primary.main',
                                        bgcolor: (theme: any) => alpha(theme.palette.primary.main, 0.04),
                                    },
                                }}
                                onClick={() => document.getElementById('file-upload-input')?.click()}
                            >
                                <CloudUploadIcon
                                    sx={{
                                        fontSize: 48,
                                        color: dragActive ? 'primary.main' : (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'),
                                        mb: 2,
                                    }}
                                />
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontWeight: 600,
                                        color: 'text.primary',
                                        mb: 0.5,
                                    }}
                                >
                                    Drop your file here or click to browse
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: 'text.secondary',
                                        fontSize: '0.875rem',
                                    }}
                                >
                                    Supported formats: PDF
                                </Typography>
                                <input
                                    id="file-upload-input"
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    border: '1px solid',
                                    borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
                                    borderRadius: 2,
                                    p: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    bgcolor: (t: any) => alpha(t.palette.primary.main, 0.06),
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box
                                        sx={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 1.5,
                                            bgcolor: 'primary.main',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <InsertDriveFileOutlinedIcon
                                            sx={{ fontSize: 20, color: 'white' }}
                                        />
                                    </Box>
                                    <Box>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 600,
                                                color: 'text.primary',
                                            }}
                                        >
                                            {selectedFile.name}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'text.secondary',
                                            }}
                                        >
                                            {(selectedFile.size / 1024).toFixed(2)} KB
                                        </Typography>
                                    </Box>
                                </Box>
                                <IconButton
                                    onClick={handleRemoveFile}
                                    size="small"
                                    sx={{
                                        color: 'text.secondary',
                                        '&:hover': {
                                            bgcolor: 'rgba(0, 0, 0, 0.08)',
                                            color: 'error.main',
                                        },
                                    }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                    </Box>
                    {fileError && (
                        <Typography variant="caption" color="error" sx={{ mt: -1, display: 'block' }}>
                            {fileError}
                        </Typography>
                    )}

                    {/* Template Name */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 0.5,
                                color: 'text.primary',
                            }}
                        >
                            Template Name <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <Controller
                            name="templateName"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    {...field}
                                    fullWidth
                                    placeholder="Enter template name"
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                    slotProps={{ htmlInput: { maxLength: 50 } }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderWidth: 2,
                                            },
                                        },
                                        '& .MuiOutlinedInput-input': {
                                            py: 1.25,
                                            px: 1.5,
                                        },
                                    }}
                                />
                            )}
                        />
                    </Box>

                    {/* Description */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 1.5,
                                color: 'text.primary',
                            }}
                        >
                            Description
                        </Typography>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    {...field}
                                    fullWidth
                                    multiline
                                    rows={2}
                                    placeholder="Enter template description (optional)"
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message}
                                    slotProps={{ htmlInput: { maxLength: 200 } }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderWidth: 2,
                                            },
                                        },
                                    }}
                                />
                            )}
                        />
                    </Box>

                    {/* Category Selection */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                mb: 1.5,
                                color: 'text.primary',
                            }}
                        >
                            Category <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>

                        {!showNewCategoryInput ? (
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                <Autocomplete
                                    fullWidth
                                    options={categories}
                                    value={categories.find(c => c.name === selectedCategory) || null}
                                    onChange={(_event, newValue) => {
                                        setValue('category', newValue ? (typeof newValue === 'string' ? newValue : (newValue as Category).name) : '');
                                    }}
                                    getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Select category"
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: 2,
                                                    padding: 0.4,
                                                    '&:hover fieldset': {
                                                        borderColor: 'rgba(0, 0, 0, 0.3)',
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        borderWidth: 2,
                                                    },
                                                },
                                            }}
                                        />
                                    )}
                                    renderOption={(props, option) => {
                                        const { key, ...otherProps } = props as any;
                                        return (
                                            <li key={key} {...otherProps} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                <Chip
                                                    label={option.name}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: (theme: any) => alpha(theme.palette.primary.main, 0.08),
                                                        color: 'primary.main',
                                                        fontWeight: 500,
                                                    }}
                                                />
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => handleDeleteCategory(e, option.id)}
                                                    sx={{
                                                        ml: 1,
                                                        color: 'text.secondary',
                                                        '&:hover': {
                                                            color: 'error.main',
                                                            bgcolor: 'rgba(239, 68, 68, 0.08)',
                                                        },
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="inherit" />
                                                </IconButton>
                                            </li>
                                        );
                                    }}
                                />
                                <AppButton
                                    variant="outlined"
                                    startIcon={<AddCircleOutlineIcon />}
                                    onClick={() => setShowNewCategoryInput(true)}
                                    sx={{
                                        fontWeight: 600,
                                        // px: 2,
                                        // py: 1.75,
                                        borderRadius: 2,
                                        whiteSpace: 'nowrap',
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                        color: 'text.primary',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            bgcolor: (theme: any) => alpha(theme.palette.primary.main, 0.04),
                                        },
                                    }}
                                >
                                    New
                                </AppButton>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <TextField
                                    fullWidth
                                    placeholder="Enter new category name"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddNewCategory();
                                        }
                                    }}
                                    autoFocus
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            '&:hover fieldset': {
                                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderWidth: 2,
                                            },
                                        },
                                        '& .MuiOutlinedInput-input': {
                                            py: 1.25,
                                            px: 1.5,
                                        },
                                    }}
                                />
                                <AppButton
                                    variant="contained"
                                    onClick={handleAddNewCategory}
                                    disabled={!newCategory.trim()}
                                    sx={{
                                        fontWeight: 600,
                                        borderRadius: 2,
                                        whiteSpace: 'nowrap',
                                        bgcolor: 'primary.main',
                                        '&:hover': {
                                            bgcolor: 'primary.dark',
                                        },
                                    }}
                                >
                                    Add
                                </AppButton>
                                <AppButton
                                    variant="outlined"
                                    onClick={() => {
                                        setShowNewCategoryInput(false);
                                        setNewCategory('');
                                    }}
                                    sx={{
                                        fontWeight: 600,
                                        borderRadius: 2,
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                        color: 'text.primary',
                                        '&:hover': {
                                            borderColor: 'rgba(0, 0, 0, 0.4)',
                                            bgcolor: 'rgba(0, 0, 0, 0.02)',
                                        },
                                    }}
                                >
                                    Cancel
                                </AppButton>
                            </Box>
                        )}
                        {fieldErrors.category && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                {fieldErrors.category.message}
                            </Typography>
                        )}
                    </Box>
                </Box>
            )}

            {/* STEP 2: PDF Form Builder - Full Screen */}
            {currentStep === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 1, mx: 1 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {/* Upload progress bar — shown only during chunked uploads (≥50MB files) */}
                    {uploadProgress >= 0 && (
                        <Box sx={{ px: 1, pb: 0.5 }}>
                            <LinearProgress variant="determinate" value={uploadProgress} />
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                Uploading... {uploadProgress}%
                            </Typography>
                        </Box>
                    )}

                    {/* Main content area with PDF Viewer and Party Panel */}
                    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* PDF Viewer */}
                        {documentUrl ? (
                            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                <PDFViewerContainer
                                    ref={pdfViewerRef}
                                    documentUrl={documentUrl}
                                    isReadOnly={false}
                                    canAddFormFields={true}
                                    initialToolbarGroup="toolbarGroup-Forms"
                                    parties={parties}
                                    enablePartyAssignment={parties.length > 0}
                                    onDocumentLoaded={() => {
                                        setDocumentLoaded(true);
                                        // Refresh form fields when document loads
                                        setTimeout(refreshFormFields, 500);
                                    }}
                                    onError={(msg) => setError(msg)}
                                    onSave={handleAutoSave}
                                    onDocumentModified={() => {
                                        if (!pdfModified) {
                                            console.log('📝 PDF Modified - will upload binary blob instead of original file');
                                            setPdfModified(true);
                                        }
                                        // Refresh form fields when document is modified
                                        refreshFormFields();
                                    }}
                                    onFieldChange={handleFieldChange}
                                    onPartyAssigned={(fieldName, partyId, partyLabel) => {
                                        console.log(`[UPLOAD-TEMPLATE] Field "${fieldName}" assigned to "${partyLabel}"`);
                                        refreshFormFields();
                                    }}
                                    onFieldsWithPartyExported={(fields) => {
                                        console.log(`[UPLOAD-TEMPLATE] onFieldsWithPartyExported: got ${fields.length} fields from PDF`);
                                        if (fields.length === 0) {
                                            console.log('[UPLOAD-TEMPLATE] onFieldsWithPartyExported: skipping update (0 fields returned)');
                                            return;
                                        }
                                        setFormFields(prev => {
                                            const prevMap = new Map(prev.map((f: any) => [f.name, f]));
                                            return (fields as FormFieldDefinition[]).map((f: any) => ({
                                                ...f,
                                                profileKey: prevMap.get(f.name)?.profileKey ?? f.profileKey ?? null,
                                            }));
                                        });
                                    }}
                                />
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'grey.50'
                                }}
                            >
                                <Typography variant="h6" color="text.secondary">
                                    No document loaded
                                </Typography>
                            </Box>
                        )}

                        {/* Party Assignment Panel - Show when parties are configured */}
                        {parties.length > 0 && showPartyPanel && documentLoaded && (
                            <PartyAssignmentPanel
                                parties={parties}
                                formFields={formFields}
                                selectedFieldName={selectedFieldName}
                                onPartySelected={handlePartySelected}
                                onFieldSelected={(fieldName) => {
                                    console.log(`[UPLOAD-TEMPLATE] Field selected from panel: ${fieldName}`);
                                    setSelectedFieldName(fieldName);
                                }}
                                onConfigureParties={() => setShowPartyConfigDialog(true)}
                                onHighlightParty={handleHighlightParty}
                                onMultipleFieldsAssign={handleMultipleFieldsAssign}
                                onFieldUnassigned={handleFieldUnassigned}
                            />
                        )}
                    </Box>
                </Box>
            )}

            {/* Party Configuration Dialog */}
            <PartyConfigDialog
                open={showPartyConfigDialog}
                onClose={() => setShowPartyConfigDialog(false)}
                onSave={handlePartiesSave}
                initialParties={parties}
            />
        </BaseDialog>

        {/* Unsaved Changes Confirmation Dialog */}
        <ConfirmationDialog
            open={showUnsavedDialog}
            title="Unsaved Changes"
            message="Do you want to save changes?"
            onYes={handleUnsavedYes}
            onNo={handleUnsavedNo}
            onClose={handleUnsavedCancel}
            loading={uploading}
        />

        {/* Profile Field Mapping Dialog */}
        <ProfileFieldMappingDialog
            open={showMappingDialog}
            onClose={() => {
                // Skip mapping — save with whatever mappings exist
                setShowMappingDialog(false);
                if (pendingExportRef.current) {
                    const { exportedFormFields, xfdfData, fileToUpload } = pendingExportRef.current;
                    pendingExportRef.current = null;
                    setUploading(true);
                    executeSave(exportedFormFields, xfdfData, fileToUpload);
                }
            }}
            onSave={(updatedFields) => {
                setShowMappingDialog(false);
                setFormFields(updatedFields);
                if (pendingExportRef.current) {
                    const { xfdfData, fileToUpload } = pendingExportRef.current;
                    pendingExportRef.current = null;
                    setUploading(true);
                    executeSave(updatedFields, xfdfData, fileToUpload);
                }
            }}
            formFields={pendingExportRef.current?.exportedFormFields ?? formFields}
            parties={parties}
            profileKeyOptions={profileKeyOptions}
        />

        <NotificationSnackbar
            open={snackbar.open}
            message={snackbar.message}
            severity={snackbar.severity}
            onClose={() => setSnackbar({ ...snackbar, open: false })}
        />
        </>
    );
}
