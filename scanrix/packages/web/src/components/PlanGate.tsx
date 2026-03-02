'use client';
import Link from 'next/link';

interface PlanGateProps {
  plan: string;
  requiredPlan: 'starter' | 'pro' | 'enterprise';
  children: React.ReactNode;
  label?: string;
}

const PLAN_ORDER = ['free', 'starter', 'pro', 'enterprise'];

function planIndex(p: string) {
  return PLAN_ORDER.indexOf(p);
}

/**
 * Wraps content that requires a paid plan.
 * Shows a blurred upgrade overlay when user is on a lower plan.
 */
export function PlanGate({ plan, requiredPlan, children, label }: PlanGateProps) {
  const hasAccess = planIndex(plan) >= planIndex(requiredPlan);

  if (hasAccess) return <>{children}</>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(249,250,251,0.85)',
        borderRadius: 8,
        gap: '0.75rem',
      }}>
        <div style={{ fontSize: '1.5rem' }}>🔒</div>
        <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>
          {label ?? `Requires ${requiredPlan} plan`}
        </p>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
          Upgrade to unlock full evidence, URLs, and remediation steps.
        </p>
        <Link href="/dashboard/upgrade" style={{
          padding: '0.5rem 1.25rem',
          background: '#2563eb', color: '#fff',
          borderRadius: 6, textDecoration: 'none',
          fontWeight: 600, fontSize: '0.875rem',
        }}>
          Upgrade Plan →
        </Link>
      </div>
    </div>
  );
}
