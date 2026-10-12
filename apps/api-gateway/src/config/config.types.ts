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
}
