export { PROTO_PACKAGES, type ProtoPackageName } from './packages';

export * from './generated/identity.pb';
export {
  ACCOUNTS_PACKAGE_NAME,
  ACCOUNTS_SERVICE_NAME,
  AccountsServiceControllerMethods,
  type AccountsServiceClient,
  type AccountsServiceController,
  type GetBalanceRequest,
  type DepositSandboxFundsRequest,
  type LockBalanceRequest,
  type UnlockBalanceRequest,
  type BalanceResponse,
} from './generated/accounts.pb';
