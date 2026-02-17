/**
 * Common types shared across all Fleetwide packages.
 */

/** Branded ID type for type-safe identifiers */
export type ID = string;

/** Pagination request parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Standard API error response */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  status: number;
  timestamp: number;
}

/** Standard API success response */
export interface SuccessResponse<T = unknown> {
  data: T;
  status: number;
}

/** Timestamp fields present on all persisted entities */
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

/** Health check status */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, unknown>;
}
