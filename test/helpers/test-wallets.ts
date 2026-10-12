/**
 * @file test-wallets.ts
 * @description Standard Anvil genesis test accounts and private keys.
 */

export interface TestWallet {
  index: number;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

/**
 * Standard default accounts funded by Anvil on genesis (10,000 ETH each).
 */
export const ANVIL_TEST_WALLETS = {
  /**
   * Account #0: Deployer & System Hot Wallet
   */
  deployer: {
    index: 0,
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  } as TestWallet,

  /**
   * Account #1: Primary test trader (Alice)
   */
  traderAlice: {
    index: 1,
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  } as TestWallet,

  /**
   * Account #2: Secondary test trader (Bob)
   */
  traderBob: {
    index: 2,
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb2f958080a12f9f2a84157695c074e2a7836b0',
  } as TestWallet,

  /**
   * Account #3: Counterparty or third test user (Charlie)
   */
  traderCharlie: {
    index: 3,
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  } as TestWallet,
} as const;
