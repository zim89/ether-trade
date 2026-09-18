import { Metadata } from '@grpc/grpc-js';
import { ForbiddenException } from '@nestjs/common';
import { GRPC_METADATA_KEYS, type ServiceCallerId } from '@app/contracts';
import { COMMON_ERROR_CODES, COMMON_ERRORS } from '../constants';

/**
 * Authorizes that the calling microservice specified in incoming gRPC metadata (`x-service-id`)
 * belongs to the permitted allowlist of authorized callers (M2M Soft-Trust model).
 *
 * @param metadata - Incoming gRPC request metadata
 * @param allowedCallers - List of authorized service caller IDs
 * @param options - Optional custom message or error code override
 * @returns The verified ServiceCallerId of the calling service
 * @throws ForbiddenException (maps to gRPC PERMISSION_DENIED / HTTP 403) if unauthorized
 */
export function authorizeM2MCaller(
  metadata: Metadata | undefined,
  allowedCallers: readonly ServiceCallerId[],
  options?: { message?: string; errorCode?: string },
): ServiceCallerId {
  const raw = metadata?.get(GRPC_METADATA_KEYS.serviceId)?.[0];
  const serviceId = typeof raw === 'string' ? raw : (raw?.toString() ?? '');

  if (!allowedCallers.includes(serviceId as ServiceCallerId)) {
    throw new ForbiddenException({
      message: options?.message ?? COMMON_ERRORS.grpc.serviceNotAllowed(serviceId),
      errorCode: options?.errorCode ?? COMMON_ERROR_CODES.serviceNotAllowed,
    });
  }

  return serviceId as ServiceCallerId;
}
