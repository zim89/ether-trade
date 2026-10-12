import DepositVaultArtifact from './artifacts/deposit-vault.json';
import MockUSDTArtifact from './artifacts/mock-usdt.json';

export const DEPOSIT_VAULT_ABI = DepositVaultArtifact.abi;
export const DEPOSIT_VAULT_BYTECODE = (
  DepositVaultArtifact.bytecode.startsWith('0x')
    ? DepositVaultArtifact.bytecode
    : `0x${DepositVaultArtifact.bytecode}`
) as `0x${string}`;

export const MOCK_USDT_ABI = MockUSDTArtifact.abi;
export const MOCK_USDT_BYTECODE = (
  MockUSDTArtifact.bytecode.startsWith('0x')
    ? MockUSDTArtifact.bytecode
    : `0x${MockUSDTArtifact.bytecode}`
) as `0x${string}`;

export interface DeployedTransfersContracts {
  depositVaultAddress: `0x${string}`;
  mockUsdtAddress: `0x${string}`;
  hotWalletAddress: `0x${string}`;
}
