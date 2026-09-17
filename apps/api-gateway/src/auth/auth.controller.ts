import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CONFIG_NAMESPACES, NodeEnv } from '@app/common/constants';
import { COOKIE_NAMES, getRefreshTokenCookieOptions } from '../common/constants';
import { CurrentUser } from '../common/decorators';
import type { CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { GatewayConfig } from '../config';
import { AuthService } from './auth.service';
import { AuthDocs } from './decorators';
import {
  AuthResponseDto,
  GetNonceQueryDto,
  GetNonceResponseDto,
  LogoutResponseDto,
  UserProfileDto,
  VerifySiweDto,
} from './dto';

@AuthDocs.controller()
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
    this.isProduction = config?.nodeEnv === NodeEnv.PRODUCTION;
  }

  @Get('nonce')
  @AuthDocs.getNonce()
  async getNonce(@Query() query: GetNonceQueryDto): Promise<GetNonceResponseDto> {
    return this.authService.getNonce(query);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @AuthDocs.verify()
  async verify(
    @Body() dto: VerifySiweDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.verifySiwe(dto);

    res.cookie(
      COOKIE_NAMES.refreshToken,
      result.refreshToken,
      getRefreshTokenCookieOptions(this.isProduction),
    );

    return result.dto;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @AuthDocs.refresh()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = req.cookies?.[COOKIE_NAMES.refreshToken] as string | undefined;
    const result = await this.authService.refreshTokens(refreshToken);

    res.cookie(
      COOKIE_NAMES.refreshToken,
      result.refreshToken,
      getRefreshTokenCookieOptions(this.isProduction),
    );

    return result.dto;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @AuthDocs.logout()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const refreshToken = req.cookies?.[COOKIE_NAMES.refreshToken] as string | undefined;
    const userId = (req as Request & { user?: CurrentUserData }).user?.userId;

    const result = await this.authService.logout(refreshToken, userId);

    const cookieOptions = getRefreshTokenCookieOptions(this.isProduction);
    res.clearCookie(COOKIE_NAMES.refreshToken, {
      path: cookieOptions.path,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
    });

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AuthDocs.me()
  async getMe(@CurrentUser() user: CurrentUserData): Promise<UserProfileDto> {
    return this.authService.getMe(user.userId);
  }
}
