import { NodeEnv } from '@app/common/constants';

export interface GatewayConfig {
  nodeEnv: NodeEnv;
  port: number;
  corsOrigin: string;
  cookieSecret: string;
  jwtSecret: string;
  identityGrpcUrl: string;
  accountsGrpcUrl: string;
  ordersGrpcUrl: string;
  transfersGrpcUrl: string;
  grpcDefaultDeadlineMs: number;
  ordersGrpcDeadlineMs: number;
  wsPort?: number;
  wsPath: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  kafkaBrokers: string;
  kafkaClientId: string;
  appEnv: string;
}
