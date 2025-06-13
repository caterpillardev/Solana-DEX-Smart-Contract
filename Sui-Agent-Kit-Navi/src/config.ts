import dotenv from 'dotenv';

try {
    console.error('[CONFIG_TS_DOTENV] Attempting dotenv.config(). Current dir: ', process.cwd());
    dotenv.config(); // Load environment variables from .env file
    console.error('[CONFIG_TS_DOTENV] dotenv.config() completed.');
} catch (e: any) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('[CONFIG_TS_DOTENV] ERROR during dotenv.config():');
    console.error(`[CONFIG_TS_DOTENV] Error Name: ${e.name}`);
    console.error(`[CONFIG_TS_DOTENV] Error Message: ${e.message}`);
    console.error(`[CONFIG_TS_DOTENV] Error Stack: ${e.stack}`);
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    // Optionally rethrow or exit if dotenv loading is critical and fails
    // process.exit(1);
}

export const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443';
export const NAVI_AGENT_MNEMONIC = process.env.NAVI_AGENT_MNEMONIC;
export const NAVI_AGENT_PRIVATE_KEY = process.env.NAVI_AGENT_PRIVATE_KEY;

if (!NAVI_AGENT_MNEMONIC && !NAVI_AGENT_PRIVATE_KEY) {
    console.warn('Warning: NAVI_AGENT_MNEMONIC or NAVI_AGENT_PRIVATE_KEY is not set in .env file. NaviSDKClient may not initialize with a signing account.');
}

if (!SUI_RPC_URL) {
    console.warn('Warning: SUI_RPC_URL is not set. Defaulting to Sui mainnet.');
}

// Configuration loading (RPC, mnemonic, etc.) 