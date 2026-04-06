// ─────────────────────────────────────────────────────────────
//  FI Design System — Showcase Page
//  Visual reference for all tokens, components, and patterns.
// ─────────────────────────────────────────────────────────────

const S = {
  page: {
    height: '100%',
    overflow: 'auto',
    background: 'var(--bn-bg)',
    padding: 32,
    fontFamily: 'var(--fi-sans)',
    color: 'var(--bn-t0)',
  } as React.CSSProperties,
  section: {
    marginBottom: 48,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--bn-t0)',
    marginBottom: 8,
    fontFamily: 'var(--fi-sans)',
  } as React.CSSProperties,
  sectionDesc: {
    fontSize: 11,
    color: 'var(--bn-t2)',
    marginBottom: 20,
    fontFamily: 'var(--fi-sans)',
  } as React.CSSProperties,
  subTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--bn-t1)',
    marginBottom: 12,
    marginTop: 24,
    fontFamily: 'var(--fi-sans)',
  } as React.CSSProperties,
  separator: {
    height: 1,
    background: 'var(--bn-border)',
    margin: '32px 0',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 12,
    alignItems: 'flex-start',
  } as React.CSSProperties,
  swatch: (bg: string) => ({
    width: 80,
    height: 56,
    borderRadius: 3,
    background: bg,
    border: '1px solid var(--bn-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 4,
  }),
  swatchLabel: {
    fontSize: 9,
    color: 'var(--bn-t2)',
    fontFamily: 'var(--fi-mono)',
    textAlign: 'center' as const,
    marginTop: 6,
  } as React.CSSProperties,
  code: {
    fontFamily: 'var(--fi-mono)',
    fontSize: 11,
    background: 'var(--bn-bg2)',
    border: '1px solid var(--bn-border)',
    borderRadius: 3,
    padding: '12px 16px',
    color: 'var(--bn-t0)',
    overflow: 'auto',
    whiteSpace: 'pre' as const,
    lineHeight: 1.6,
    display: 'block',
  } as React.CSSProperties,
};

