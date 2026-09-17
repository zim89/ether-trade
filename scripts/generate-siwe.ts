import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

/**
 * Hardhat/Anvil Test Account #0
 * Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

async function main() {
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);
  const walletAddress = account.address;

  // 1. Get nonce from CLI arg or fetch from API Gateway
  let nonce = process.argv[2];

  if (!nonce) {
    try {
      const res = await fetch(
        `http://localhost:4000/api/v1/auth/nonce?walletAddress=${walletAddress}`,
      );
      const data = (await res.json()) as { nonce: string };
      nonce = data.nonce;
      console.log(`Fetched fresh nonce from API Gateway: ${nonce}`);
    } catch {
      console.error('Failed to fetch nonce from API Gateway. Please pass nonce as argument:');
      console.error('  pnpm tsx scripts/generate-siwe.ts <nonce>');
      process.exit(1);
    }
  }

  // 2. Create EIP-4361 standard SIWE message
  const message = createSiweMessage({
    domain: 'localhost:4000',
    address: walletAddress,
    statement: 'Sign in to Ether-Trade',
    uri: 'http://localhost:4000',
    version: '1',
    chainId: 1,
    nonce,
    issuedAt: new Date(),
  });

  // 3. Cryptographically sign message with private key
  const signature = await account.signMessage({ message });

  const payload = {
    message,
    signature,
  };

  console.log('\n--- Payload for Postman "2. Verify SIWE" (raw JSON body) ---\n');
  console.log(JSON.stringify(payload, null, 2));
}

void main();
