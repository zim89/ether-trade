import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { UserProfileDto } from './user-profile.dto';

/**
 * Authentication response returned upon successful SIWE verification or token refresh.
 *
 * Notice: The refreshToken is excluded from the response payload and transmitted
 * strictly via HttpOnly, SameSite=Strict, Secure cookies for XSS mitigation.
 */
@Exclude()
export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Short-lived JWT Access Token for Authorization: Bearer <token>',
  })
  @Expose()
  accessToken: string;

  @ApiProperty({
    example: 900,
    description: 'Access token expiration duration in seconds (15 minutes)',
  })
  @Expose()
  expiresIn: number;

  @ApiProperty({
    type: () => UserProfileDto,
    description: 'Authenticated user profile details',
  })
  @Expose()
  @Type(() => UserProfileDto)
  user: UserProfileDto;
}

/**
 * Response payload confirming session revocation.
 */
@Exclude()
export class LogoutResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indicates whether the refresh token session was successfully terminated',
  })
  @Expose()
  success: boolean;
}
