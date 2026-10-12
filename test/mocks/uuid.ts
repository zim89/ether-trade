import * as crypto from 'crypto';

export const v7 = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';
};

export const v4 = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';
};

export default { v7, v4 };
