import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
    isLoading?: boolean;
    icon?: React.ElementType;
}

export function PremiumButton({
    children,
    className,
    variant = 'primary',
    isLoading,
    icon: Icon,
    disabled,
    ...props
}: PremiumButtonProps) {

    const variants = {
        primary: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 border-none",
        secondary: "bg-white/5 text-indigo-300 border border-indigo-500/20 hover:bg-white/10 hover:border-indigo-500/40 hover:text-white shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:shadow-[0_0_25px_rgba(99,102,241,0.2)]",
        danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.1)]",
        success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
        ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-white/5",
    };

    return (
        <button
            className={cn(
                "relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
                variants[variant],
                className
            )}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {!isLoading && Icon && <Icon className="w-4 h-4" />}
            {children}
        </button>
    );
}
