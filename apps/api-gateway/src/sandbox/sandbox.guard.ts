import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES, NodeEnv } from '@app/common/constants';
import { GatewayConfig } from '../config';

/**
 * Guard that strictly restricts sandbox endpoints in production environment.
 */
@Injectable()
export class SandboxGuard implements CanActivate {
  private readonly isProduction: boolean;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
    this.isProduction = config.nodeEnv === NodeEnv.PRODUCTION;
  }

  canActivate(_context: ExecutionContext): boolean {
    if (this.isProduction) {
      throw new ForbiddenException(
        'Sandbox endpoints are strictly disabled in production environment',
      );
    }
    return true;
  }
}
