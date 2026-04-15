import React from 'react';

export function FillBarRenderer(params: any) {
  if (!params.data) return null;
  const pct = params.data.quantity > 0
    ? Math.min(100, Math.round((params.data.filled / params.data.quantity) * 100))
    : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 2,
          background: pct >= 100 ? 'var(--bn-green, #2dd4bf)' : pct > 0 ? 'var(--bn-yellow, #f0b90b)' : 'var(--bn-t3, #4a5568)',
          transition: 'width 300ms',
        }} />
      </div>
      <span style={{ fontSize: 9, color: 'var(--bn-t2, #7a8494)', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
