/**
 * Dependency injection interfaces for widget data and actions.
 * These are injected via BlotterProvider, NOT imported directly.
 * This allows the reference app to provide STOMP, REST, or mock implementations.
 */

/**
 * IBlotterDataProvider — interface for streaming data into the grid.
 */
export interface IBlotterDataProvider {
  connect(providerId: string, options?: Record<string, unknown>): void;
  disconnect(): void;
  onSnapshot(handler: (rows: Record<string, unknown>[]) => void): () => void;
  onUpdate(handler: (row: Record<string, unknown>) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  isConnected(): boolean;
}

/**
 * IActionRegistry — interface for registering and executing toolbar actions.
 */
export interface IActionRegistry {
  execute(actionId: string, context: Record<string, unknown>): void;
  getAvailableActions(): Array<{ id: string; label: string; icon?: string }>;
}
