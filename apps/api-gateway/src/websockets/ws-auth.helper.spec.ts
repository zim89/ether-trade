import { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@app/common/constants';
import { extractAndVerifyWsToken } from './ws-auth.helper';

describe('extractAndVerifyWsToken', () => {
  let jwtService: JwtService;
  const jwtSecret = 'test-secret';
  const logger = new Logger('Test');

  beforeEach(() => {
    jwtService = new JwtService();
  });

  it('should authenticate via Sec-WebSocket-Protocol', () => {
    const token = jwtService.sign(
      { sub: 'user-1', walletAddress: '0x123', role: UserRole.TRADER },
      { secret: jwtSecret },
    );
    const req = {
      headers: {
        'sec-websocket-protocol': `access_token, ${token}`,
      },
      url: '/ws',
    } as unknown as IncomingMessage;

    const result = extractAndVerifyWsToken(req, jwtService, jwtSecret, logger);
    expect(result.user).toEqual({
      userId: 'user-1',
      walletAddress: '0x123',
      role: UserRole.TRADER,
    });
    expect(result.selectedSubprotocol).toBe('access_token');
  });

  it('should authenticate via Cookie header', () => {
    const token = jwtService.sign(
      { sub: 'user-2', walletAddress: '0x456', role: UserRole.TRADER },
      { secret: jwtSecret },
    );
    const req = {
      headers: {
        cookie: `foo=bar; accessToken=${token}; other=val`,
      },
      url: '/ws',
    } as unknown as IncomingMessage;

    const result = extractAndVerifyWsToken(req, jwtService, jwtSecret, logger);
    expect(result.user).toEqual({
      userId: 'user-2',
      walletAddress: '0x456',
      role: UserRole.TRADER,
    });
  });

  it('should authenticate via query parameter', () => {
    const token = jwtService.sign(
      { sub: 'user-3', walletAddress: '0x789', role: UserRole.ADMIN },
      { secret: jwtSecret },
    );
    const req = {
      headers: {},
      url: `/ws?token=${token}`,
    } as unknown as IncomingMessage;

    const result = extractAndVerifyWsToken(req, jwtService, jwtSecret, logger);
    expect(result.user).toEqual({
      userId: 'user-3',
      walletAddress: '0x789',
      role: UserRole.ADMIN,
    });
  });

  it('should return null user if token is missing', () => {
    const req = {
      headers: {},
      url: '/ws',
    } as unknown as IncomingMessage;

    const result = extractAndVerifyWsToken(req, jwtService, jwtSecret, logger);
    expect(result.user).toBeNull();
  });

  it('should return null user if token is invalid or expired', () => {
    const req = {
      headers: {
        cookie: 'accessToken=invalid-signature-token',
      },
      url: '/ws',
    } as unknown as IncomingMessage;

    const result = extractAndVerifyWsToken(req, jwtService, jwtSecret, logger);
    expect(result.user).toBeNull();
  });
});
