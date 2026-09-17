import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators';
import type { CurrentUserData } from '../decorators';

/**
 * Guard that enforces Role-Based Access Control (RBAC) based on metadata from @Roles(...).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserData }>();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: unauthenticated user');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: required role (${requiredRoles.join(', ')}), but current role is (${user.role})`,
      );
    }

    return true;
  }
}
