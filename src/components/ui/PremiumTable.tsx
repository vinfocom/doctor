import React from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
    header: string;
    accessorKey: keyof T | ((item: T) => React.ReactNode);
    className?: string;
}

interface PremiumTableProps<T> {
    columns: Column<T>[];
    data: T[];
    onRowClick?: (item: T) => void;
    className?: string;
}

export function PremiumTable<T>({ columns, data, onRowClick, className }: PremiumTableProps<T>) {
    return (
        <div className={cn("w-full overflow-hidden rounded-xl border border-gray-200 bg-white", className)}>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                            {columns.map((col, index) => (
                                <th
                                    key={index}
                                    className={cn("px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 sm:px-6 sm:py-4", col.className)}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.map((item, rowIndex) => (
                            <tr
                                key={rowIndex}
                                onClick={() => onRowClick && onRowClick(item)}
                                className={cn(
                                    "transition-colors duration-200 hover:bg-indigo-50/50 cursor-default border-l-2 border-transparent hover:border-indigo-500",
                                    onRowClick && "cursor-pointer active:bg-indigo-100/50"
                                )}
                            >
                                {columns.map((col, colIndex) => (
                                    <td key={colIndex} className="px-4 py-3 text-gray-600 sm:px-6 sm:py-4">
                                        {typeof col.accessorKey === 'function'
                                            ? col.accessorKey(item)
                                            : (item[col.accessorKey] as React.ReactNode)
                                        }
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400 sm:px-6">
                                    No data available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
