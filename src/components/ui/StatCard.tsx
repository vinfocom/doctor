import React from 'react';
import { GlassCard } from './GlassCard';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: string;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, color = "#4f46e5" }: StatCardProps) {
  return (
    <GlassCard className="relative overflow-hidden group">
      <div
        className="absolute top-0 right-0 w-32 h-32 opacity-5 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-10"
        style={{ background: color }}
      />

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
        </div>
        <div
          className="p-3 rounded-xl border border-gray-100 shadow-sm"
          style={{ background: `${color}10` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
      </div>

      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${trendUp ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {trend}
          </span>
          <span className="text-gray-400 text-xs">vs last month</span>
        </div>
      )}
    </GlassCard>
  );
}
