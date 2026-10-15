import { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@app/common/constants';
import type { JwtPayload } from '@app/common/types';
import type { CurrentUserData } from '../common/decorators';

/**
 * Extracts and verifies JWT Access Token from WebSocket Handshake HTTP request.
 *
 * Checks in order of priority:
 * 1. Sec-WebSocket-Protocol: 'access_token, <token>' or 'bearer, <token>'
 * 2. Cookie header: 'accessToken=<token>'
 * 3. Query string: '?token=<token>'
 */
export function extractAndVerifyWsToken(
  req: IncomingMessage,
  jwtService: JwtService,
  jwtSecret: string,
  logger = new Logger('WsAuthHelper'),
): { user: CurrentUserData | null; selectedSubprotocol?: string } {
  let token: string | null = null;
  let selectedSubprotocol: string | undefined;

  // 1. Check Sec-WebSocket-Protocol
  const secProtocol = req.headers['sec-websocket-protocol'];
  if (secProtocol && typeof secProtocol === 'string') {
    const protocols = secProtocol.split(',').map((p) => p.trim());
    // Format: "access_token, <token>" or "bearer, <token>"
    if (protocols.length >= 2) {
      const [protoType, candidateToken] = protocols;
      if (
        (protoType.toLowerCase() === 'access_token' || protoType.toLowerCase() === 'bearer') &&
        candidateToken
      ) {
        token = candidateToken;
        selectedSubprotocol = protoType;
      }
    }
  }

  // 2. Check Cookie header if no token found
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const cookie of cookies) {
      const [name, ...valParts] = cookie.trim().split('=');
      if (name === 'accessToken') {
        token = decodeURIComponent(valParts.join('='));
        break;
      }
    }
  }

  // 3. Check Query parameter (?token=...) if no token found
  if (!token && req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const queryToken = url.searchParams.get('token');
      if (queryToken) {
        token = queryToken;
      }
    } catch {
      // Invalid URL format, ignore
    }
  }

  if (!token) {
    return { user: null, selectedSubprotocol };
  }

  try {
    const payload = jwtService.verify<JwtPayload>(token, {
      secret: jwtSecret,
      algorithms: ['HS256'],
    });

    if (!payload?.sub || !payload?.walletAddress || !payload?.role) {
      return { user: null, selectedSubprotocol };
    }

    if (!Object.values(UserRole).includes(payload.role)) {
      return { user: null, selectedSubprotocol };
    }

    const user: CurrentUserData = {
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      role: payload.role,
    };

    return { user, selectedSubprotocol };
  } catch (err: unknown) {
    logger.warn(`WebSocket handshake JWT validation failed: ${(err as Error).message}`);
    return { user: null, selectedSubprotocol };
  }
}
