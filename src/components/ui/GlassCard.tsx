import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    hoverEffect?: boolean;
}

export function GlassCard({ children, className, hoverEffect = true }: GlassCardProps) {
    return (
        <div
            className={cn(
                "glass-card p-6 border border-gray-200 bg-white backdrop-blur-xl rounded-2xl shadow-sm",
                hoverEffect && "hover:border-indigo-200 hover:shadow-md transition-all duration-300 hover:-translate-y-1",
                className
            )}
        >
            {children}
        </div>
    );
}
