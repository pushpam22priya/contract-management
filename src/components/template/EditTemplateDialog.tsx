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
    useTheme,
} from '@mui/material';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { templateService } from '@/services/templateService';
import { categoryService } from '@/services/categoryService';
import { authService } from '@/services/authService';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import NotificationSnackbar from '@/components/common/NotificationSnackbar';
import { Template, PartyConfiguration, FormFieldDefinition } from '@/types/template';
import PDFViewerContainer, { PDFViewerHandle } from '@/components/viewer/PDFViewerContainer';
import PartyConfigDialog from '@/components/template/PartyConfigDialog';
import PartyAssignmentPanel from '@/components/template/PartyAssignmentPanel';
import ProfileFieldMappingDialog from '@/components/template/ProfileFieldMappingDialog';
import DeleteIcon from '@mui/icons-material/Delete';
import { Category } from '@/types/template';
import { getProfileKeyOptions, ProfileKeyOption } from '@/utils/profileKeyOptions';
import { fetchTemplateBlobUrl } from '@/utils/fetchTemplateBlobUrl';

interface EditTemplateDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    template: Template;
}

export default function EditTemplateDialog({
    open,
    onClose,
    onSuccess,
    template,
}: EditTemplateDialogProps) {
    // Wizard state
    const [currentStep, setCurrentStep] = useState<1 | 2>(1);
    const pdfViewerRef = useRef<PDFViewerHandle>(null);
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const { control, reset, watch, setValue, trigger, formState: { errors: fieldErrors } } = useForm<TemplateStep1Form>({
        resolver: zodResolver(templateStep1Schema),
        defaultValues: { templateName: '', description: '', category: '' },
    });
    const { templateName, description, category: selectedCategory } = watch();
    const [categories, setCategories] = useState<Category[]>([]);
    const [newCategory, setNewCategory] = useState('');
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Document URL for PDF Viewer (either new file blob or existing template URL)
    const [documentUrl, setDocumentUrl] = useState('');
    const [documentLoaded, setDocumentLoaded] = useState(false);

    // Blob URL fetched from MinIO for existing templates (fileUploaded = true)
    const [fetchingPdf, setFetchingPdf] = useState(false);
    const [existingBlobUrl, setExistingBlobUrl] = useState<string | null>(null);

    // Multi-party configuration state
    const [parties, setParties] = useState<PartyConfiguration[]>([]);
    const [showPartyConfigDialog, setShowPartyConfigDialog] = useState(false);
    const [formFields, setFormFields] = useState<FormFieldDefinition[]>([]);
    const [selectedFieldName, setSelectedFieldName] = useState<string | null>(null);
    const [showPartyPanel, setShowPartyPanel] = useState(true);

    // Profile mapping state
    const [showMappingDialog, setShowMappingDialog] = useState(false);
    const [profileKeyOptions, setProfileKeyOptions] = useState<ProfileKeyOption[]>([]);
    const pendingExportRef = useRef<{ exportedFormFields: any[]; xfdfData: string; fileToUpload: File | Blob | null } | null>(null);
    const closePendingRef = useRef(false);

    // Load categories from backend + pre-fill form on mount
    useEffect(() => {
        if (!open) return;

        // Async: fetch categories from backend
        const loadCategories = async () => {
            console.log('[EditTemplateDialog] Loading categories from backend');
            try {
                const allCategories = await categoryService.getAllCategories();
                setCategories(allCategories);
                console.log(`[EditTemplateDialog] Categories loaded: ${allCategories.length}`);
            } catch (err) {
                console.error('[EditTemplateDialog] Failed to load categories:', err);
                setError('Failed to load categories. Please try again.');
            }
        };

        loadCategories();

        // Sync: pre-fill form with existing template data
        reset({ templateName: template.name, description: template.description || '', category: template.category });
        setSelectedFile(null);
        setError('');
        setSuccess('');
        setShowNewCategoryInput(false);
        setCurrentStep(1);
        setDocumentUrl('');

        // Load existing parties and form fields
        setParties(template.parties || []);
        const loadedFields = template.formFields || [];
        console.log(`[EditTemplateDialog] INIT: loading ${loadedFields.length} fields from template. ProfileKeys:`, loadedFields.map((f: any) => `${f.name}=${f.profileKey ?? 'null'}`));
        setFormFields(loadedFields);
        setSelectedFieldName(null);
        setShowPartyPanel(true);

        const user = authService.getCurrentUser();
        if (user) setProfileKeyOptions(getProfileKeyOptions(user));

        // Reset blob URL when dialog reopens (a new template may be edited)
        setExistingBlobUrl(prev => {
            if (prev?.startsWith('blob:')) {
                console.log('[EditTemplateDialog] Revoking stale blob URL on reopen');
                URL.revokeObjectURL(prev);
            }
            return null;
        });
        setFetchingPdf(false);
    }, [open, template, reset]);

    // Revoke blob URL when component unmounts
    useEffect(() => {
        return () => {
            if (existingBlobUrl?.startsWith('blob:')) {
                console.log('[EditTemplateDialog] Revoking blob URL on unmount');
                URL.revokeObjectURL(existingBlobUrl);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingBlobUrl]);

    // Handle file upload
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setError('');
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

        console.log(`[EditTemplateDialog] Creating category: "${newCategory.trim()}"`);

        const result = await categoryService.createCategory(
            { name: newCategory.trim() },
            currentUser.email
        );

        if (result.success && result.category) {
            console.log('[EditTemplateDialog] Category created, updating list:', result.category);
            setCategories(prev => [...prev, result.category!]);
            setValue('category', result.category.name);
            setNewCategory('');
            setShowNewCategoryInput(false);
        } else {
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

    // Handle party configuration save
    const handlePartiesSave = (newParties: PartyConfiguration[]) => {
        console.log('[EDIT-TEMPLATE] Parties configured:', newParties);
        setParties(newParties);
    };

    // Handle party assignment to a field
    const handlePartySelected = (partyId: string) => {
        if (!selectedFieldName || !pdfViewerRef.current) return;

        const party = parties.find(p => p.id === partyId);
        if (!party) return;

        console.log(`[EDIT-TEMPLATE] Assigning field "${selectedFieldName}" to party "${partyId}" (${party.label})`);

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

        console.log(`[EDIT-TEMPLATE] Assigning ${fieldNames.length} fields to party "${partyId}" (${party.label})`);

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
        console.log(`[EDIT-TEMPLATE] Unassigning field "${fieldName}"`);

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
        console.log(`[EDIT-TEMPLATE] Field changed: ${fieldName}`);
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

    // Refresh form fields list from viewer — preserves profileKey from existing state
    const refreshFormFields = async () => {
        if (pdfViewerRef.current) {
            try {
                const fields = await pdfViewerRef.current.exportFormFieldsWithParty();
                console.log(`[EDIT-TEMPLATE] refreshFormFields: got ${fields.length} fields from PDF`);
                if (fields.length === 0) {
                    console.log('[EDIT-TEMPLATE] refreshFormFields: skipping update (0 fields returned)');
                    return;
                }
                setFormFields(prev => {
                    const prevMap = new Map(prev.map((f: any) => [f.name, f]));
                    const merged = (fields as FormFieldDefinition[]).map((f: any) => {
                        const prevField = prevMap.get(f.name);
                        const profileKey = prevField?.profileKey ?? f.profileKey ?? null;
                        if (profileKey) console.log(`[EDIT-TEMPLATE] refreshFormFields: preserving profileKey "${profileKey}" for field "${f.name}"`);
                        return { ...f, profileKey };
                    });
                    return merged;
                });
            } catch (e) {
                console.warn('[EDIT-TEMPLATE] Failed to refresh form fields:', e);
            }
        }
    };

    // Navigate to Step 2
    const handleNext = async () => {
        const valid = await trigger(['templateName', 'category']);
        if (!valid) return;

        if (selectedFile) {
            // User selected a new replacement file
            if (selectedFile.type !== 'application/pdf') {
                setError('Please upload a PDF file to use the form builder');
                return;
            }
            console.log(`[EditTemplateDialog] handleNext: using new file blob (${(selectedFile.size / 1024).toFixed(0)}KB)`);
            const url = URL.createObjectURL(selectedFile);
            setDocumentUrl(url);
            setCurrentStep(2);
            setError('');
            return;
        }

        // No new file — load existing template PDF
        if (template.fileType !== 'pdf') {
            setError('Only PDF templates support the form builder');
            return;
        }

        if (template.fileUploaded) {
            // Template binary is in MinIO — fetch with JWT and create a blob URL for Apryse
            console.log(`[EditTemplateDialog] handleNext: fetching blob URL for template "${template.id}" from MinIO`);
            setFetchingPdf(true);
            setError('');
            try {
                const url = await fetchTemplateBlobUrl(template.id);
                if (!url) {
                    setError('Failed to load template PDF. Please try again.');
                    return;
                }
                console.log(`[EditTemplateDialog] handleNext: blob URL ready, navigating to Step 2`);
                setExistingBlobUrl(url);
                setDocumentUrl(url);
                setCurrentStep(2);
            } catch (e) {
                console.error('[EditTemplateDialog] handleNext: blob fetch error:', e);
                setError('Failed to load template PDF. Please try again.');
            } finally {
                setFetchingPdf(false);
            }
        } else {
            // Legacy path: template was saved before MinIO migration (has fileData or direct fileUrl)
            const legacyUrl = template.fileData || template.fileUrl;
            if (legacyUrl) {
                console.log(`[EditTemplateDialog] handleNext: using legacy fileUrl/fileData for template "${template.id}"`);
                setDocumentUrl(legacyUrl);
                setCurrentStep(2);
                setError('');
            } else {
                setError('No file found for this template. Please upload a replacement file.');
            }
        }
    };

    // Go back to Step 1
    const handleBack = () => {
        setCurrentStep(1);
        if (selectedFile && documentUrl) {
            // Blob URL was created from a new selected file — revoke it
            console.log('[EditTemplateDialog] handleBack: revoking blob URL from selected file');
            URL.revokeObjectURL(documentUrl);
        } else if (existingBlobUrl && documentUrl === existingBlobUrl) {
            // Blob URL was fetched from MinIO — revoke it
            console.log('[EditTemplateDialog] handleBack: revoking MinIO blob URL');
            URL.revokeObjectURL(existingBlobUrl);
            setExistingBlobUrl(null);
        }
        setDocumentUrl('');
        setDocumentLoaded(false);
    };

    // Unsaved changes confirmation dialog
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({ open: false, message: '', severity: 'success' });

    // State for modification tracking
    const [pdfModified, setPdfModified] = useState(false);

    // executeSave: performs the actual update with resolved form fields
    const executeSave = async (resolvedFormFields: any[], xfdfData: string, fileToUpload: File | Blob | null): Promise<boolean> => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to update templates');
            setUpdating(false);
            return false;
        }

        try {
            console.log('💾 Updating template via Service...');
            console.log(`  - Parties: ${parties.length}`);

            const updateData: any = {
                name: templateName.trim(),
                description: description.trim(),
                category: selectedCategory,
                formFields: resolvedFormFields,
                hasFormFields: resolvedFormFields.length > 0,
                xfdfData: xfdfData,
                parties: parties.length > 0 ? parties : undefined,
            };

            if (fileToUpload) {
                updateData.file = fileToUpload;
                updateData.fileName = selectedFile?.name || template.fileName;
                updateData.fileType = 'pdf';
            }

            const result = await templateService.updateTemplate(template.id, updateData, currentUser.email);

            if (result.success) {
                console.log('✅ Template updated successfully!', result.template?.id);
                setSnackbar({ open: true, message: result.message || 'Template updated successfully!', severity: 'success' });
                onSuccess?.();

                if (closePendingRef.current) {
                    closePendingRef.current = false;
                    handleClose();
                }

                return true;
            } else {
                setError(result.message);
                return false;
            }
        } catch (err: any) {
            console.error('❌ Error updating template:', err);
            setError('Failed to update template. Please try again.');
            return false;
        } finally {
            setUpdating(false);
        }
    };

    // Handle submit (Update)
    const handleSubmit = async (): Promise<boolean> => {
        setError('');
        setSuccess('');

        const valid = await trigger(['templateName', 'category']);
        if (!valid) return false;

        const currentUser = authService.getCurrentUser();
        if (!currentUser) {
            setError('You must be logged in to update templates');
            return false;
        }

        setUpdating(true);

        try {
            if (pdfViewerRef.current) {
                pdfViewerRef.current.setToolbarGroup('toolbarGroup-View');
                pdfViewerRef.current.setToolMode('Pan');
            }
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log('📤 Starting template update with new architecture (BINARY-SAFE)...');

            let xfdfData: string = '';
            let exportedFormFields: any[] = [];
            let fileToUpload: File | Blob | null = selectedFile;

            if (currentStep === 2 && pdfViewerRef.current) {
                console.log('📦 Exporting data from Viewer...');
                try {
                    const exportResult = await pdfViewerRef.current.exportAnnotations();
                    if (exportResult) {
                        xfdfData = exportResult.xfdfString;
                        console.log(`  ✓ Extracted XFDF (${xfdfData.length} chars)`);
                        if (pdfModified) {
                            console.log('  ⚠️ PDF was modified, using regenerated binary Blob...');
                            fileToUpload = exportResult.blob;
                            console.log(`  ✓ Switched to binary Blob (${fileToUpload.size} bytes)`);
                        } else {
                            console.log('  ✓ PDF not modified.');
                        }
                    }
                } catch (ex) {
                    console.error('Failed to export annotations:', ex);
                    throw new Error('Failed to prepare document for update.');
                }

                try {
                    exportedFormFields = await pdfViewerRef.current.exportFormFields();
                    console.log(`  ✓ Extracted ${exportedFormFields.length} form fields`);

                    if (parties.length > 0) {
                        const partyAssignments = pdfViewerRef.current.getAllFieldPartyAssignments();
                        exportedFormFields = exportedFormFields.map(field => {
                            const assignment = partyAssignments[field.name];
                            if (assignment) {
                                const party = parties.find(p => p.id === assignment.partyId);
                                return {
                                    ...field,
                                    assignedParty: assignment.partyId,
                                    partyLabel: assignment.partyLabel,
                                    partyColor: party?.color || '',
                                };
                            }
                            return field;
                        });
                    }
                } catch (e) {
                    console.warn('Failed to export form fields:', e);
                }
            }

            // Merge profileKey from component state (not stored in PDF/XFDF)
            console.log(`[EDIT-TEMPLATE] MERGE: formFields.length=${formFields.length}, exportedFormFields.length=${exportedFormFields.length}`);
            console.log(`[EDIT-TEMPLATE] MERGE: formFields profileKeys:`, formFields.map((f: any) => `${f.name}=${f.profileKey ?? 'null'}`));
            if (exportedFormFields.length > 0 && formFields.length > 0) {
                exportedFormFields = exportedFormFields.map((ef: any) => {
                    const stateField = formFields.find((sf) => sf.name === ef.name);
                    if (stateField?.profileKey != null) {
                        console.log(`[EDIT-TEMPLATE] MERGE: applying profileKey "${stateField.profileKey}" to field "${ef.name}"`);
                    }
                    return stateField?.profileKey != null
                        ? { ...ef, profileKey: stateField.profileKey }
                        : ef;
                });
            }
            console.log(`[EDIT-TEMPLATE] MERGE result:`, exportedFormFields.map((f: any) => `${f.name}=${f.profileKey ?? 'null'}`));

            // If there are mappable fields, show mapping dialog first
            const mappableCount = exportedFormFields.filter(
                (f: any) => f.type !== 'Sig' && f.type !== 'signature'
            ).length;

            if (mappableCount > 0) {
                pendingExportRef.current = { exportedFormFields, xfdfData, fileToUpload };
                setUpdating(false);
                setShowMappingDialog(true);
                return false;
            }

            return await executeSave(exportedFormFields, xfdfData, fileToUpload);
        } catch (err: any) {
            console.error('❌ Error updating template:', err);
            setError('Failed to update template. Please try again.');
            setUpdating(false);
            return false;
        }
    };

    // Handle close attempt — always show confirmation for edit dialog
    const handleCloseAttempt = () => {
        if (updating) return;
        setShowUnsavedDialog(true);
    };

    const handleUnsavedYes = async () => {
        setShowUnsavedDialog(false);
        closePendingRef.current = true;
        await handleSubmit();
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
        if (!updating) {
            reset();
            setSelectedFile(null);
            setNewCategory('');
            setShowNewCategoryInput(false);
            setError('');
            setSuccess('');
            setParties([]);
            setFormFields([]);
            setSelectedFieldName(null);
            setShowPartyPanel(true);
            setShowPartyConfigDialog(false);
            setShowMappingDialog(false);
            pendingExportRef.current = null;
            closePendingRef.current = false;
            if (selectedFile && documentUrl) {
                console.log('[EditTemplateDialog] handleClose: revoking blob URL from selected file');
                URL.revokeObjectURL(documentUrl);
            }
            if (existingBlobUrl?.startsWith('blob:') && !selectedFile) {
                console.log('[EditTemplateDialog] handleClose: revoking MinIO blob URL');
                URL.revokeObjectURL(existingBlobUrl);
            }
            setDocumentUrl('');
            setExistingBlobUrl(null);
            setDocumentLoaded(false);
            setCurrentStep(1);
            onClose();
        }
    };

    // Dialog Actions
    const step1Actions = (
        <AppButton
            onClick={handleNext}
            variant="contained"
            endIcon={fetchingPdf ? undefined : <ArrowForward />}
            loading={fetchingPdf}
            disabled={!templateName || !selectedCategory || fetchingPdf}
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
                    bgcolor: 'rgba(0, 0, 0, 0.12)',
                    color: 'rgba(0, 0, 0, 0.26)',
                },
            }}
        >
            Next: Edit Form Fields
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
                loading={updating}
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
                {updating ? 'Updating...' : 'Update Template'}
            </AppButton>
        </>
    );

    const dialogActions = currentStep === 1 ? step1Actions : step2Actions;

    return (
        <>
            <BaseDialog
                open={open}
                onClose={handleCloseAttempt}
                title={currentStep === 1 ? "Edit Template - Step 1: Basic Information" : "Edit Template - Step 2: Edit Form Fields"}
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

                        {/* Current File Info */}
                        <Box
                            sx={{
                                bgcolor: (theme: any) => alpha(theme.palette.primary.main, 0.04),
                                border: '1px solid',
                                borderColor: (theme: any) => alpha(theme.palette.primary.main, 0.2),
                                borderRadius: 2,
                                p: 1.5,
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 600,
                                    color: 'text.primary',
                                    mb: 0.5,
                                }}
                            >
                                Current File
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <InsertDriveFileOutlinedIcon
                                    sx={{ fontSize: 16, color: 'primary.main' }}
                                />
                                <Typography
                                    variant="body2"
                                    sx={{ color: 'text.secondary' }}
                                >
                                    {template.fileName}
                                </Typography>
                            </Box>
                        </Box>

                        {/* File Upload Area (Optional) */}
                        <Box>
                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 600,
                                    mb: 0.5,
                                    color: 'text.primary',
                                }}
                            >
                                Replace File <span style={{ color: '#9ca3af' }}>(Optional)</span>
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
                                    onClick={() => document.getElementById('file-edit-input')?.click()}
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
                                        id="file-edit-input"
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
                                        borderColor: 'rgba(0, 0, 0, 0.12)',
                                        borderRadius: 2,
                                        p: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        bgcolor: (theme: any) => alpha(theme.palette.primary.main, 0.04),
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
                                        getOptionLabel={(option) => typeof option === 'string' ? option : (option as Category).name}
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
                                        inputProps={{ maxLength: 20 }}
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

                        {/* Main Content Area */}
                        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* Full-Screen PDF Viewer */}
                            {documentUrl ? (
                                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                    <PDFViewerContainer
                                        ref={pdfViewerRef}
                                        documentUrl={documentUrl}
                                        isReadOnly={false}
                                        canAddFormFields={true}
                                        onDocumentModified={() => {
                                            console.log('📝 Template modified by user (fields added/changed)');
                                            if (!pdfModified) {
                                                setPdfModified(true);
                                            }
                                            // Refresh form fields when document is modified (field added/removed)
                                            refreshFormFields();
                                        }}
                                        initialToolbarGroup="toolbarGroup-Forms"
                                        onDocumentLoaded={() => {
                                            setDocumentLoaded(true);
                                            // Refresh form fields when document loads
                                            setTimeout(refreshFormFields, 500);
                                        }}
                                        onError={(err) => setError(err)}
                                        initialXfdf={selectedFile ? undefined : template.xfdfData}
                                        formFields={selectedFile ? undefined : template.formFields}
                                        parties={parties}
                                        enablePartyAssignment={parties.length > 0}
                                        onFieldChange={handleFieldChange}
                                        onPartyAssigned={(fieldName, partyId, partyLabel) => {
                                            console.log(`[EDIT-TEMPLATE] Field "${fieldName}" assigned to "${partyLabel}"`);
                                            refreshFormFields();
                                        }}
                                        onFieldsWithPartyExported={(fields) => {
                                            console.log(`[EDIT-TEMPLATE] onFieldsWithPartyExported: got ${fields.length} fields from PDF`);
                                            if (fields.length === 0) {
                                                console.log('[EDIT-TEMPLATE] onFieldsWithPartyExported: skipping update (0 fields returned)');
                                                return;
                                            }
                                            setFormFields(prev => {
                                                const prevMap = new Map(prev.map((f: any) => [f.name, f]));
                                                const merged = (fields as FormFieldDefinition[]).map((f: any) => {
                                                    const prevField = prevMap.get(f.name);
                                                    const profileKey = prevField?.profileKey ?? f.profileKey ?? null;
                                                    if (profileKey) console.log(`[EDIT-TEMPLATE] onFieldsWithPartyExported: preserving profileKey "${profileKey}" for field "${f.name}"`);
                                                    return { ...f, profileKey };
                                                });
                                                return merged;
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
                                    onFieldSelected={(fieldName) => setSelectedFieldName(fieldName)}
                                    onHighlightParty={handleHighlightParty}
                                    onConfigureParties={() => setShowPartyConfigDialog(true)}
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
                loading={updating}
            />

            {/* Profile Field Mapping Dialog */}
            <ProfileFieldMappingDialog
                open={showMappingDialog}
                onClose={() => {
                    setShowMappingDialog(false);
                    if (pendingExportRef.current) {
                        const { exportedFormFields, xfdfData, fileToUpload } = pendingExportRef.current;
                        pendingExportRef.current = null;
                        setUpdating(true);
                        executeSave(exportedFormFields, xfdfData, fileToUpload);
                    }
                }}
                onSave={(updatedFields) => {
                    setShowMappingDialog(false);
                    setFormFields(updatedFields);
                    if (pendingExportRef.current) {
                        const { xfdfData, fileToUpload } = pendingExportRef.current;
                        pendingExportRef.current = null;
                        setUpdating(true);
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