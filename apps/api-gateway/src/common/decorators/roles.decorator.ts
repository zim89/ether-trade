import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@app/common/constants';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles permitted to access a controller or handler method.
 *
 * @example
 * ```typescript
 * @Roles(UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Post('promote-to-admin')
 * promote() {}
 * ```
 */
export const Roles = (...roles: (UserRole | string)[]) => SetMetadata(ROLES_KEY, roles);
