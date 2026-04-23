/**
 * useConnectionTest — hook for testing STOMP connection.
 */

import { useState } from 'react';
import { useToast } from '@marketsui/ui';
import type { StompProviderConfig } from '@marketsui/shared-types';

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface UseConnectionTestReturn {
  testing: boolean;
  testResult: ConnectionTestResult | null;
  testError: string;
  testConnection: () => Promise<void>;
  resetTest: () => void;
}

export function useConnectionTest(config: StompProviderConfig): UseConnectionTestReturn {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testError, setTestError] = useState('');

  const testConnection = async () => {
    setTesting(true);
    setTestError('');
    setTestResult(null);

    if (!config.websocketUrl) {
      setTestError('WebSocket URL is required');
      setTesting(false);
      return;
    }

    try {
      const { StompDataProvider } = await import('../StompDatasourceProvider.js');

      const provider = new StompDataProvider({
        websocketUrl: config.websocketUrl,
        listenerTopic: config.listenerTopic || '',
        requestMessage: config.requestMessage,
        requestBody: config.requestBody,
        snapshotEndToken: config.snapshotEndToken,
        keyColumn: config.keyColumn,
        messageRate: config.messageRate,
        snapshotTimeoutMs: config.snapshotTimeoutMs,
        dataType: config.dataType,
        batchSize: config.batchSize,
      });

      const success = await provider.checkConnection();

      if (success) {
        setTestResult({ success: true });
        toast({ title: 'Connection Successful', description: 'Successfully connected to STOMP server' });
      } else {
        const error = 'Failed to connect to STOMP server';
        setTestError(error);
        setTestResult({ success: false, error });
        toast({ title: 'Connection Failed', description: 'Could not establish connection to STOMP server', variant: 'destructive' });
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
