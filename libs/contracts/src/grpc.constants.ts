import { ACCOUNTS_PACKAGE_NAME, ACCOUNTS_SERVICE_NAME } from './generated/accounts.pb';
import { IDENTITY_PACKAGE_NAME, IDENTITY_SERVICE_NAME } from './generated/identity.pb';

/**
 * gRPC protobuf package names sourced directly from generated `*_PACKAGE_NAME` constants.
 * Use these in NestJS microservice / client options.package and transport injection tokens.
 */
export const PROTO_PACKAGES = {
  identity: IDENTITY_PACKAGE_NAME,
  accounts: ACCOUNTS_PACKAGE_NAME,
} as const;

export type ProtoPackageName = (typeof PROTO_PACKAGES)[keyof typeof PROTO_PACKAGES];

/**
 * gRPC protobuf service names sourced directly from generated `*_SERVICE_NAME` constants.
 * Use these as injection tokens for typed service providers.
 */
export const PROTO_SERVICES = {
  identity: IDENTITY_SERVICE_NAME,
  accounts: ACCOUNTS_SERVICE_NAME,
} as const;

export type ProtoServiceName = (typeof PROTO_SERVICES)[keyof typeof PROTO_SERVICES];

/**
 * Consolidated gRPC service configurations (Single Source of Truth).
 * All ports, default URLs, proto paths, and package/service metadata are declared in this single registry.
 */
export const GRPC_SERVICES_CONFIG = {
  identity: {
    key: 'identity',
    port: 50051,
    defaultUrl: '0.0.0.0:50051',
    protoRelativePath: 'libs/contracts/proto/identity.proto',
    packageName: PROTO_PACKAGES.identity,
    serviceName: PROTO_SERVICES.identity,
  },
  accounts: {
    key: 'accounts',
    port: 50052,
    defaultUrl: '0.0.0.0:50052',
    protoRelativePath: 'libs/contracts/proto/accounts.proto',
    packageName: PROTO_PACKAGES.accounts,
    serviceName: PROTO_SERVICES.accounts,
  },
  orders: {
    key: 'orders',
    port: 50053,
    defaultUrl: '0.0.0.0:50053',
    protoRelativePath: 'libs/contracts/proto/orders.proto',
    packageName: 'orders' as ProtoPackageName,
    serviceName: 'OrdersService' as ProtoServiceName,
  },
} as const;

export type GrpcServiceKey = keyof typeof GRPC_SERVICES_CONFIG;

/**
 * Canonical service keys for registered gRPC microservices.
 */
export const GRPC_SERVICE_KEYS = {
  identity: 'identity',
  accounts: 'accounts',
  orders: 'orders',
} as const satisfies Record<GrpcServiceKey, GrpcServiceKey>;

/**
 * Standard gRPC Metadata header keys for East-West inter-service communication (M2M).
 */
export const GRPC_METADATA_KEYS = {
  /** Identifier of the calling service (e.g. 'api-gateway', 'blockchain-worker', 'orders') */
  serviceId: 'x-service-id',
  /** Optional caller user ID when request is executed on behalf of a user */
  callerId: 'x-caller-id',
  /** Distributed tracing correlation ID */
  correlationId: 'x-correlation-id',
} as const;

/**
 * Standard service identifier tokens used in inter-service (M2M) communication.
 */
export const SERVICE_CALLER_IDS = {
  apiGateway: 'api-gateway',
  blockchainWorker: 'blockchain-worker',
  ordersService: 'orders-service',
  identityService: 'identity-service',
  accountsService: 'accounts-service',
} as const;

export type ServiceCallerId = (typeof SERVICE_CALLER_IDS)[keyof typeof SERVICE_CALLER_IDS];
