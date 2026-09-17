import { join } from 'path';
import { GRPC_SERVICES_CONFIG, type GrpcServiceKey } from './grpc.constants';

/**
 * Resolves an absolute filesystem path to a proto file from monorepo root.
 */
export function resolveProtoPath(protoRelativePath: string): string {
  return join(process.cwd(), protoRelativePath);
}

/**
 * Helper to get the absolute filesystem proto path for a given microservice.
 */
export function getServiceProtoPath(service: GrpcServiceKey): string {
  return resolveProtoPath(GRPC_SERVICES_CONFIG[service].protoRelativePath);
}
