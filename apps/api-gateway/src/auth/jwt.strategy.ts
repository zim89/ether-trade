import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@app/common/constants';
import type { JwtPayload } from '@app/common/types';
import { ENV_KEYS } from '../common/constants';
import type { CurrentUserData } from '../common/decorators';

/**
 * Passport strategy validating signed JWT access tokens locally.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>(ENV_KEYS.jwtSecret),
      algorithms: ['HS256'],
    });
  }

  /**
   * Transforms verified JWT payload into CurrentUserData attached to req.user.
   */
  validate(payload: JwtPayload): CurrentUserData {
    if (!payload || !payload.sub || !payload.walletAddress || !payload.role) {
      throw new UnauthorizedException('Invalid or incomplete token claims');
    }

    if (!Object.values(UserRole).includes(payload.role)) {
      throw new UnauthorizedException('Invalid token role claim');
    }

    return {
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      role: payload.role,
    };
  }
}
