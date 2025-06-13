import { NAVISDKClient, AccountManager } from 'navi-sdk';
import { SUI_RPC_URL, NAVI_AGENT_MNEMONIC, NAVI_AGENT_PRIVATE_KEY } from '../config';

let naviClientInstance: NAVISDKClient | null = null;
let primaryAccountManagerInstance: AccountManager | null = null;

interface NaviSDKInstances {
    client: NAVISDKClient;
    primaryAccount: AccountManager;
}

/**
 * Initializes and returns the NAVISDKClient and the primary AccountManager.
 * It ensures that the client is initialized only once (singleton pattern).
 * 
 * @throws Error if neither mnemonic nor private key is provided for the agent.
 * @returns {Promise<NaviSDKInstances>} An object containing the client and primary account manager.
 */
export async function getNaviSDKInstances(): Promise<NaviSDKInstances> {
    if (naviClientInstance && primaryAccountManagerInstance) {
        return {
            client: naviClientInstance,
            primaryAccount: primaryAccountManagerInstance,
        };
    }

    const clientOptions: any = {
        networkType: SUI_RPC_URL,
        numberOfAccounts: 1, // We'll primarily use the first account for the agent
    };

    if (NAVI_AGENT_PRIVATE_KEY) {
        clientOptions.privateKeyList = [NAVI_AGENT_PRIVATE_KEY];
        // Mnemonic is not needed if private key is used for the first account
    } else if (NAVI_AGENT_MNEMONIC) {
        clientOptions.mnemonic = NAVI_AGENT_MNEMONIC;
    } else {
        // This case should ideally be prevented by a startup check in index.ts or here.
        // For now, NAVISDKClient might generate a new mnemonic if none is provided,
        // which is not desired for a persistent agent.
        console.error('CRITICAL: No NAVI_AGENT_MNEMONIC or NAVI_AGENT_PRIVATE_KEY found. SDK might generate a temporary wallet.');
        // To strictly prevent this, we can throw an error:
        throw new Error('Agent wallet (mnemonic or private key) not configured in .env');
    }

    try {
        console.error(`Initializing NAVISDKClient with network: ${SUI_RPC_URL}...`);
        const client = new NAVISDKClient(clientOptions);
        
        if (!client.accounts || client.accounts.length === 0) {
            throw new Error('NAVISDKClient did not initialize any accounts.');
        }
        
        naviClientInstance = client;
        primaryAccountManagerInstance = client.accounts[0];

        console.error(`NAVISDKClient initialized. Agent primary account address: ${primaryAccountManagerInstance.address}`);
        
        return {
            client: naviClientInstance,
            primaryAccount: primaryAccountManagerInstance,
        };
    } catch (error) {
        console.error("Failed to initialize NAVISDKClient:", error);
        throw error; // Re-throw the error to be caught by the caller
    }
}

/**
 * Utility function to get the initialized NAVISDKClient instance directly.
 * Calls getNaviSDKInstances() internally.
 */
export async function getClient(): Promise<NAVISDKClient> {
    const { client } = await getNaviSDKInstances();
    return client;
}

/**
 * Utility function to get the initialized primary AccountManager instance directly.
 * Calls getNaviSDKInstances() internally.
 */
export async function getPrimaryAccount(): Promise<AccountManager> {
    const { primaryAccount } = await getNaviSDKInstances();
    return primaryAccount;
} 