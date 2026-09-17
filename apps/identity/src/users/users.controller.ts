import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  type GetUserByIdRequest,
  type GetUserByAddressRequest,
  type UserResponse,
  IDENTITY_SERVICE_NAME,
} from '@app/contracts';
import { User } from '../database/schema/users.schema';
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