// ── Helpers ──
function Swatch({ bg, label, hex }: { bg: string; label: string; hex: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={S.swatch(bg)} />
      <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{label}</span>
      <span style={{ fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>{hex}</span>
    </div>
  );
}

function TextSample({ cssVar, label, hex }: { cssVar: string; label: string; hex: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: cssVar, fontFamily: 'var(--fi-sans)', minWidth: 200 }}>
        The quick brown fox jumps over the lazy dog
      </span>
      <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)', minWidth: 80 }}>{label}</span>
      <span style={{ fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>{hex}</span>
    </div>
  );
}

function SpacingBox({ size, label }: { size: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: size, height: size, background: 'var(--bn-cyan)', opacity: 0.3, borderRadius: 2, border: '1px solid var(--bn-cyan)', minWidth: 4, minHeight: 4 }} />
      <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{label}</span>
      <span style={{ fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>{size}px</span>
    </div>
  );
}

function RadiusBox({ r, label }: { r: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 48, height: 48, background: 'var(--bn-bg2)', border: '1px solid var(--bn-border2)', borderRadius: r }} />
      <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{label}</span>
      <span style={{ fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>{r}</span>
    </div>
  );
}

// ── Main Component ──
export function DesignSystemTab() {
  return (
    <div style={S.page}>
      {/* ━━ Header ━━ */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--bn-t0)', margin: 0 }}>FI Design System</h1>
        <p style={{ fontSize: 11, color: 'var(--bn-t2)', marginTop: 4 }}>
          Token reference, component examples, and usage patterns. Dark theme + VS Code Light Modern-style light theme. All values adapt via CSS custom properties.
        </p>
      </div>

      {/* ━━ 1. Color Palette ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>1. Color Palette</h2>
        <p style={S.sectionDesc}>All colors adapt to the active theme via CSS variables. Dark: fi-dark.css · Light (VS Code Light Modern): fi-light.css</p>

        {/* Surface Colors */}
        <h3 style={S.subTitle}>Surface Colors</h3>
        <div style={S.row}>
          <Swatch bg="var(--bn-bg)" label="--bn-bg" hex="D:#0b0e11 L:#f8f8f8" />
          <Swatch bg="var(--bn-bg1)" label="--bn-bg1" hex="D:#161a1e L:#ffffff" />
          <Swatch bg="var(--bn-bg2)" label="--bn-bg2" hex="D:#1e2329 L:#f3f3f3" />
          <Swatch bg="var(--bn-bg3)" label="--bn-bg3" hex="D:#2b3139 L:#e8e8e8" />
        </div>

        {/* Text Colors */}
        <h3 style={S.subTitle}>Text Colors</h3>
        <TextSample cssVar="var(--bn-t0)" label="--bn-t0" hex="D:#eaecef L:#3b3b3b" />
        <TextSample cssVar="var(--bn-t1)" label="--bn-t1" hex="D:#a0a8b4 L:#616161" />
        <TextSample cssVar="var(--bn-t2)" label="--bn-t2" hex="D:#7a8494 L:#767676" />
        <TextSample cssVar="var(--bn-t3)" label="--bn-t3" hex="D:#4a5568 L:#a0a0a0" />

        {/* Semantic Colors */}
        <h3 style={S.subTitle}>Semantic Colors</h3>
        <div style={S.row}>
          <Swatch bg="var(--bn-green)" label="Green (Positive)" hex="D:#2dd4bf L:#0d9488" />
          <Swatch bg="var(--bn-green2)" label="Green Hover" hex="D:#14b8a6 L:#0f766e" />
          <Swatch bg="var(--bn-red)" label="Red (Negative)" hex="D:#f87171 L:#dc2626" />
          <Swatch bg="var(--bn-red2)" label="Red Hover" hex="D:#ef4444 L:#b91c1c" />
          <Swatch bg="var(--bn-yellow)" label="Yellow (Warning)" hex="D:#f0b90b L:#d97706" />
          <Swatch bg="var(--bn-blue)" label="Blue (Info)" hex="D:#3da0ff L:#2563eb" />
          <Swatch bg="var(--bn-cyan)" label="Cyan (Highlight)" hex="D:#22d3ee L:#0891b2" />
          <Swatch bg="#c084fc" label="Purple (Accent)" hex="#c084fc" />
        </div>

        {/* Trading Colors */}
        <h3 style={S.subTitle}>Trading Colors</h3>
        <div style={{ ...S.row, gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button style={{ padding: '6px 24px', borderRadius: 3, background: 'var(--bn-buy-bg)', color: 'var(--bn-cta-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>BUY</button>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>--bn-buy-bg #0d9488</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button style={{ padding: '6px 24px', borderRadius: 3, background: 'var(--bn-sell-bg)', color: 'var(--bn-cta-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>SELL</button>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>--bn-sell-bg #dc2626</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button style={{ padding: '6px 24px', borderRadius: 3, background: 'var(--bn-blue)', color: 'var(--bn-cta-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>SEND RFQ</button>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>--bn-cta-text #ffffff</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-mono)', color: 'var(--bn-green)' }}>+0.32%</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>Positive Change</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-mono)', color: 'var(--bn-red)' }}>-1.07%</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>Negative Change</span>
          </div>
        </div>
      </section>

      <div style={S.separator} />

      {/* ━━ 2. Typography ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>2. Typography</h2>
        <p style={S.sectionDesc}>Two font families, four sizes, four weights. Data-dense by design.</p>

        {/* Font Families */}
        <h3 style={S.subTitle}>Font Families</h3>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--fi-mono)', fontSize: 13, color: 'var(--bn-t0)', marginBottom: 4 }}>
            JetBrains Mono — 0123456789 ABCDEF &nbsp; <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>var(--fi-mono)</span>
          </p>
          <p style={{ fontFamily: 'var(--fi-sans)', fontSize: 13, color: 'var(--bn-t0)' }}>
            Geist Sans — The quick brown fox &nbsp; <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>var(--fi-sans)</span>
          </p>
        </div>

        {/* Font Scale */}
        <h3 style={S.subTitle}>Font Scale</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { size: 9, label: 'xs (9px)', desc: 'Column headers, badges, timestamps, captions' },
            { size: 11, label: 'sm (11px)', desc: 'Body text, table cells, data values (DEFAULT)' },
            { size: 13, label: 'md (13px)', desc: 'Section titles, nav tabs, CTA buttons' },
            { size: 18, label: 'lg (18px)', desc: 'KPI headline numbers' },
          ].map(t => (
            <div key={t.size} style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <span style={{ fontSize: t.size, color: 'var(--bn-t0)', fontFamily: 'var(--fi-mono)', minWidth: 240 }}>
                UST 4.625 06/26 — 100.072
              </span>
              <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)', minWidth: 80 }}>{t.label}</span>
              <span style={{ fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>{t.desc}</span>
            </div>
          ))}
        </div>

        {/* Font Weights */}
        <h3 style={S.subTitle}>Font Weights</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { weight: 400, label: 'Regular (400)' },
            { weight: 500, label: 'Medium (500)' },
            { weight: 600, label: 'Semibold (600)' },
            { weight: 700, label: 'Bold (700)' },
          ].map(w => (
            <div key={w.weight} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13, fontWeight: w.weight, color: 'var(--bn-t0)', fontFamily: 'var(--fi-sans)', minWidth: 240 }}>
                Fixed Income Trading Terminal
              </span>
              <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{w.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={S.separator} />

      {/* ━━ 3. Spacing & Radius ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>3. Spacing & Radius</h2>
        <p style={S.sectionDesc}>Compact spacing for data-dense terminal UI. Radius is intentionally tight.</p>

        <h3 style={S.subTitle}>Spacing Scale</h3>
        <div style={{ ...S.row, gap: 16, alignItems: 'flex-end' }}>
          <SpacingBox size={2} label="0.5" />
          <SpacingBox size={4} label="1" />
          <SpacingBox size={6} label="1.5" />
          <SpacingBox size={8} label="2" />
          <SpacingBox size={10} label="2.5" />
          <SpacingBox size={12} label="3" />
          <SpacingBox size={16} label="4" />
          <SpacingBox size={20} label="5" />
          <SpacingBox size={24} label="6" />
          <SpacingBox size={32} label="8" />
        </div>

        <h3 style={S.subTitle}>Border Radius</h3>
        <div style={{ ...S.row, gap: 20 }}>
          <RadiusBox r="2px" label="sm" />
          <RadiusBox r="3px" label="md" />
          <RadiusBox r="4px" label="lg" />
          <RadiusBox r="6px" label="xl" />
          <RadiusBox r="9999px" label="full" />
        </div>
      </section>

      <div style={S.separator} />

      {/* ━━ 4. Component Examples ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>4. Component Examples</h2>
        <p style={S.sectionDesc}>Interactive element samples using design system tokens.</p>

        {/* Buttons */}
        <h3 style={S.subTitle}>Buttons</h3>
        <div style={{ ...S.row, gap: 12, alignItems: 'center' }}>
          {/* Buy CTA */}
          <button style={{ padding: '8px 32px', borderRadius: 3, background: 'var(--bn-buy-bg)', color: 'var(--bn-cta-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>Buy</button>
          <button style={{ padding: '6px 20px', borderRadius: 3, background: 'var(--bn-buy-bg)', color: 'var(--bn-cta-text)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>Buy SM</button>
          {/* Sell CTA */}
          <button style={{ padding: '8px 32px', borderRadius: 3, background: 'var(--bn-sell-bg)', color: 'var(--bn-cta-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>Sell</button>
          <button style={{ padding: '6px 20px', borderRadius: 3, background: 'var(--bn-sell-bg)', color: 'var(--bn-cta-text)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--fi-sans)', border: 'none', cursor: 'pointer' }}>Sell SM</button>
          {/* Ghost */}
          <button style={{ padding: '8px 24px', borderRadius: 3, background: 'transparent', color: 'var(--bn-t0)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--fi-sans)', border: '1px solid var(--bn-border2)', cursor: 'pointer' }}>Ghost</button>
          <button style={{ padding: '6px 16px', borderRadius: 3, background: 'var(--bn-bg3)', color: 'var(--bn-t0)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--fi-mono)', border: '1px solid var(--bn-border2)', cursor: 'pointer' }}>+ New Order</button>
        </div>

        {/* Inputs */}
        <h3 style={S.subTitle}>Inputs</h3>
        <div style={{ ...S.row, gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>Price Input</span>
            <input
              readOnly
              value="100.072"
              style={{ width: 140, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--fi-mono)', background: 'var(--bn-bg2)', border: '1px solid var(--bn-border2)', borderRadius: 3, color: 'var(--bn-t0)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>Search Input</span>
            <input
              readOnly
              placeholder="Search bonds..."
              style={{ width: 200, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--fi-sans)', background: 'var(--bn-bg2)', border: '1px solid var(--bn-border2)', borderRadius: 3, color: 'var(--bn-t0)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>Quantity</span>
            <input
              readOnly
              value="5,000,000"
              style={{ width: 140, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--fi-mono)', background: 'var(--bn-bg2)', border: '1px solid var(--bn-border2)', borderRadius: 3, color: 'var(--bn-t0)', outline: 'none' }}
            />
          </div>
        </div>

        {/* Status Badges */}
        <h3 style={S.subTitle}>Status Badges</h3>
        <div style={{ ...S.row, gap: 8 }}>
          {[
            { label: 'Filled', bg: 'rgba(45,212,191,0.15)', color: 'var(--bn-green)' },
            { label: 'Partial', bg: 'rgba(240,185,11,0.15)', color: 'var(--bn-yellow)' },
            { label: 'Pending', bg: 'rgba(30,144,255,0.15)', color: 'var(--bn-blue)' },
            { label: 'Cancelled', bg: 'rgba(248,113,113,0.15)', color: 'var(--bn-red)' },
            { label: 'Working', bg: 'rgba(0,188,212,0.15)', color: 'var(--bn-cyan)' },
          ].map(b => (
            <span key={b.label} style={{ fontSize: 9, fontWeight: 600, fontFamily: 'var(--fi-mono)', padding: '3px 8px', borderRadius: 3, background: b.bg, color: b.color, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
              {b.label}
            </span>
          ))}
        </div>

        {/* Quote Type Badges */}
        <h3 style={S.subTitle}>Quote Type Badges (Order Book)</h3>
        <div style={{ ...S.row, gap: 8, alignItems: 'center' }}>
          {[
            { label: 'STREAM', bg: 'rgba(14,203,129,0.12)', color: 'var(--bn-green)', desc: 'Firm / executable' },
            { label: 'RFQ', bg: 'rgba(30,144,255,0.12)', color: 'var(--bn-blue)', desc: 'Request for quote' },
            { label: 'IND', bg: 'rgba(240,185,11,0.12)', color: 'var(--bn-yellow)', desc: 'Indicative only' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, fontWeight: 600, fontFamily: 'var(--fi-mono)', padding: '1px 4px', borderRadius: 2, background: b.bg, color: b.color, letterSpacing: '0.03em' }}>
                {b.label}
              </span>
              <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{b.desc}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <h3 style={S.subTitle}>Nav Tabs</h3>
        <div style={{ display: 'flex', gap: 0, background: 'var(--bn-bg1)', padding: '0 8px', borderRadius: 3, border: '1px solid var(--bn-border)' }}>
          {['Prices', 'Trade', 'Risk', 'Market'].map((t, i) => (
            <div key={t} className={i === 1 ? 'bn-tab active' : 'bn-tab'}
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: i === 1 ? 600 : 400, cursor: 'default' }}>
              {t}
            </div>
          ))}
        </div>

        {/* Panel / Card */}
        <h3 style={S.subTitle}>Panel / Card</h3>
        <div style={{ width: 320, background: 'var(--bn-bg1)', border: '1px solid var(--bn-border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bn-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--bn-t0)' }}>Order Book</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>UST 4.625 06/26</span>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--bn-t2)', marginBottom: 8 }}>
              <span>Price</span><span>Size ($M)</span>
            </div>
            {[
              { price: '100.203', size: '2.5M', color: 'var(--bn-green)', fill: 60 },
              { price: '100.197', size: '5.0M', color: 'var(--bn-green)', fill: 100 },
              { price: '100.075', size: '3.2M', color: 'var(--bn-red)', fill: 64 },
              { price: '100.069', size: '1.8M', color: 'var(--bn-red)', fill: 36 },
            ].map((r, i) => (
              <div key={i} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '3px 6px', marginBottom: 2, borderRadius: 2 }}>
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${r.fill}%`, background: r.color, opacity: 0.08, borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: r.color, fontWeight: 600, position: 'relative' }}>{r.price}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t1)', position: 'relative' }}>{r.size}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={S.separator} />

      {/* ━━ 5. Data Display ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>5. Data Display</h2>
        <p style={S.sectionDesc}>Tables and data grids follow the AG Grid theming. Order book uses fill bars.</p>

        {/* Sample Table */}
        <h3 style={S.subTitle}>Sample Data Table (AG Grid style)</h3>
        <div style={{ width: 640, border: '1px solid var(--bn-border)', borderRadius: 3, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 80px 80px 80px 80px 80px', background: 'var(--bn-bg2)', borderBottom: '1px solid var(--bn-border)' }}>
            {['Security', 'Bid', 'Ask', 'Chg', 'OAS', 'DV01'].map(h => (
              <div key={h} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 600, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' as const, borderRight: '1px solid var(--bn-border)' }}>
                {h}
              </div>
            ))}
          </div>
          {/* Rows */}
          {[
            { sec: 'UST 4.625 06/26', bid: '100.072', ask: '100.197', chg: '+0.12', oas: '+42bp', dv01: '$4,280', chgColor: 'var(--bn-green)' },
            { sec: 'UST 3.875 11/28', bid: '98.340', ask: '98.465', chg: '-0.08', oas: '+58bp', dv01: '$6,120', chgColor: 'var(--bn-red)' },
            { sec: 'AAPL 2.400 08/27', bid: '96.125', ask: '96.310', chg: '+0.05', oas: '+72bp', dv01: '$5,340', chgColor: 'var(--bn-green)' },
            { sec: 'JPM 4.250 10/27', bid: '99.875', ask: '100.010', chg: '-0.15', oas: '+95bp', dv01: '$4,890', chgColor: 'var(--bn-red)' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 80px 80px 80px 80px 80px', borderBottom: '1px solid var(--bn-border)', background: i % 2 === 0 ? 'var(--bn-bg1)' : 'var(--bn-bg)' }}>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-cyan)', fontWeight: 500, borderRight: '1px solid var(--bn-border)' }}>{r.sec}</div>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', borderRight: '1px solid var(--bn-border)' }}>{r.bid}</div>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', borderRight: '1px solid var(--bn-border)' }}>{r.ask}</div>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: r.chgColor, fontWeight: 600, borderRight: '1px solid var(--bn-border)' }}>{r.chg}</div>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', borderRight: '1px solid var(--bn-border)' }}>{r.oas}</div>
              <div style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)' }}>{r.dv01}</div>
            </div>
          ))}
        </div>

        {/* Order Book — Professional FI Layout */}
        <h3 style={S.subTitle}>Order Book — FI Desk (Dealer, Price, Yield, Face, DV01, Type)</h3>
        <div style={{ width: 560, background: 'var(--bn-bg1)', border: '1px solid var(--bn-border)', borderRadius: 3, overflow: 'hidden' }}>
          {/* Instrument context bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderBottom: '1px solid var(--bn-border)', background: 'rgba(0,188,212,0.04)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bn-cyan)', fontFamily: 'var(--fi-mono)' }}>UST 4.625 06/26</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>US Treasury</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>CUSIP 912828ZT0</span>
            <span style={{ fontSize: 9, color: 'var(--bn-t1)', fontFamily: 'var(--fi-mono)' }}>Aaa</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}>
                <span style={{ color: 'var(--bn-t2)' }}>OAS </span><span style={{ color: 'var(--bn-amber)', fontWeight: 600 }}>+8</span>
              </span>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}>
                <span style={{ color: 'var(--bn-t2)' }}>DUR </span><span style={{ color: '#1e90ff', fontWeight: 600 }}>1.85</span>
              </span>
            </div>
          </div>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 70px 70px 52px', padding: '4px 8px', background: 'var(--bn-bg2)' }}>
            {['Dealer', 'Price', 'Yield', 'Face (MM)', 'DV01 ($K)', 'Type'].map((h, i) => (
              <div key={h} style={{ fontSize: 9, fontWeight: 600, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' as const, textAlign: i === 0 ? 'left' : i === 5 ? 'center' : 'right' as const }}>{h}</div>
            ))}
          </div>
          {/* Asks label */}
          <div style={{ padding: '2px 8px', fontSize: 9, fontWeight: 700, color: 'var(--bn-red)', letterSpacing: '0.06em', fontFamily: 'var(--fi-mono)' }}>OFFERS (ASK)</div>
          {/* Ask rows */}
          {[
            { dealer: 'BARC', price: '100.247', yld: '4.496', face: '2.5', dv01: '4.6', type: 'IND' as string, fill: 35 },
            { dealer: 'GS', price: '100.222', yld: '4.504', face: '3.8', dv01: '7.0', type: 'STREAM' as string, fill: 70 },
            { dealer: 'JPM', price: '100.197', yld: '4.512', face: '5.0', dv01: '9.3', type: 'STREAM' as string, fill: 100 },
          ].map((r, i) => (
            <div key={`a${i}`} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '48px 1fr 1fr 70px 70px 52px', padding: '2px 8px' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${r.fill}%`, background: 'var(--ob-ask-fill)' }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t1)', position: 'relative' }}>{r.dealer}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-red)', textAlign: 'right', position: 'relative' }}>{r.price}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', textAlign: 'right', position: 'relative' }}>{r.yld}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', textAlign: 'right', position: 'relative' }}>{r.face}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: '#1e90ff', textAlign: 'right', position: 'relative' }}>{r.dv01}</span>
              <span style={{ textAlign: 'center', position: 'relative' }}>
                <span style={{ fontSize: 8, fontWeight: 600, fontFamily: 'var(--fi-mono)', padding: '1px 4px', borderRadius: 2, letterSpacing: '0.03em', background: r.type === 'STREAM' ? 'rgba(14,203,129,0.12)' : r.type === 'RFQ' ? 'rgba(30,144,255,0.12)' : 'rgba(240,185,11,0.12)', color: r.type === 'STREAM' ? 'var(--bn-green)' : r.type === 'RFQ' ? 'var(--bn-blue)' : 'var(--bn-yellow)' }}>{r.type}</span>
              </span>
            </div>
          ))}
          {/* Spread bar */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderTop: '1px solid var(--bn-border)', borderBottom: '1px solid var(--bn-border)', background: 'linear-gradient(90deg, rgba(14,203,129,0.08), var(--bn-bg2), rgba(246,70,93,0.08))' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bn-green)', fontFamily: 'var(--fi-mono)' }}>100.135</span>
            <span style={{ fontSize: 11, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)', marginLeft: 12 }}>≈ $100.135</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>Spread </span><span style={{ color: 'var(--bn-amber)', fontWeight: 600 }}>0.125</span></span>
              <span style={{ fontSize: 10, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>Mid Yld </span><span style={{ color: '#00bcd4', fontWeight: 600 }}>4.520</span></span>
              <span style={{ fontSize: 10, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>Z-Spd </span><span style={{ color: '#c084fc', fontWeight: 600 }}>8</span></span>
            </div>
          </div>
          {/* Bids label */}
          <div style={{ padding: '2px 8px', fontSize: 9, fontWeight: 700, color: 'var(--bn-green)', letterSpacing: '0.06em', fontFamily: 'var(--fi-mono)' }}>BIDS</div>
          {/* Bid rows */}
          {[
            { dealer: 'MS', price: '100.072', yld: '4.528', face: '4.5', dv01: '8.3', type: 'STREAM' as string, fill: 90 },
            { dealer: 'CITI', price: '100.050', yld: '4.536', face: '2.8', dv01: '5.2', type: 'RFQ' as string, fill: 56 },
            { dealer: 'DB', price: '100.031', yld: '4.544', face: '1.5', dv01: '2.8', type: 'STREAM' as string, fill: 30 },
          ].map((r, i) => (
            <div key={`b${i}`} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '48px 1fr 1fr 70px 70px 52px', padding: '2px 8px' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${r.fill}%`, background: 'var(--ob-bid-fill)' }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t1)', position: 'relative' }}>{r.dealer}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-green)', textAlign: 'right', position: 'relative' }}>{r.price}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', textAlign: 'right', position: 'relative' }}>{r.yld}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: 'var(--bn-t0)', textAlign: 'right', position: 'relative' }}>{r.face}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fi-mono)', color: '#1e90ff', textAlign: 'right', position: 'relative' }}>{r.dv01}</span>
              <span style={{ textAlign: 'center', position: 'relative' }}>
                <span style={{ fontSize: 8, fontWeight: 600, fontFamily: 'var(--fi-mono)', padding: '1px 4px', borderRadius: 2, letterSpacing: '0.03em', background: r.type === 'STREAM' ? 'rgba(14,203,129,0.12)' : r.type === 'RFQ' ? 'rgba(30,144,255,0.12)' : 'rgba(240,185,11,0.12)', color: r.type === 'STREAM' ? 'var(--bn-green)' : r.type === 'RFQ' ? 'var(--bn-blue)' : 'var(--bn-yellow)' }}>{r.type}</span>
              </span>
            </div>
          ))}
          {/* Aggregate footer */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderTop: '1px solid var(--bn-border)', background: 'var(--bn-bg2)' }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>BID DV01 </span><span style={{ color: 'var(--bn-green)', fontWeight: 600 }}>$16.3K</span></span>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>ASK DV01 </span><span style={{ color: 'var(--bn-red)', fontWeight: 600 }}>$20.9K</span></span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>MIN SIZE </span><span style={{ color: 'var(--bn-t1)', fontWeight: 600 }}>1.5MM</span></span>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>FIRM </span><span style={{ color: 'var(--bn-green)', fontWeight: 600 }}>4</span></span>
              <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>SETTLE </span><span style={{ color: 'var(--bn-t1)', fontWeight: 600 }}>T+1</span></span>
            </div>
          </div>
        </div>

        {/* Instrument Context Bar */}
        <h3 style={S.subTitle}>Instrument Context Bar</h3>
        <p style={{ fontSize: 9, color: 'var(--bn-t2)', marginBottom: 8, marginTop: -4 }}>
          Appears atop Order Book and Trade Ticket. Shows bond identity, CUSIP, rating, and live analytics.
        </p>
        <div style={{ width: 560, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', background: 'rgba(0,188,212,0.04)', border: '1px solid var(--bn-border)', borderRadius: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bn-cyan)', fontFamily: 'var(--fi-mono)' }}>AAPL 3.25 02/29</span>
          <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>Apple Inc</span>
          <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>CUSIP 037833DV8</span>
          <span style={{ fontSize: 9, color: 'var(--bn-t1)', fontFamily: 'var(--fi-mono)' }}>Aa1</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>OAS </span><span style={{ color: 'var(--bn-amber)', fontWeight: 600 }}>+65</span></span>
            <span style={{ fontSize: 9, fontFamily: 'var(--fi-mono)' }}><span style={{ color: 'var(--bn-t2)' }}>DUR </span><span style={{ color: '#1e90ff', fontWeight: 600 }}>2.68</span></span>
          </div>
        </div>

        {/* Countdown Ring */}
        <h3 style={S.subTitle}>Countdown Ring (RFQ TTL)</h3>
        <p style={{ fontSize: 9, color: 'var(--bn-t2)', marginBottom: 8, marginTop: -4 }}>
          SVG ring depletes over 30s TTL. Color transitions: blue (safe) → amber (warning &lt;10s) → red (expiring &lt;5s).
        </p>
        <div style={{ ...S.row, gap: 24, alignItems: 'center' }}>
          {[
            { secs: 25, color: '#3da0ff', dash: '69 75.4', label: '25s — blue (safe)' },
            { secs: 8, color: '#f0b90b', dash: '20 75.4', label: '8s — amber (warning)' },
            { secs: 3, color: 'var(--bn-red)', dash: '7.5 75.4', label: '3s — red (expiring)' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="12" fill="none" stroke="var(--bn-bg2)" strokeWidth="2.5" />
                <circle cx="14" cy="14" r="12" fill="none" stroke={r.color} strokeWidth="2.5"
                  strokeDasharray={r.dash} strokeDashoffset="18.85" strokeLinecap="round"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                <text x="14" y="14" textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 9, fontFamily: 'var(--fi-mono)', fontWeight: 600, fill: r.color }}>{r.secs}</text>
              </svg>
              <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'var(--fi-mono)' }}>{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={S.separator} />

      {/* ━━ 6. Cell Renderers ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>6. AG Grid Cell Renderers</h2>
        <p style={S.sectionDesc}>
          Shared vanilla TypeScript cell renderers from design-system/cell-renderers.ts.
          Framework-agnostic — used in both React and Angular apps via ICellRendererComp.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { name: 'SideCellRenderer', desc: 'BUY / SELL with green / red color', example: 'BUY', color: 'var(--bn-green)' },
            { name: 'StatusBadgeRenderer', desc: 'Filled, Partial, Pending, Cancelled', example: 'FILLED', color: 'var(--bn-green)' },
            { name: 'ColoredValueRenderer', desc: 'Positive green, negative red', example: '+0.125', color: 'var(--bn-green)' },
            { name: 'OasValueRenderer', desc: 'OAS with warning threshold >80', example: '+42', color: 'var(--bn-green)' },
            { name: 'SignedValueRenderer', desc: 'Signed spread values', example: '+3.2', color: 'var(--bn-t1)' },
            { name: 'TickerCellRenderer', desc: 'Cyan bold ticker symbol', example: 'UST', color: 'var(--bn-cyan)' },
            { name: 'RatingBadgeRenderer', desc: 'Credit rating badge (Aaa-HY)', example: 'Aa2', color: 'var(--bn-green)' },
            { name: 'PnlValueRenderer', desc: 'P&L with K suffix', example: '+120K', color: 'var(--bn-green)' },
            { name: 'FilledAmountRenderer', desc: 'Green if full, yellow if partial', example: '5000', color: 'var(--bn-yellow)' },
            { name: 'BookNameRenderer', desc: 'Cyan book/desk name', example: 'IG-NYC', color: 'var(--bn-cyan)' },
            { name: 'ChangeValueRenderer', desc: 'Market index change', example: '+0.45', color: 'var(--bn-green)' },
            { name: 'RfqStatusRenderer', desc: 'LIVE / DONE / STALE badge', example: 'LIVE', color: 'var(--bn-blue)' },
          ].map(r => (
            <div key={r.name} style={{ background: 'var(--bn-bg1)', border: '1px solid var(--bn-border)', borderRadius: 3, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--bn-t0)', fontFamily: 'var(--fi-mono)' }}>{r.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.color, fontFamily: 'var(--fi-mono)' }}>{r.example}</span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>{r.desc}</span>
            </div>
          ))}
        </div>

        <h3 style={S.subTitle}>Usage</h3>
        <pre style={S.code}>{`import { SideCellRenderer, StatusBadgeRenderer } from '@/lib/cell-renderers';

const colDefs = [
  { field: 'side',   cellRenderer: SideCellRenderer },
  { field: 'status', cellRenderer: StatusBadgeRenderer },
];`}</pre>
      </section>

      <div style={S.separator} />

      {/* ━━ 7. Usage Guide ━━ */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>7. Usage Guide</h2>
        <p style={S.sectionDesc}>How to consume design system tokens in application code.</p>

        <h3 style={S.subTitle}>CSS Variable Usage</h3>
        <pre style={S.code}>{`/* Surface backgrounds */
background: var(--bn-bg1);
border: 1px solid var(--bn-border);

/* Text hierarchy */
color: var(--bn-t0);   /* primary — body text */
color: var(--bn-t1);   /* secondary — labels */
color: var(--bn-t2);   /* muted — captions, timestamps */
color: var(--bn-t3);   /* faint — disabled, placeholder */

/* Semantic colors */
color: var(--bn-green); /* positive / buy */
color: var(--bn-red);   /* negative / sell */
color: var(--bn-yellow);/* warning */
color: var(--bn-blue);  /* info */
color: var(--bn-cyan);  /* highlight / emphasis */

/* CTA button text (always readable on colored backgrounds) */
color: var(--bn-cta-text); /* use on --bn-buy-bg, --bn-sell-bg, --bn-blue */`}</pre>

        <h3 style={S.subTitle}>AG Grid Theming</h3>
        <pre style={S.code}>{`/* AG Grid picks up CSS variables automatically via ag-theme-quartz-dark.
   Override in your grid wrapper: */
.ag-theme-quartz-dark {
  --ag-background-color: var(--bn-bg1);
  --ag-header-background-color: var(--bn-bg2);
  --ag-row-hover-color: var(--bn-bg2);
  --ag-border-color: var(--bn-border);
  --ag-header-foreground-color: var(--bn-t2);
  --ag-foreground-color: var(--bn-t0);
  --ag-font-family: var(--fi-mono);
  --ag-font-size: 11px;
}`}</pre>

        <h3 style={S.subTitle}>Dark / Light Toggle</h3>
        <pre style={S.code}>{`/* Themes are controlled via data attribute on <html>:
   <html data-theme="dark"> or <html data-theme="light">

   In React, use the ThemeContext: */
import { useTheme } from '@/context/ThemeContext';

function MyComponent() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}`}</pre>

        <h3 style={S.subTitle}>React (shadcn) vs Angular (PrimeNG)</h3>
        <pre style={S.code}>{`/* Both frameworks consume the same CSS variable layer:
   - fi-dark.css / fi-light.css define all --bn-* and --fi-* vars
   - React uses shadcn/ui with HSL overrides (see top of fi-dark.css)
   - Angular uses PrimeNG with the same --bn-* tokens

   The token layer is framework-agnostic. Only the
   component library mappings differ:
     shadcn  -> --background, --foreground, --primary, etc.
     PrimeNG -> --surface-ground, --surface-card, --text-color, etc.

   Both map back to the shared --bn-* primitives. */`}</pre>
      </section>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 9, color: 'var(--bn-t3)', fontFamily: 'var(--fi-mono)' }}>
        FI Design System v1.0 — Tokens generated from design-system/tokens/
      </div>
    </div>
  );
}
