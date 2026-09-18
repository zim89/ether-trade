import { BadRequestException, Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { UserRole } from '@app/common/constants';
import {
  type GetUserByIdRequest,
  type GetUserByAddressRequest,
  type UpdateUserRoleRequest,
  type UserResponse,
  IDENTITY_SERVICE_NAME,
} from '@app/contracts';
import { User } from '../database/schema/users.schema';
import { USERS_ERROR_CODES, USERS_ERRORS } from './users.constants';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'GetUserById')
  async getUserById(data: GetUserByIdRequest): Promise<UserResponse> {
    const user = await this.usersService.findById(data.userId);
    return this.mapToUserResponse(user);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'GetUserByAddress')
  async getUserByAddress(data: GetUserByAddressRequest): Promise<UserResponse> {
    const user = await this.usersService.findByAddress(data.walletAddress);
    return this.mapToUserResponse(user);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'UpdateUserRole')
  async updateUserRole(data: UpdateUserRoleRequest): Promise<UserResponse> {
    const role = data.role as UserRole;
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException({
        message: USERS_ERRORS.invalidRole(data.role),
        errorCode: USERS_ERROR_CODES.invalidRole,
      });
    }
    const user = await this.usersService.updateRole(data.userId, role);
    return this.mapToUserResponse(user);
  }

  private mapToUserResponse(user: User): UserResponse {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
      isActive: user.isActive,
      createdAt: Math.floor(user.createdAt.getTime() / 1000),
    };
  }
}
