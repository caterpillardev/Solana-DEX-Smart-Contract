import { SuiClient } from '@mysten/sui/client';
import { RPC_URLS, SuiNetwork } from './mystenSui.config';

const suiClients: Partial<Record<Exclude<SuiNetwork, 'custom'>, SuiClient>> = {};

/**
 * Initializes and returns a SuiClient for the specified network.
 * Caches clients to avoid re-initialization for the same network.
 * 
 * @param network The Sui network to connect to (default: 'devnet').
 * @returns An initialized SuiClient instance.
 * @throws Error if the RPC URL for the network is not defined.
 */
export function getSuiClient(network: Exclude<SuiNetwork, 'custom'> = 'devnet'): SuiClient {
  if (!suiClients[network]) {
    const url = RPC_URLS[network];
    if (!url) {
      throw new Error(`RPC URL for network ${network} not defined.`);
    }
    suiClients[network] = new SuiClient({ url });
  }
  return suiClients[network]!;
}

/**
 * Creates a SuiClient for a custom RPC URL.
 * This client is not cached.
 * 
 * @param customRpcUrl The custom RPC URL to connect to.
 * @returns An initialized SuiClient instance.
 */
export function getCustomSuiClient(customRpcUrl: string): SuiClient {
  return new SuiClient({ url: customRpcUrl });
} 