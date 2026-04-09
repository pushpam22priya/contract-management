'use client';

import { Box, Typography, Tooltip, IconButton, Chip } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Team } from '@/types/team';
import dayjs from 'dayjs';

interface TeamCardProps {
    team: Team;
    contractCount: number;
    onClick: (teamId: string) => void;
    onRename: (team: Team) => void;
}

export default function TeamCard({ team, contractCount, onClick, onRename }: TeamCardProps) {
    return (
        <Box
            onClick={() => onClick(team._id)}
            sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 1,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.08)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '& .team-folder-icon': { color: 'primary.main' },
                '&:hover': {
                    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    borderColor: 'primary.light',
                    '& .team-action-buttons': { opacity: 1 },
                    // '& .team-folder-icon': { color: 'primary.main' },
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                },
                '&:hover::before': { opacity: 1 },
            }}
        >
            {/* Folder icon + title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        bgcolor: 'rgba(15, 118, 110, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background-color 0.3s ease',
                    }}
                >
                    <FolderIcon
                        className="team-folder-icon"
                        sx={{ fontSize: 22, color: 'text.secondary', transition: 'color 0.3s ease' }}
                    />
                </Box>

                <Tooltip title={team.name} arrow placement="top">
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            color: 'text.primary',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {team.name}
                    </Typography>
                </Tooltip>
            </Box>

            {/* Contract count */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Chip
                    label={`${contractCount} ${contractCount === 1 ? 'contract' : 'contracts'}`}
                    size="small"
                    sx={{
                        bgcolor: contractCount > 0 ? 'rgba(15, 118, 110, 0.08)' : 'rgba(0,0,0,0.04)',
                        color: contractCount > 0 ? 'primary.main' : 'text.disabled',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: 22,
                        border: '1px solid',
                        borderColor: contractCount > 0 ? 'rgba(15, 118, 110, 0.2)' : 'transparent',
                        '& .MuiChip-label': { px: 1 },
                    }}
                />
            </Box>

            {/* Created date */}
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                Created {dayjs(team.createdAt).format('DD/MM/YYYY')}
            </Typography>

            {/* Hover action buttons */}
            <Box
                className="team-action-buttons"
                onClick={e => e.stopPropagation()}
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    gap: 1,
                    p: 0.5,
                    background: '#fff',
                    borderRadius: '0 0 12px 12px',
                    opacity: { xs: 1, md: 0 },
                    transition: 'opacity 0.2s ease-in-out',
                }}
            >
                {[
                    {
                        title: 'Open Team',
                        icon: <VisibilityOutlinedIcon sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onClick(team._id),
                    },
                    {
                        title: 'Rename Team',
                        icon: <EditOutlinedIcon sx={{ fontSize: '1.1rem' }} />,
                        onClick: () => onRename(team),
                    },
                ].map((action, idx) => (
                    <Tooltip key={idx} title={action.title} arrow>
                        <IconButton
                            size="small"
                            onClick={action.onClick}
                            sx={{
                                bgcolor: 'transparent',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1.5,
                                color: 'text.primary',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'primary.main',
                                    borderColor: 'primary.main',
                                    color: 'white',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 8px rgba(15, 118, 110, 0.2)',
                                },
                            }}
                        >
                            {action.icon}
                        </IconButton>
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
}
