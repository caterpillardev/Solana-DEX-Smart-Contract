import { SuiClient } from '@mysten/sui/client';
import { SteammSDK, SdkOptions } from '@suilend/steamm-sdk'; // SdkOptions might be from a more specific path like '@suilend/steamm-sdk/types'
import { STEAMM_MAINNET_CONFIG, SteammSdkOptionsConfig } from './steamm.config';
import { getSuiClient, getCustomSuiClient } from '../mystensui/mystenSui.client';
import { SuiNetwork } from '../mystensui/mystenSui.config';

// Cache for SteammSDK instances, keyed by a network identifier or RPC URL string
const steammSdkCache: Partial<Record<string, SteammSDK>> = {};

/**
 * Initializes and returns a SteammSDK instance for the given SdkOptions configuration.
 * Caches clients by RPC URL to avoid re-initialization for the same endpoint.
 *
 * @param suiClient The underlying SuiClient instance (not directly used by SteammSDK constructor but good for context).
 * @param sdkConfig The SdkOptions configuration for SteammSDK.
 * @param senderAddress Optional: The sender's Sui address to configure the SDK.
 * @returns An initialized SteammSDK instance.
 */
export function initializeSteammSDK(
  suiClient: SuiClient, 
  sdkConfig: SteammSdkOptionsConfig,
  senderAddress?: string 
): SteammSDK {
  const baseCacheKey = sdkConfig.fullRpcUrl;
  const cacheKey = senderAddress ? `${baseCacheKey}_sender_${senderAddress}` : `${baseCacheKey}_no_sender`;

  const finalSdkConfig = senderAddress ? { ...sdkConfig, senderAddress } : sdkConfig;
  
  if (finalSdkConfig.steamm_config && finalSdkConfig.steamm_config.config) {
    if (finalSdkConfig.steamm_config.config.quoterSourcePkgs) {
    } else {
      console.error('[Steamm Client Error] Configuration issue: finalSdkConfig.steamm_config.config.quoterSourcePkgs IS UNDEFINED');
    }
  } else {
    console.error('[Steamm Client Error] Configuration issue: finalSdkConfig.steamm_config OR finalSdkConfig.steamm_config.config IS UNDEFINED');
  }

  if (steammSdkCache[cacheKey]) {
    return steammSdkCache[cacheKey]!;
  }
  const client = new SteammSDK(finalSdkConfig as any as SdkOptions); 

  if (finalSdkConfig.senderAddress) {
    client.senderAddress = finalSdkConfig.senderAddress;
  } else {
    console.warn(`[Steamm Client Warn] No senderAddress provided to set on SteammSDK instance. Operations requiring it may fail.`);
  }
  
  steammSdkCache[cacheKey] = client;
  return client;
}

/**
 * Gets a SteammSDK instance for the default mainnet configuration.
 *
 * @param network The Sui network (determines which SuiClient is implicitly used, though SteammSDK uses its own RPC).
 * @param senderAddress Optional: The sender's Sui address to configure the SDK.
 * @returns An initialized SteammSDK instance for mainnet.
 */
export function getDefaultSteammSDK(
  network: Exclude<SuiNetwork, 'custom'> = 'mainnet',
  senderAddress?: string // Added optional senderAddress
): SteammSDK {
  const suiClient = getSuiClient(network); 
  // Pass senderAddress to initializeSteammSDK, which will add it to the config
  return initializeSteammSDK(suiClient, STEAMM_MAINNET_CONFIG, senderAddress);
}

/**
 * Gets a SteammSDK instance for a custom RPC and potentially custom Steamm configuration.
 * 
 * @param customRpcUrl 
 * @param senderAddress Optional: The sender's Sui address to configure the SDK.
 * @returns SteammSDK instance
 */
export function getCustomSteammSDK(
  customRpcUrl: string,
  senderAddress?: string // Added optional senderAddress
): SteammSDK {
    const suiClient = getCustomSuiClient(customRpcUrl);
    // Create a custom config, then pass senderAddress to initializeSteammSDK
    const customBaseConfig: SteammSdkOptionsConfig = {
        ...STEAMM_MAINNET_CONFIG, // Start with mainnet objects
        fullRpcUrl: customRpcUrl,
        // senderAddress will be handled by initializeSteammSDK
    };
    return initializeSteammSDK(suiClient, customBaseConfig, senderAddress);
} 