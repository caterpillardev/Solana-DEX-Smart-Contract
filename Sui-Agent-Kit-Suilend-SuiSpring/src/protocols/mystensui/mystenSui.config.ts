// Contents of src/protocols/mystensui/mystenSui.config.ts
// Standard RPC URLs for Sui networks

export const SUI_MAINNET_RPC_URL = "https://fullnode.mainnet.sui.io:443";
export const SUI_TESTNET_RPC_URL = "https://fullnode.testnet.sui.io:443";
export const SUI_DEVNET_RPC_URL = "https://fullnode.devnet.sui.io:443";
export const SUI_LOCALNET_RPC_URL = "http://127.0.0.1:9000";

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet' | 'custom';

export const RPC_URLS: Record<Exclude<SuiNetwork, 'custom'>, string> = {
  mainnet: SUI_MAINNET_RPC_URL,
  testnet: SUI_TESTNET_RPC_URL,
  devnet: SUI_DEVNET_RPC_URL,
  localnet: SUI_LOCALNET_RPC_URL,
}; 