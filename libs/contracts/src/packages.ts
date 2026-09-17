import { ACCOUNTS_PACKAGE_NAME } from './generated/accounts.pb';
import { IDENTITY_PACKAGE_NAME } from './generated/identity.pb';

/**
 * gRPC protobuf package names sourced from generated `*_PACKAGE_NAME` constants.
 * Use these in NestJS microservice / client `options.package` instead of string literals.
 */
export const PROTO_PACKAGES = {
  identity: IDENTITY_PACKAGE_NAME,
  accounts: ACCOUNTS_PACKAGE_NAME,
} as const;

export type ProtoPackageName = (typeof PROTO_PACKAGES)[keyof typeof PROTO_PACKAGES];
