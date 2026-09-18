import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that enforces JWT Access Token authentication via passport-jwt.
 * Populates request.user with authenticated user identity upon successful validation.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
