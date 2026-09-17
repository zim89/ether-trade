export const USERS_ERRORS = {
  invalidWalletAddress: (address: string) => `Invalid EVM wallet address: ${address}`,
  userNotFoundById: (id: string) => `User with ID '${id}' not found`,
  userNotFoundByAddress: (address: string) => `User with wallet address '${address}' not found`,
  userCreateFailed: (address: string) => `Failed to create or find user for address: ${address}`,
} as const;

/**
 * Diagnostic log messages for the users module.
 */
export const USERS_LOGS = {
  userRegistered: (address: string, id: string) => `New user registered: ${address} (ID: ${id})`,
} as const;
