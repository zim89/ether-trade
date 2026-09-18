/**
 * Canonical structured payload serialized into gRPC `details` JSON
 * and optionally exposed as HTTP `errorCode` on the API Gateway.
 */
export interface ErrorDetailsPayload {
  message: string | string[];
  errorCode?: string;
}

/**
 * Narrows an unknown object to a Nest-style exception response body
 * that may carry an optional machine-readable `errorCode`.
 */
export function extractErrorCode(source: unknown): string | undefined {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  if (!('errorCode' in source)) {
    return undefined;
  }
  const code = (source as { errorCode?: unknown }).errorCode;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/**
 * Builds a JSON string for gRPC `details` from message + optional errorCode.
 */
export function serializeErrorDetails(message: string | string[], errorCode?: string): string {
  const payload: ErrorDetailsPayload = { message };
  if (errorCode) {
    payload.errorCode = errorCode;
  }
  return JSON.stringify(payload);
}

/**
 * Parses gRPC `details` JSON into message and optional errorCode.
 */
export function parseErrorDetails(details: string): ErrorDetailsPayload | null {
  try {
    const parsed = JSON.parse(details) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const body = parsed as { message?: string | string[]; errorCode?: string };
    if (body.message === undefined) {
      return null;
    }
    return {
      message: body.message,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : undefined,
    };
  } catch {
    return null;
  }
}
