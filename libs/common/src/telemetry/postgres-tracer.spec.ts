import { trace } from '@opentelemetry/api';
import { createPostgresDebugHook, withPostgresTracing } from './postgres-tracer';

describe('Postgres Tracer', () => {
  it('should create a debug hook that starts and ends a DB span', () => {
    const mockSpan = {
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    const mockTracer = {
      startSpan: jest.fn().mockReturnValue(mockSpan),
    };
    jest.spyOn(trace, 'getTracer').mockReturnValue(mockTracer as never);

    const hook = createPostgresDebugHook({ dbName: 'test_db' });
    hook(1, 'SELECT * FROM users WHERE id = $1', ['user-1'], []);

    expect(mockTracer.startSpan).toHaveBeenCalledWith(
      'db.select test_db',
      expect.objectContaining({
        attributes: expect.objectContaining({
          'db.system.name': 'postgresql',
          'db.namespace': 'test_db',
          'db.operation.name': 'SELECT',
          'db.query.text': 'SELECT * FROM users WHERE id = $1',
        }),
      }),
    );
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should wrap options without throwing', () => {
    const mockOptions = {
      max: 10,
    };

    const enhanced = withPostgresTracing(mockOptions as never, { dbName: 'orders_db' });
    expect(typeof enhanced.debug).toBe('function');

    expect(() => {
      if (typeof enhanced.debug === 'function') {
        enhanced.debug(1, 'INSERT INTO orders ...', [], []);
      }
    }).not.toThrow();
  });
});
