import { uuidToBytes16, bytes16ToUuid } from './uuid-converter';

describe('UuidConverter', () => {
  const sampleUuid = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';
  const expectedBytes16 = '0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b';

  describe('uuidToBytes16', () => {
    it('should correctly convert a canonical UUID string to a 0x-prefixed 16-byte hex string', () => {
      const result = uuidToBytes16(sampleUuid);
      expect(result).toBe(expectedBytes16);
    });

    it('should normalize uppercase UUID characters to lowercase hex', () => {
      const uppercaseUuid = sampleUuid.toUpperCase();
      const result = uuidToBytes16(uppercaseUuid);
      expect(result).toBe(expectedBytes16);
    });

    it('should throw an error if input UUID does not have 32 hex characters', () => {
      expect(() => uuidToBytes16('invalid-uuid')).toThrow('Invalid UUID length');
      expect(() => uuidToBytes16('018f3a2b-4c5d-7e8f')).toThrow('Invalid UUID length');
    });
  });

  describe('bytes16ToUuid', () => {
    it('should convert 0x-prefixed 16-byte hex string back to standard UUID format', () => {
      const result = bytes16ToUuid(expectedBytes16);
      expect(result).toBe(sampleUuid);
    });

    it('should support 16-byte hex strings without 0x prefix', () => {
      const noPrefixHex = '018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b';
      const result = bytes16ToUuid(noPrefixHex);
      expect(result).toBe(sampleUuid);
    });

    it('should throw an error if bytes16 does not contain 32 hex characters', () => {
      expect(() => bytes16ToUuid('0x1234')).toThrow('Invalid bytes16 length');
      expect(() => bytes16ToUuid('short')).toThrow('Invalid bytes16 length');
    });
  });

  describe('Bijective round-trip conversion', () => {
    it('should satisfy bytes16ToUuid(uuidToBytes16(uuid)) === uuid', () => {
      const testUuids = [
        '01923456-789a-7bcd-8ef0-123456789abc',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '00000000-0000-0000-0000-000000000000',
      ];

      for (const uuid of testUuids) {
        const bytes16 = uuidToBytes16(uuid);
        const restored = bytes16ToUuid(bytes16);
        expect(restored).toBe(uuid);
      }
    });
  });
});
