import type { ErrorHandler } from 'hono';
import { FleetwideError } from '@fleetwide/core';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof FleetwideError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
        status: err.status,
        timestamp: Date.now(),
      },
      err.status as 400,
    );
  }

  console.error('Unhandled error:', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
      status: 500,
      timestamp: Date.now(),
    },
    500,
  );
};
