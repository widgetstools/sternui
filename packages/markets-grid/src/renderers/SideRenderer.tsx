import React from 'react';

export function SideRenderer(params: any) {
  if (!params.value) return null;
  const isBuy = params.value === 'BUY';
  return (
    <span style={{
      color: isBuy ? 'var(--bn-green, #2dd4bf)' : 'var(--bn-red, #f87171)',
      fontWeight: 600,
      fontSize: 9,
      letterSpacing: '0.04em',
    }}>
      {params.value}
    </span>
  );
}
