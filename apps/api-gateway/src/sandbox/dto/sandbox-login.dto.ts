import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsEthereumAddress, IsOptional } from 'class-validator';
import { UserRole } from '@app/common/constants';

/**
 * Request body for developer sandbox login.
 * Enables instant authentication in Postman/Swagger without cryptographic SIWE signing.
 */
export class SandboxLoginDto {
  @ApiPropertyOptional({
    example: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    description: 'EVM wallet address to authenticate (defaults to Hardhat Account #0 if omitted)',
  })
  @IsOptional()
  @IsEthereumAddress({ message: 'walletAddress must be a valid Ethereum address (0x...).' })
  walletAddress?: string;

  @ApiPropertyOptional({
    example: UserRole.TRADER,
    enum: UserRole,
    description: 'Initial or updated user role (defaults to TRADER if omitted)',
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role must be a valid UserRole (TRADER or ADMIN).' })
  role?: UserRole;
}
