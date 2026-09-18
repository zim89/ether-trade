import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@app/common/constants';

/**
 * Authenticated user payload attached to the request by JwtAuthGuard.
 */
export interface CurrentUserData {
  userId: string;
  walletAddress: string;
  role: UserRole;
}

/**
 * Parameter decorator that extracts the authenticated user payload from the HTTP request.
 *
 * @example
 * ```typescript
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: CurrentUserData) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentUserData }>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
