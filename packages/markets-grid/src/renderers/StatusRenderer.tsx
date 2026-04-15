import React from 'react';

const COLORS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: 'rgba(61,160,255,0.12)', text: '#3da0ff' },
  PARTIAL: { bg: 'rgba(240,185,11,0.12)', text: '#f0b90b' },
  FILLED: { bg: 'rgba(45,212,191,0.12)', text: '#2dd4bf' },
  CANCELLED: { bg: 'rgba(248,113,113,0.10)', text: '#f87171' },
};

export function StatusRenderer(params: any) {
  if (!params.value) return null;
  const c = COLORS[params.value] ?? COLORS.OPEN;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 2,
      fontSize: 9, fontWeight: 500, letterSpacing: '0.03em',
      background: c.bg, color: c.text,
    }}>
      {params.value}
    </span>
  );
}
