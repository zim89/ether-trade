import { join } from 'path';

export const IDENTITY_GRPC = {
  defaultUrl: '0.0.0.0:50051',
  protoRelativePath: 'libs/contracts/proto/identity.proto',
} as const;

export const IDENTITY_PROTO_PATH = join(process.cwd(), IDENTITY_GRPC.protoRelativePath);
