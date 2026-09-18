import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { UserRole } from '@app/common/constants';

/**
 * Public user profile data.
 * Adheres to Whitelist serialization policy (@Exclude on class, @Expose on safe fields).
 */
@Exclude()
export class UserProfileDto {
  @ApiProperty({
    example: '01923e52-6d2c-7b00-845b-7b0011223344',
    description: 'Unique user UUID identifier (UUIDv7)',
  })
  @Expose()
  id: string;

  @ApiProperty({
    example: '0x71C849402eBE0e42d7607736636d9333968853bE',
    description: 'Checksummed Ethereum wallet address (EIP-55)',
  })
  @Expose()
  walletAddress: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.TRADER,
    description: 'User access role',
  })
  @Expose()
  role: UserRole;

  @ApiProperty({
    example: true,
    description: 'Whether the user account is active and permitted to trade',
  })
  @Expose()
  isActive: boolean;

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the user was registered',
  })
  @Expose()
  createdAt: number;
}
