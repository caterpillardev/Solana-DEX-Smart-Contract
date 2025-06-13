console.error('[SERVER_INDEX_VERY_EARLY] Script execution started.');
const originalConsoleLog = console.log;
console.log = (...args) => {
    console.error('[LOG]', ...args);
};
console.warn = (...args) => {
    console.error('[WARN]', ...args);
}

console.error("MCP Stdio Mode: console.log and console.warn have been redirected to stderr.");

import { SUI_RPC_URL, NAVI_AGENT_MNEMONIC, NAVI_AGENT_PRIVATE_KEY } from './config';
import { getNaviSDKInstances } from './core_navi/navi_client'; // I let this here but i ll clean soon just for testing
import { mcpServer, initializeNaviConnection } from './mcp_server/server'; 
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

console.error('Starting Navi MCP Server...');
console.error('---------------------------------');
console.error(`SUI RPC URL: ${SUI_RPC_URL}`);

if (NAVI_AGENT_MNEMONIC) {
    console.error('NAVI Agent Mnemonic: Loaded (not displaying value for security)');
} else if (NAVI_AGENT_PRIVATE_KEY) {
    console.error('NAVI Agent Private Key: Loaded (not displaying value for security)');
} else {
    console.error('NAVI Agent Mnemonic/Private Key: Not found in .env. Initialization might fail or use a temporary wallet.');
}
console.error('---------------------------------');

async function main() {
    console.error('[SERVER_INDEX] Main function started.');
    try {
        console.error('[SERVER_INDEX] Attempting to initialize Navi SDK connection...');
        await initializeNaviConnection(); 
        console.error('[SERVER_INDEX] Navi SDK connection phase completed successfully.');

        console.error('[SERVER_INDEX] Creating StdioServerTransport...');
        const transport = new StdioServerTransport();
        console.error('[SERVER_INDEX] StdioServerTransport created.');

        console.error('[SERVER_INDEX] Attempting mcpServer.connect with transport...');
        await mcpServer.connect(transport);
        console.error('[SERVER_INDEX] Navi MCP Server is running and connected via Stdio. Listening for requests...');

    } catch (error: any) {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('[SERVER_INDEX] ERROR during server startup or Navi SDK initialization:');
        console.error(`[SERVER_INDEX] Error Name: ${error.name}`);
        console.error(`[SERVER_INDEX] Error Message: ${error.message}`);
        console.error(`[SERVER_INDEX] Error Stack: ${error.stack}`);
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        process.exit(1);
    }
}

console.error('[SERVER_INDEX] Calling main()...');
main().catch(error => {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('[SERVER_INDEX] CRITICAL UNHANDLED REJECTION in main execution loop:');
    if (error instanceof Error) {
        console.error(`[SERVER_INDEX] Error Name: ${error.name}`);
        console.error(`[SERVER_INDEX] Error Message: ${error.message}`);
        console.error(`[SERVER_INDEX] Error Stack: ${error.stack}`);
    } else {
        console.error('[SERVER_INDEX] Non-Error object thrown:', error);
    }
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    process.exit(1);
}); 
