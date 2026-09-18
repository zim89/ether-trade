import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

/**
 * Request query parameters for generating a single-use SIWE nonce.
 */
export class GetNonceQueryDto {
  @ApiProperty({
    example: '0x71C849402eBE0e42d7607736636d9333968853bE',
    description: 'Ethereum wallet address in hex format (0x...)',
  })
  @IsNotEmpty({ message: 'Wallet address must not be empty.' })
  @IsEthereumAddress({
    message: 'Wallet address must be a valid 20-byte Ethereum hex address (0x...).',
  })
  walletAddress: string;
}

/**
 * Response payload containing the cryptographic nonce and expiration time.
 */
@Exclude()
export class GetNonceResponseDto {
  @ApiProperty({
    example: 'aB3d9F1zK9',
    description: 'Cryptographically secure random nonce string',
  })
  @Expose()
  nonce: string;

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the nonce expires (5-minute TTL)',
  })
  @Expose()
  expiresAt: number;
}
