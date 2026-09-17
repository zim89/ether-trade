import { join } from 'path';

export const ACCOUNTS_GRPC = {
  defaultUrl: '0.0.0.0:50052',
  protoRelativePath: 'libs/contracts/proto/accounts.proto',
} as const;

export const ACCOUNTS_PROTO_PATH = join(process.cwd(), ACCOUNTS_GRPC.protoRelativePath);
