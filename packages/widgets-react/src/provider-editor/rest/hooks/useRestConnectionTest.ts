/**
 * useRestConnectionTest — hook for probing a REST endpoint.
 *
 * Mirrors the STOMP variant: drives a one-shot snapshot fetch via
 * `RestDataProvider.fetchSnapshot` and exposes idle/testing/ok/error
 * state for the diagnostics card. The probe shares the same code path
 * the runtime provider uses, so a green test is meaningful — it proves
 * the URL + auth + rowsPath round-trip works end-to-end.
 */

import { useState } from 'react';
import { useToast } from '@marketsui/ui';
import type { RestProviderConfig } from '@marketsui/shared-types';

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  /** Number of rows the probe extracted. Surfaced in the UI summary. */
  rowCount?: number;
}

export interface UseRestConnectionTestReturn {
  testing: boolean;
  testResult: ConnectionTestResult | null;
  testError: string;
  testConnection: () => Promise<void>;
  resetTest: () => void;
}

export function useRestConnectionTest(config: RestProviderConfig): UseRestConnectionTestReturn {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testError, setTestError] = useState('');

  const testConnection = async () => {
    setTesting(true);
    setTestError('');
    setTestResult(null);

    if (!config.baseUrl || !config.endpoint) {
      const err = 'Base URL and Endpoint are required';
      setTestError(err);
      setTestResult({ success: false, error: err });
      setTesting(false);
      return;
    }

    try {
      const { RestDataProvider } = await import('@marketsui/data-plane');
      const result = await RestDataProvider.fetchSnapshot({
        ...config,
        // configure() requires a keyColumn; use a placeholder if the
        // user hasn't set one yet — they're just probing connectivity.
        keyColumn: config.keyColumn || '__probe__',
      });

      if (result.success) {
        const rowCount = result.data?.length ?? 0;
        setTestResult({ success: true, rowCount });
        toast({
          title: 'Connection Successful',
          description: `Fetched ${rowCount} row(s) from the endpoint`,
        });
      } else {
        const err = result.error || 'Failed to fetch from REST endpoint';
        setTestError(err);
        setTestResult({ success: false, error: err });
        toast({ title: 'Connection Failed', description: err, variant: 'destructive' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setTestError(errorMessage);
      setTestResult({ success: false, error: errorMessage });
      toast({ title: 'Connection Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const resetTest = () => {
    setTesting(false);
    setTestResult(null);
    setTestError('');
  };

  return { testing, testResult, testError, testConnection, resetTest };
}
