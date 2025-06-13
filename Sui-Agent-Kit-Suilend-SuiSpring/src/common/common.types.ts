// Contents of src/common/common.types.ts

// Generic wallet adapter type, can be re-used or extended by protocol-specific action files
// This was already defined in mystenSui.actions.ts, but can be centralized here.
// For now, we'll assume action files import it from mystenSui.actions.ts or define their own needs.

/**
 * Represents a generic pagination structure if needed for API responses.
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string | null;
  hasNextPage: boolean;
}

/**
 * A generic status type for operations.
 */
export type OperationStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

/**
 * Represents a generic error structure for operations.
 */
export interface OperationError {
  message: string;
  code?: string | number;
  details?: any;
}

// Add other common types that might be shared across different protocols or UI components. 