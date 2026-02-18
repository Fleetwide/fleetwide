import { Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { FleetwideError } from '@fleetwide/core';

@Catch()
export class FleetwideExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof FleetwideError) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
        status: exception.status,
        timestamp: Date.now(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string }).message ?? exception.message;

      response.status(status).json({
        error: {
          code: 'HTTP_ERROR',
          message,
        },
        status,
        timestamp: Date.now(),
      });
      return;
    }

    console.error('Unhandled error:', exception);
    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
      status: 500,
      timestamp: Date.now(),
    });
  }
}
