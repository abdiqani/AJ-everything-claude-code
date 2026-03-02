import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string }>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        message = Array.isArray(r['message'])
          ? (r['message'] as string[]).join('; ')
          : String(r['message'] ?? message);
        error = String(r['error'] ?? '');
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    const body: ErrorBody = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    reply.status(statusCode).send(body);
  }
}
