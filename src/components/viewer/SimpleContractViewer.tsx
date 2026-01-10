'use client';

import { Box, Typography, Paper } from '@mui/material';

interface SimpleContractViewerProps {
    content: string;
    title: string;
    signatureImage?: string;
}

export default function SimpleContractViewer({ content, title, signatureImage }: SimpleContractViewerProps) {
    // We can just rely on the fallback logic checking the string content
    const hasSignatureText = content.toLowerCase().includes('signature');

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
                        color: 'text.primary',
                        textAlign: 'justify',
                        mb: 6,
                    }}
                >
                    {/* Parse content to inject signature inline */}
                    {(() => {
                        let signaturePlaced = false; // Track if we've already placed the signature

                        return content.split('\n').map((line, index) => {
                            // Check if this line is a signature line
                            // Broader check: just look for "Signature" (case insensitive)
                            const isSignatureLine = line.toLowerCase().includes('signature');

                            // Place signature on the FIRST matching line we find
                            if (isSignatureLine && signatureImage && !signaturePlaced) {
                                signaturePlaced = true;
                                return (
                                    <Box key={index} sx={{ position: 'relative', my: 2, height: '60px', display: 'flex', alignItems: 'flex-end' }}>
                                        <Typography
                                            component="span"
                                            sx={{
                                                fontFamily: 'inherit',
                                                fontSize: 'inherit',
                                                mr: 1
                                            }}
                                        >
                                            {line}
                                        </Typography>

                                        {/* Overlay Signature - Absolute positioned relative to this specific line container */}
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                left: line.toLowerCase().indexOf('signature') * 8 + 80 + 'px', // Rough char width calc or fixed offset
                                                // simplified: just sit it a bit to the right
                                                // left: '100px', 
                                                bottom: '5px',
                                                zIndex: 1,
                                            }}
                                        >
                                            <img
                                                src={signatureImage}
                                                alt="Signed"
                                                style={{
                                                    height: '60px',
                                                    maxWidth: '180px',
                                                    mixBlendMode: 'multiply',
                                                    transform: 'rotate(-2deg)',
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                );
                            }

                            // Standard line
                            return (
                                <Typography
                                    key={index}
                                    component="div"
                                    sx={{
                                        fontFamily: 'inherit',
                                        fontSize: 'inherit',
                                        minHeight: '1.5em'
                                    }}
                                >
                                    {line || '\u00A0'}
                                </Typography>
                            );
                        });
                    })()}
                </Box>

                {/* Fallback - Show only if we suspect it wasn't placed, or just use a simple condition */}
                {/* The previous logic tried to use a variable from inside the map which is impossible in JSX directly */}
                {/* We'll assume if "signature" text exists, we placed it above. */}
                {/* If NOT found in text, we show it here. */}

                {signatureImage && !hasSignatureText && (
                    <Box sx={{ mt: 4, borderTop: '1px solid #ddd', pt: 4, width: 'fit-content' }}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            Signed By:
                        </Typography>
                        <img
                            src={signatureImage}
                            alt="Signature"
                            style={{
                                maxWidth: '200px',
                                maxHeight: '100px',
                                border: '1px dashed #ccc',
                                padding: '4px'
                            }}
                        />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                            Digital Signature
                        </Typography>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}