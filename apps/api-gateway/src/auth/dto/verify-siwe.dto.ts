import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Request payload for verifying a Sign-In with Ethereum (EIP-4361) signature.
 */
export class VerifySiweDto {
  @ApiProperty({
    example:
      'localhost:4000 wants you to sign in with your Ethereum account:\n0x71C849402eBE0e42d7607736636d9333968853bE\n\nSign in to Ether-Trade\n\nURI: http://localhost:4000\nVersion: 1\nChain ID: 1\nNonce: aB3d9F1zK9\nIssued At: 2026-09-17T14:30:00.000Z',
    description: 'Full EIP-4361 plaintext SIWE message',
  })
  @IsString({ message: 'SIWE message must be a valid string.' })
  @IsNotEmpty({ message: 'SIWE message must not be empty.' })
  message: string;

  @ApiProperty({
    example:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
    description: 'Cryptographic ECDSA hex signature (0x...) produced by the wallet',
  })
  @IsString({ message: 'Signature must be a valid string.' })
  @IsNotEmpty({ message: 'Signature must not be empty.' })
  @Matches(/^0x[a-fA-F0-9]{130}$/, {
    message: 'Signature must be a valid 65-byte hex string (0x followed by 130 hex characters).',
  })
  signature: string;
}
