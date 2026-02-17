import React from 'react';
import { GlassCard } from './GlassCard';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, color = "#4f46e5", onClick }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      <GlassCard className="relative overflow-hidden group border-0 ring-1 ring-gray-900/5 shadow-xl shadow-gray-200/50 bg-white/60 backdrop-blur-xl">
        {/* Ambient Background Glow */}
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-[60px] opacity-20 transition-all duration-700 group-hover:opacity-40 group-hover:scale-150"
          style={{ background: color }}
        />
        <div
          className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-[50px] opacity-10 transition-all duration-700 group-hover:opacity-30"
          style={{ background: color }}
        />

        <div className="flex items-start justify-between relative z-10">
          <div>
            <h3 className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 opacity-80">{title}</h3>
            <div className="text-4xl font-extrabold text-gray-900 tracking-tight flex items-baseline gap-1">
              {value}
              {trend && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${trendUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} font-bold ml-2`}>
                  {trend}
                </span>
              )}
            </div>
          </div>
          <div
            className="p-3.5 rounded-2xl shadow-sm transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110"
            style={{ background: `linear-gradient(135deg, ${color}20, ${color}10)` }}
          >
            <Icon className="w-7 h-7" style={{ color }} />
          </div>
        </div>

        {/* Decorative bottom bar */}
        <div
          className="absolute bottom-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      </GlassCard>
    </motion.div>
  );
}
