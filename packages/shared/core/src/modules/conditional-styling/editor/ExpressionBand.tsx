import { memo } from 'react';
import { ExpressionEditor } from '../../../ui/ExpressionEditor';
import { Band } from '../../../ui/SettingsPanel';

export const ExpressionBand = memo(function ExpressionBand({
  ruleId,
  expression,
  validation,
  columnsProvider,
  onExpressionChange,
}: {
  ruleId: string;
  expression: string;
  validation: { valid: boolean; errors: ReadonlyArray<{ message: string }> };
  columnsProvider: () => Array<{ colId: string; headerName: string }>;
  onExpressionChange: (next: string) => void;
}) {
  return (
    <Band index="01" title="EXPRESSION">
      <div
        style={{
          border: `1px solid var(${!validation.valid ? '--ck-red' : '--ck-border'})`,
          borderRadius: 2,
          background: 'var(--ck-bg)',
          overflow: 'hidden',
        }}
      >
        <ExpressionEditor
          value={expression}
          onChange={onExpressionChange}
          onCommit={onExpressionChange}
          multiline
          lines={3}
          fontSize={12}
          placeholder="[price] > 110"
          columnsProvider={columnsProvider}
          data-testid={`cs-rule-expression-${ruleId}`}
        />
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: 'var(--ck-t3)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        TYPE{' '}
        <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>
          [
        </code>{' '}
        FOR COLUMNS ·{' '}
        <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>
          ⌘↵
        </code>{' '}
        TO SAVE · USE{' '}
        <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>
          data.field
        </code>{' '}
        FOR RAW
      </div>
      {!validation.valid && validation.errors[0]?.message && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--ck-red)',
            background: 'var(--ck-red-bg)',
            border: '1px solid var(--ck-red)',
            borderRadius: 2,
            padding: '6px 8px',
            fontFamily: 'var(--ck-font-mono)',
          }}
        >
          {validation.errors[0].message}
        </div>
      )}
    </Band>
  );
});
