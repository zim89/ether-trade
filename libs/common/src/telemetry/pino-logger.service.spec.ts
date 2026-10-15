import { trace } from '@opentelemetry/api';
import { PinoLoggerService } from './pino-logger.service';

describe('PinoLoggerService', () => {
  let loggerService: PinoLoggerService;

  beforeEach(() => {
    loggerService = new PinoLoggerService({ pretty: false });
  });

  it('should initialize successfully', () => {
    expect(loggerService).toBeDefined();
  });

  it('should format message and log without throwing', () => {
    expect(() => {
      loggerService.log('Test message', 'TestContext');
      loggerService.warn('Warning message');
      loggerService.error('Error message', new Error('Test err').stack, 'TestContext');
      loggerService.debug('Debug message');
      loggerService.verbose('Verbose message');
    }).not.toThrow();
  });

  it('should scrub sensitive data from metadata', () => {
    const pinoInternal = (loggerService as unknown as { pino: { info: jest.Mock } }).pino;
    const infoSpy = jest.spyOn(pinoInternal, 'info');

    loggerService.log('User action', {
      authorization: 'Bearer secret_token',
      password: 'mypassword',
      signature: '0x123abc',
      safeParam: 'public_value',
    });

    expect(infoSpy).toHaveBeenCalled();
    const loggedMeta = infoSpy.mock.calls[0][0];
    expect(loggedMeta.authorization).toBe('[REDACTED]');
    expect(loggedMeta.password).toBe('[REDACTED]');
    expect(loggedMeta.signature).toBe('[REDACTED]');
    expect(loggedMeta.safeParam).toBe('public_value');
  });

  it('should enrich logs with trace_id and span_id if active span exists', () => {
    const pinoInternal = (loggerService as unknown as { pino: { info: jest.Mock } }).pino;
    const infoSpy = jest.spyOn(pinoInternal, 'info');

    const mockSpanContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
    };

    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => mockSpanContext,
    } as never);

    loggerService.log('Traced message');

    expect(infoSpy).toHaveBeenCalled();
    const loggedMeta = infoSpy.mock.calls[0][0];
    expect(loggedMeta.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(loggedMeta.span_id).toBe('00f067aa0ba902b7');
  });
});
