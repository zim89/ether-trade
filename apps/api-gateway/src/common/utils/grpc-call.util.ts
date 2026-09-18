import { firstValueFrom, timeout, type Observable } from 'rxjs';

/**
 * Executes a unary gRPC Observable call with an RxJS client-side deadline.
 *
 * ts-proto NestJS clients do not expose CallOptions.deadline; use this wrapper instead.
 *
 * @param source$ - gRPC method Observable
 * @param deadlineMs - Timeout in milliseconds from config
 */
export async function grpcUnaryCall<T>(source$: Observable<T>, deadlineMs: number): Promise<T> {
  return firstValueFrom(source$.pipe(timeout(deadlineMs)));
}
