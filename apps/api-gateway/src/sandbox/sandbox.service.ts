import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v7 as uuidv7 } from 'uuid';
import { CONFIG_NAMESPACES, DEFAULT_CURRENCY, UserRole } from '@app/common/constants';
import {
  type AccountsServiceClient,
  type IdentityServiceClient,
  PROTO_SERVICES,
} from '@app/contracts';
import { AuthResult } from '../auth/auth.service';
import { UserProfileDto } from '../auth/dto';
import { BalanceResponseDto } from '../balances/dto';
import { createGatewayGrpcMetadata } from '../common/constants/grpc.constants';
import { getCorrelationId } from '../common/utils/correlation-context';
import { grpcUnaryCall } from '../common/utils/grpc-call.util';
import type { GatewayConfig } from '../config/config.types';
import { FaucetDto, PromoteToAdminDto, SandboxLoginDto } from './dto';

/**
 * Service managing sandbox operations (faucet funding, role promotions).
 */
@Injectable()
export class SandboxService {
  private readonly grpcDeadlineMs: number;

  constructor(
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsGrpcClient: AccountsServiceClient,
    @Inject(PROTO_SERVICES.identity)
    private readonly identityGrpcClient: IdentityServiceClient,
    private readonly configService: ConfigService,
  ) {
    this.grpcDeadlineMs =
      this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.grpcDefaultDeadlineMs ??
      5000;
  }

  private metadata(callerUserId?: string) {
    return createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', callerUserId);
  }

  /**
   * Deposits virtual sandbox funds into user account balance.
   */
  async fundFaucet(currentUserId: string, dto: FaucetDto): Promise<BalanceResponseDto> {
    const targetUserId = dto.userId || currentUserId;
    const currency = dto.currency || DEFAULT_CURRENCY;
    const idempotencyKey = dto.idempotencyKey || uuidv7();

    const response = await grpcUnaryCall(
      this.accountsGrpcClient.depositSandboxFunds(
        {
          userId: targetUserId,
          amount: dto.amount,
          currency,
          idempotencyKey,
        },
        this.metadata(currentUserId),
      ),
      this.grpcDeadlineMs,
    );

    const b = response.balance;
    return {
      accountId: b?.accountId ?? '',
      userId: b?.userId ?? '',
      currency: b?.currency ?? '',
      availableBalance: b?.availableBalance ?? '0',
      lockedBalance: b?.lockedBalance ?? '0',
      totalBalance: b?.totalBalance ?? '0',
      updatedAt: Number(b?.updatedAt ?? 0),
    };
  }

  /**
   * Promotes user role to administrator in sandbox/development environment.
   */
  async promoteToAdmin(currentUserId: string, dto: PromoteToAdminDto): Promise<UserProfileDto> {
    const targetUserId = dto.userId || currentUserId;

    const response = await grpcUnaryCall(
      this.identityGrpcClient.updateUserRole(
        {
          userId: targetUserId,
          role: UserRole.ADMIN,
        },
        this.metadata(currentUserId),
      ),
      this.grpcDeadlineMs,
    );

    return {
      id: response.user?.id ?? '',
      walletAddress: response.user?.walletAddress ?? '',
      role: (response.user?.role as UserRole) ?? UserRole.ADMIN,
      isActive: response.user?.isActive ?? true,
      createdAt: Number(response.user?.createdAt ?? 0),
    };
  }

  /**
   * Authenticates test user instantly without cryptographic SIWE signing.
   * Strictly active in development and test environments.
   */
  async login(dto: SandboxLoginDto): Promise<AuthResult> {
    const DEFAULT_DEV_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const walletAddress = dto.walletAddress || DEFAULT_DEV_WALLET;

    const response = await grpcUnaryCall(
      this.identityGrpcClient.sandboxLogin(
        {
          walletAddress,
          role: dto.role || '',
        },
        this.metadata(),
      ),
      this.grpcDeadlineMs,
    );

    return {
      dto: {
        accessToken: response.accessToken,
        expiresIn: Number(response.expiresIn),
        user: {
          id: response.user?.id || '',
          walletAddress: response.user?.walletAddress || walletAddress,
          role: (response.user?.role as UserRole) || UserRole.TRADER,
          isActive: response.user?.isActive ?? true,
          createdAt: Number(response.user?.createdAt || 0),
        },
      },
      refreshToken: response.refreshToken,
    };
  }
}
