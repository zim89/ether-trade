import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CONFIG_NAMESPACES, NodeEnv } from '@app/common/constants';
import { AuthResponseDto, UserProfileDto } from '../auth/dto';
import { BalanceResponseDto } from '../balances/dto';
import { COOKIE_NAMES, getRefreshTokenCookieOptions } from '../common/constants';
import { CurrentUser, type CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { GatewayConfig } from '../config';
import { FaucetDto, PromoteToAdminDto, SandboxLoginDto } from './dto';
import { SandboxGuard } from './sandbox.guard';
import { SandboxService } from './sandbox.service';
import { SandboxDocs } from './sandbox.swagger';

/**
 * Controller exposing sandbox features for test environments.
 * Protected by SandboxGuard to prevent any execution in production.
 */
@SandboxDocs.controller()
@Controller('sandbox')
@UseGuards(SandboxGuard)
export class SandboxController {
  private readonly isProduction: boolean;

  constructor(
    private readonly sandboxService: SandboxService,
    configService: ConfigService,
  ) {
    const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
    this.isProduction = config?.nodeEnv === NodeEnv.PRODUCTION;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SandboxDocs.login()
  async login(
    @Body() dto: SandboxLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.sandboxService.login(dto);

    res.cookie(
      COOKIE_NAMES.refreshToken,
      result.refreshToken,
      getRefreshTokenCookieOptions(this.isProduction),
    );

    return result.dto;
  }

  @Post('faucet')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SandboxDocs.faucet()
  async fundFaucet(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: FaucetDto,
  ): Promise<BalanceResponseDto> {
    return this.sandboxService.fundFaucet(user.userId, dto);
  }

  @Post('promote-to-admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @SandboxDocs.promoteToAdmin()
  async promoteToAdmin(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: PromoteToAdminDto,
  ): Promise<UserProfileDto> {
    return this.sandboxService.promoteToAdmin(user.userId, dto);
  }
}
