import { Metadata } from '@grpc/grpc-js';
import { GRPC_METADATA_KEYS, SERVICE_CALLER_IDS } from '@app/contracts';

/**
 * Creates standard gRPC Metadata for outgoing calls from API Gateway (M2M Soft-Trust).
 * Attaches service identity, optional caller user id, and correlation id.
 */
export function createGatewayGrpcMetadata(correlationId: string, callerUserId?: string): Metadata {
  const metadata = new Metadata();
  metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.apiGateway);
  metadata.set(GRPC_METADATA_KEYS.correlationId, correlationId);
  if (callerUserId) {
    metadata.set(GRPC_METADATA_KEYS.callerId, callerUserId);
  }
  return metadata;
}
