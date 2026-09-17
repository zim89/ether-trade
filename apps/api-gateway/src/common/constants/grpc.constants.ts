import { Metadata } from '@grpc/grpc-js';
import { GRPC_METADATA_KEYS, SERVICE_CALLER_IDS } from '@app/contracts';

/**
 * Creates standard gRPC Metadata for outgoing calls from API Gateway (M2M groundwork).
 * Attaches service identity and optional caller user identity.
 */
export function createGatewayGrpcMetadata(callerUserId?: string): Metadata {
  const metadata = new Metadata();
  metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.apiGateway);
  if (callerUserId) {
    metadata.set(GRPC_METADATA_KEYS.callerId, callerUserId);
  }
  return metadata;
}
