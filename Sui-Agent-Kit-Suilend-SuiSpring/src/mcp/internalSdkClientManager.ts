import { SuiClient } from '@mysten/sui/client';
import { LstClient } from '@suilend/springsui-sdk/client';
import { SteammSDK } from '@suilend/steamm-sdk';
import { SuilendClient } from '@suilend/sdk';
import { 
    SuiNetwork, 
    getSuiClient, 
    getSpecificLstClient, 
    getDefaultSteammSDK,
    getDefaultSuilendClient,
    initializeSuilendClient
} from '../index'; 
import { SUILEND_MAINNET_MARKETS, SUILEND_DEFAULT_MARKET_CONFIG } from '../protocols/suilend/suilend.config';
import { MvpWalletAdapter } from '@/protocols/mystensui/mystenSui.actions';

// Cache for client instances to avoid re-initialization if not handled by underlying getters
const clientCache = new Map<string, any>();
export class InternalSdkClientManager {
    private clientCache = new Map<string, any>();
    private activeUserWalletAdapter: MvpWalletAdapter | null = null;

    constructor() {}

    // --- Active User Wallet Management ---
    public setActiveUserWallet(wallet: MvpWalletAdapter): void {
        if (!wallet.address) {
            // Optionally throw an error or log a warning if the wallet has no address
            // For now, we'll allow it but getActiveUserAddress will return null.
            // console.warn("[ClientManager] Attempting to set an active user wallet without an address."); // This warn is ok for stderr
            throw new Error("[ClientManager] Attempting to set an active user wallet without an address.");
        }
        this.activeUserWalletAdapter = wallet;
        // console.log(`[ClientManager] Active user wallet set. Address: ${wallet.address || 'N/A'}`); // Commented out
    }

    public getActiveUserWallet(): MvpWalletAdapter | null {
        return this.activeUserWalletAdapter;
    }

    public getActiveUserAddress(): string | null {
        return this.activeUserWalletAdapter?.address || null;
    }

    public getSuiClientInstance(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): SuiClient {
        return getSuiClient(network);
    }

    public async getSpringSuiLstClientInstance(
        network: Exclude<SuiNetwork, 'custom'>,
        lstCoinType: string
    ): Promise<LstClient | null> {
        const cacheKey = `springsui-lst-${lstCoinType}-${network}`;
        if (this.clientCache.has(cacheKey)) {
            return this.clientCache.get(cacheKey) as LstClient;
        }
        const client = await getSpecificLstClient(network, lstCoinType);
        if (client) {
            this.clientCache.set(cacheKey, client);
        }
        return client;
    }

    public getSteammSdkInstance(network: Exclude<SuiNetwork, 'custom'>): SteammSDK {
        const cacheKey = `steamm-sdk-${network}`;
        if (this.clientCache.has(cacheKey)) {
            return this.clientCache.get(cacheKey) as SteammSDK;
        }
        const sdk = getDefaultSteammSDK(network);
        this.clientCache.set(cacheKey, sdk);
        return sdk;
    }

    public async getSuilendSdkInstance(
        marketId?: string, 
        network: Exclude<SuiNetwork, 'custom'> = 'mainnet'
    ): Promise<SuilendClient | null> {
        marketId = marketId || SUILEND_DEFAULT_MARKET_CONFIG?.id;
        const cacheKey = `suilend-sdk-${marketId}-${network}`;

        if (!marketId) {
            throw new Error("[ClientManager] Attempted to get Suilend SDK instance without a marketId.");
        }

        if (this.clientCache.has(cacheKey)) {
            return this.clientCache.get(cacheKey) as SuilendClient;
        }

        const suiClient = this.getSuiClientInstance(network);
        let client: SuilendClient | null = null;

        if (marketId === SUILEND_DEFAULT_MARKET_CONFIG?.id) {
            client = await getDefaultSuilendClient(network);
        } else {
            const marketConfig = SUILEND_MAINNET_MARKETS.find(m => m.id === marketId);
            if (marketConfig) {
                client = await initializeSuilendClient(suiClient, marketConfig);
            } else {
                throw new Error(`[ClientManager] Suilend market config not found for ID: ${marketId}`);
            }
        }

        if (client) {
            this.clientCache.set(cacheKey, client);
        }
        return client;
    }
}

// Removed for remove redundancy and unneeded functions.
/*
export function getSuiClientInstance(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): SuiClient {
    return getSuiClient(network);
}

export async function getSpringSuiLstClientInstance(
    network: Exclude<SuiNetwork, 'custom'>, 
    lstCoinType: string
): Promise<LstClient | null> {
    const cacheKey = `springsui-lst-${lstCoinType}-${network}`;
    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as LstClient;
    }
    const client = await getSpecificLstClient(network, lstCoinType);
    if (client) {
        clientCache.set(cacheKey, client);
    }
    return client;
}

export function getSteammSdkInstance(network: Exclude<SuiNetwork, 'custom'>): SteammSDK { 
    const cacheKey = `steamm-sdk-${network}`;
    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as SteammSDK;
    }
    const sdk = getDefaultSteammSDK(network);
    clientCache.set(cacheKey, sdk);
    return sdk;
}

export async function getSuilendSdkInstance(
    marketId?: string, 
    network: Exclude<SuiNetwork, 'custom'> = 'mainnet' 
): Promise<SuilendClient | null> {
    marketId = marketId || SUILEND_DEFAULT_MARKET_CONFIG?.id;
    const cacheKey = `suilend-sdk-${marketId}-${network}`;

    if (!marketId) {
        return null;
    }

    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as SuilendClient;
    }

    const suiClient = getSuiClientInstance(network);
    let client: SuilendClient | null = null;

    if (marketId === SUILEND_DEFAULT_MARKET_CONFIG?.id) { 
        client = await getDefaultSuilendClient(network);
    } else {
        const marketConfig = SUILEND_MAINNET_MARKETS.find(m => m.id === marketId);
        if (marketConfig) {
            client = await initializeSuilendClient(suiClient, marketConfig);
        } else {
            return null;
        }
    }

    if (client) {
        clientCache.set(cacheKey, client);
    }
    return client;
}
*/
