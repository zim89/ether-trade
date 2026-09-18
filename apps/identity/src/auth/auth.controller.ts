import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  type GetNonceRequest,
  type GetNonceResponse,
  type VerifySiweRequest,
  type AuthResponse,
  type RefreshTokensRequest,
  type LogoutRequest,
  type LogoutResponse,
  type SandboxLoginRequest,
  type ValidateTokenRequest,
  type ValidateTokenResponse,
  IDENTITY_SERVICE_NAME,
} from '@app/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'GetNonce')
  async getNonce(data: GetNonceRequest): Promise<GetNonceResponse> {
    return this.authService.getNonce(data.walletAddress);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'VerifySiwe')
  async verifySiwe(data: VerifySiweRequest): Promise<AuthResponse> {
    return this.authService.verifySiwe(data.message, data.signature);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'RefreshTokens')
  async refreshTokens(data: RefreshTokensRequest): Promise<AuthResponse> {
    return this.authService.refreshTokens(data.refreshToken);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'Logout')
  async logout(data: LogoutRequest): Promise<LogoutResponse> {
    const success = await this.authService.logout(data.refreshToken, data.userId);
    return { success };
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'ValidateToken')
  async validateToken(data: ValidateTokenRequest): Promise<ValidateTokenResponse> {
    return this.authService.validateToken(data.token);
  }

  @GrpcMethod(IDENTITY_SERVICE_NAME, 'SandboxLogin')
  async sandboxLogin(data: SandboxLoginRequest): Promise<AuthResponse> {
    return this.authService.sandboxLogin(data.walletAddress, data.role);
  }
}
