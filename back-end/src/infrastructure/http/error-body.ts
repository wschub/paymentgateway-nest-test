export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
}

export interface ErrorBodyInput {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp?: string;
}

export const buildErrorBody = (input: ErrorBodyInput): ErrorBody => ({
  statusCode: input.statusCode,
  code: input.code,
  message: input.message,
  path: input.path,
  timestamp: input.timestamp ?? new Date().toISOString(),
});
