/**
 * Converts a standard UUIDv7 string (36 chars with hyphens) to a 16-byte hex string ('0x${string}').
 * Example: '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b' -> '0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b'
 */
export function uuidToBytes16(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID length for bytes16 conversion: ${uuid}`);
  }
  return `0x${hex}`;
}

/**
 * Converts a 16-byte hex string ('0x${string}') back to a canonical UUID format.
 * Example: '0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b' -> '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b'
 */
export function bytes16ToUuid(bytes16: string): string {
  const cleanHex = (bytes16.startsWith('0x') ? bytes16.slice(2) : bytes16).toLowerCase();
  if (cleanHex.length !== 32) {
    throw new Error(`Invalid bytes16 length for UUID conversion: ${bytes16}`);
  }
  return [
    cleanHex.slice(0, 8),
    cleanHex.slice(8, 12),
    cleanHex.slice(12, 16),
    cleanHex.slice(16, 20),
    cleanHex.slice(20, 32),
  ].join('-');
}
