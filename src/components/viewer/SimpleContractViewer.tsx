'use client';

import { Box, Typography, Paper } from '@mui/material';

interface SimpleContractViewerProps {
    content: string;
    title: string;
}

export default function SimpleContractViewer({ content, title }: SimpleContractViewerProps) {
    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                bgcolor: '#f5f5f5',
                p: 4,
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    maxWidth: '850px',
                    margin: '0 auto',
                    bgcolor: 'white',
                    p: 6,
                    minHeight: '500px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                }}
            >
                {/* Document Title */}
                <Typography
                    variant="h4"
                    sx={{
                        textAlign: 'center',
                        fontWeight: 700,
                        mb: 4,
                        pb: 2,
                        borderBottom: '3px solid',
                        borderColor: 'primary.main',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'primary.main',
                    }}
                >
                    {title}
                </Typography>
                
                {/* Document Content */}
                <Box
                    sx={{
                        fontFamily: '"Times New Roman", Times, serif',
                        lineHeight: 2,
                        fontSize: '1.05rem',
                        whiteSpace: 'pre-wrap',
                        color: 'text.primary',
                        textAlign: 'justify',
                    }}
                >
                    {content}
                </Box>
            </Paper>
        </Box>
    );
}