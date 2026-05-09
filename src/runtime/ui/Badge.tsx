import * as React from 'react'

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'info' | 'success' | 'warn' | 'error' | 'neutral'
}

const variants = {
  info: 'bg-sky-100 text-sky-800',
  success: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  error: 'bg-rose-100 text-rose-800',
  neutral: 'bg-slate-100 text-slate-700',
}

export function Badge({ variant = 'neutral', className = '', ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
      {...rest}
    />
  )
}
