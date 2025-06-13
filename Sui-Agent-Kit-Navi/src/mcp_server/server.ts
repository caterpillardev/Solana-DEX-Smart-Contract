import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { 
    CallToolResult, 
    ReadResourceResult, 
    TextContent
    // OptionType is not from MCP SDK, it's from Navi SDK
} from '@modelcontextprotocol/sdk/types.js';
import { NAVISDKClient, AccountManager, CoinInfo, getAddressPortfolio, Quote, SwapOptions as NaviSwapOptions, Dex, PoolRewards, OptionType as NaviOptionType, vSui } from 'navi-sdk';
import type { SuiObjectResponse } from '@mysten/sui/client';
import { getNaviSDKInstances } from '../core_navi/navi_client';
import { mapAssetSymbolToCoinInfo, amountToSmallestUnit, smallestUnitToAmount } from './mappers';
import { z } from 'zod';
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromB64 } from "@mysten/sui/utils";
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// Local type aliases
type McpResourceVariables = Record<string, string | string[] | undefined>;
type McpRequestHandlerExtra = any; 

// Define a type for the items in ReadResourceResult.contents that IS compatible
// It must include 'uri' and then match one of the ContentPart structures like TextContent
type McpCompatibleContentItem = TextContent & { uri: string };

// Local type for SwapOptions to be used in Zod schema and handlers if NaviSwapOptions isn't directly usable
// For now, let's try to use NaviSwapOptions and see if Zod can infer from it or if we need a separate McpSwapOptions

let naviSDKInstances: { client: NAVISDKClient; primaryAccount: AccountManager } | null = null;

export async function initializeNaviConnection() {
    if (!naviSDKInstances) {
        naviSDKInstances = await getNaviSDKInstances();
    }
}

export const mcpServer = new McpServer({
    name: 'NaviMCPAgent',
    version: '0.1.0',
    capabilities: {},
});

// --- Ping Tool ---
mcpServer.tool(
    'ping',
    'Responds with pong to indicate server is alive.',
    async (_extra: McpRequestHandlerExtra): Promise<CallToolResult> => {
        console.log('[NaviMCPAgent] Ping tool called');
        const pingContent: TextContent = { type: 'text', text: 'pong' };
        return { content: [pingContent] };
    }
);

// --- Get Pool Info ---
// Original function to handle resources that need pool info
async function handleGetPoolInfoResource(uri: URL, params: McpResourceVariables): Promise<ReadResourceResult> { 
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; }}
    const { client: naviClient } = naviSDKInstances;
    let poolData;
    const assetSymbolParam = params.assetSymbol;
    let assetSymbol: string | undefined = undefined;

    if (typeof assetSymbolParam === 'string') assetSymbol = assetSymbolParam;
    else if (Array.isArray(assetSymbolParam) && assetSymbolParam.length > 0) assetSymbol = assetSymbolParam[0]; 

    try {
        if (assetSymbol) { // For get_pool_info_by_symbol (original resource)
            const coinInfo = mapAssetSymbolToCoinInfo(assetSymbol);
            if (!coinInfo) {
                console.warn(`Asset symbol '${assetSymbol}' not found for resource get_pool_info_by_symbol.`);
                return { contents: [], _meta: { error: `Asset symbol '${assetSymbol}' not found or not supported.` } }; 
            }
            poolData = await naviClient.getPoolInfo(coinInfo);
        } else { // For get_all_pools_info
            poolData = await naviClient.getPoolInfo();
        }

        if (!poolData || (Array.isArray(poolData) && poolData.length === 0) || (typeof poolData === 'object' && Object.keys(poolData).length === 0 && !(poolData instanceof Array))) {
            console.warn(`No pool data received from SDK for symbol: ${assetSymbol || '(all)'}.`);
            return { contents: [] };
        }
        
        const contentItem: McpCompatibleContentItem = {
            uri: uri.href, 
            type: 'text', 
            text: JSON.stringify(poolData, null, 2),
            mimeType: 'application/json',
        };

        return {
            contents: [contentItem],
        };
    } catch (e: any) {
        console.error(`Error in handleGetPoolInfoResource (symbol: ${assetSymbol || '(all)'}):`, e);
        return { contents: [], _meta: { error: e.message || 'Failed to fetch pool information.' } }; 
    }
}

// NEW Tool: navi_getPoolInfoBySymbol
const getPoolInfoBySymbolToolSchema = z.object({
    assetSymbol: z.string().describe("Asset symbol (e.g., SUI, USDC) to get pool information for.")
});
type GetPoolInfoBySymbolToolArgs = z.infer<typeof getPoolInfoBySymbolToolSchema>;

async function handleGetPoolInfoBySymbolTool(args: GetPoolInfoBySymbolToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] };
    }}
    const { client: naviClient } = naviSDKInstances;
    const { assetSymbol } = args;

    try {
        const coinInfo = mapAssetSymbolToCoinInfo(assetSymbol);
        if (!coinInfo) {
            const errorText = `Asset symbol '${assetSymbol}' not found or not supported for tool navi_getPoolInfoBySymbol.`;
            console.warn(errorText);
            return { isError: true, content: [{ type: 'text', text: errorText } as TextContent] };
        }
        
        const poolData = await naviClient.getPoolInfo(coinInfo);

        if (!poolData || (typeof poolData === 'object' && Object.keys(poolData).length === 0 && !(poolData instanceof Array))) {
            const warnMsg = `No pool data received from SDK for symbol: ${assetSymbol}.`;
            console.warn(warnMsg);
            return { content: [{ type: 'text', text: 'No pool data found for the given symbol.' } as TextContent] };
        }
        
        const textResponse = JSON.stringify(poolData, null, 2);
        return { 
            content: [{ 
                type: 'text', 
                text: textResponse,
                mimeType: 'application/json',
            } as TextContent] 
        };

    } catch (e: any) {
        console.error(`Error in handleGetPoolInfoBySymbolTool (symbol: ${assetSymbol}):`, e);
        const errorText = e.message || `Failed to fetch pool information for ${assetSymbol}.`;
        return { isError: true, content: [{ type: 'text', text: errorText } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getPoolInfoBySymbol',
    {
        description: 'Gets detailed information for a specific asset pool in the Navi Protocol.',
        inputSchema: getPoolInfoBySymbolToolSchema.shape
    },
    handleGetPoolInfoBySymbolTool
);

// REMOVE (or comment out) the old resource registration for get_pool_info_by_symbol
// mcpServer.resource(
//     'get_pool_info_by_symbol',
//     new ResourceTemplate('navi://pool_info/{assetSymbol}', { list: undefined }),
//     async (uri, variables: McpResourceVariables, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetPoolInfoResource(uri, variables) 
// );

// ADD NEW TOOL: navi_getAllPoolsInfo
const getAllPoolsInfoToolSchema = z.object({}); // No parameters
type GetAllPoolsInfoToolArgs = z.infer<typeof getAllPoolsInfoToolSchema>;

async function handleGetAllPoolsInfoTool(_args: GetAllPoolsInfoToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] };
    }}
    const { client: naviClient } = naviSDKInstances;

    try {
        const poolData = await naviClient.getPoolInfo(); // Fetches all pools

        if (!poolData || (Array.isArray(poolData) && poolData.length === 0)) {
            console.warn(`No pool data received from SDK for navi_getAllPoolsInfo.`);
            return { content: [{ type: 'text', text: 'No pool data found.' } as TextContent] };
        }
        
        const textResponse = JSON.stringify(poolData, null, 2);
        return { 
            content: [{ 
                type: 'text', 
                text: textResponse,
                mimeType: 'application/json',
            } as TextContent] 
        };

    } catch (e: any) {
        console.error(`Error in handleGetAllPoolsInfoTool:`, e);
        const errorText = e.message || 'Failed to fetch all pool information.';
        return { isError: true, content: [{ type: 'text', text: errorText } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAllPoolsInfo',
    {
        description: 'Gets detailed information for all available asset pools in the Navi Protocol.',
        inputSchema: getAllPoolsInfoToolSchema.shape
    },
    handleGetAllPoolsInfoTool
);

// --- Agent Portfolio Resource ---
// REMOVE THIS RESOURCE
// async function handleGetAgentPortfolio(uri: URL, _params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) {
//         await initializeNaviConnection();
//         if (!naviSDKInstances) { 
//             return { contents: [], _meta: { error: 'Navi SDK not initialized for handleGetAgentPortfolio' } };
//         }
//     }
//     const agentAddress = naviSDKInstances.primaryAccount.address;
//     const agentSuiClient = naviSDKInstances.primaryAccount.client;
// 
//     try {
//         const portfolioMap = await getAddressPortfolio(agentAddress, false, agentSuiClient, false);
//         const portfolioObject: Record<string, { borrowBalance: number, supplyBalance: number }> = {};
//         portfolioMap.forEach((value, key) => {
//             portfolioObject[key] = value;
//         });
// 
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify(portfolioObject, null, 2),
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error(`Error fetching agent portfolio for ${agentAddress}:`, e);
//         return { contents: [], _meta: { error: e.message || 'Failed to fetch agent account portfolio.' } };
//     }
// }
// mcpServer.resource(
//     'get_agent_portfolio',
//     'navi://agent/portfolio',
//     async (uri, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetAgentPortfolio(uri, {}) 
// );

// NEW TOOL: navi_getAgentPortfolio
const getAgentPortfolioToolSchema = z.object({});
type GetAgentPortfolioToolArgs = z.infer<typeof getAgentPortfolioToolSchema>;

async function handleGetAgentPortfolioTool(_args: GetAgentPortfolioToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) {
        await initializeNaviConnection();
        if (!naviSDKInstances) { 
            return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized for handleGetAgentPortfolioTool' } as TextContent] };
        }
    }
    const agentAddress = naviSDKInstances.primaryAccount.address;
    const agentSuiClient = naviSDKInstances.primaryAccount.client;

    try {
        const portfolio = await getAddressPortfolio(agentAddress, false, agentSuiClient, true);
        const portfolioObject: Record<string, { borrowBalance: number, supplyBalance: number }> = {};
        portfolio.forEach((value, key) => {
            portfolioObject[key] = value;
        });
        
        // getAddressPortfolio from Navi SDK returns human-readable numbers for balances when decimals=true
        return { 
            isError: false, 
            content: [{ type: 'text', text: JSON.stringify(portfolioObject, null, 2) } as TextContent] 
        };
    } catch (error) {
        return { isError: true, content: [{ type: 'text', text: `Error getting agent portfolio: ${error}` } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAgentPortfolio',
    {
        description: "Gets the agent's current asset portfolio (supply and borrow balances).",
        inputSchema: getAgentPortfolioToolSchema.shape
    },
    handleGetAgentPortfolioTool
);

// --- Agent Health Factor Resource ---
// REMOVE THIS RESOURCE AND ITS HANDLER
// async function handleGetAgentHealthFactor(uri: URL, _params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) {
//         await initializeNaviConnection();
//         if (!naviSDKInstances) { 
//             return { contents: [], _meta: { error: 'Navi SDK not initialized for handleGetAgentHealthFactor' } };
//         }
//     }
//     const agentAddress = naviSDKInstances.primaryAccount.address;
// 
//     try {
//         const healthFactor = await naviSDKInstances.client.getHealthFactor(agentAddress);
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify({ healthFactor }, null, 2),
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error(`Error fetching agent health factor for ${agentAddress}:`, e);
//         return { contents: [], _meta: { error: e.message || 'Failed to fetch agent health factor.' } };
//     }
// }
// mcpServer.resource(
//     'get_agent_health_factor',
//     'navi://agent/health_factor',
//     async (uri, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetAgentHealthFactor(uri, {}) 
// );

// NEW TOOL: navi_getAgentHealthFactor
const getAgentHealthFactorToolSchema = z.object({});
type GetAgentHealthFactorToolArgs = z.infer<typeof getAgentHealthFactorToolSchema>;

async function handleGetAgentHealthFactorTool(_args: GetAgentHealthFactorToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) {
        await initializeNaviConnection();
        if (!naviSDKInstances) { 
            return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized for handleGetAgentHealthFactorTool' } as TextContent] };
        }
    }
    const agentAddress = naviSDKInstances.primaryAccount.address;

    try {
        const healthFactor = await naviSDKInstances.client.getHealthFactor(agentAddress);
        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify({ healthFactor }, null, 2),
                mimeType: 'application/json',
            } as TextContent] 
        };
    } catch (e: any) {
        console.error(`Error fetching agent health factor for ${agentAddress}:`, e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to fetch agent health factor.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAgentHealthFactor',
    {
        description: "Gets the agent's current health factor.",
        inputSchema: getAgentHealthFactorToolSchema.shape
    },
    handleGetAgentHealthFactorTool
);

// Consolidated error handler for direct SDK calls
const handleSdkError = (error: any, action: string): CallToolResult => {
    console.error(`Error during ${action}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    // Example specific error check
    if (message.includes("eCollateralCanNotCoverNewBorrow")) {
        return { isError: true, content: [{ type: 'text', text: `Borrow failed: Collateral cannot cover the new borrow amount. You may need to deposit more collateral or borrow a smaller amount.` } as TextContent] };
    }
    return { isError: true, content: [{ type: 'text', text: `Error during ${action}: ${message}` } as TextContent] };
};

// --- Action Tools ---
const assetAmountSchema = z.object({ 
    assetSymbol: z.string().describe('Asset symbol (e.g., SUI, USDC)'), 
    amount: z.number().positive('Amount must be positive.').describe('Amount in human-readable units.') 
});
const assetAmountOracleSchema = assetAmountSchema.extend({ 
    updateOracle: z.boolean().optional().default(true).describe('Update oracle price before action.')
});

// Handler for navi_depositAsset
async function handleNaviDepositAsset(args: z.infer<typeof assetAmountSchema>, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized for depositToNavi'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
    if (!coinInfo) { return { isError: true, content: [{ type: 'text', text: `Asset symbol '${args.assetSymbol}' not found for depositToNavi.` } as TextContent] }; }
    
    try {
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, coinInfo);
        console.log(`Attempting depositToNavi: ${args.amount} ${args.assetSymbol} (${Number(amountInSmallestUnit)} smallest units) for ${primaryAccount.address}`);
        // Corrected: depositToNavi likely takes 2 arguments (coinInfo, amount)
        // updateOracle might be handled internally by SDK or not applicable for deposit in this SDK version's AccountManager.
        const result = await primaryAccount.depositToNavi(coinInfo, Number(amountInSmallestUnit)); 
        console.log(`depositToNavi transaction result:`, result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [ { type: 'text', text: `Successfully deposited asset. Digest: ${result.digest}` } as TextContent ] };
        } else {
            return { isError: true, content: [ { type: 'text', text: `Deposit failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent ] };
        }
    } catch (error: any) { return handleSdkError(error, "depositToNavi"); }
}

// Handler for navi_withdrawAsset
async function handleNaviWithdrawAsset(args: z.infer<typeof assetAmountOracleSchema>, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized for withdraw'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
    if (!coinInfo) { return { isError: true, content: [{ type: 'text', text: `Asset symbol '${args.assetSymbol}' not found for withdraw.` } as TextContent] }; }

    try {
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, coinInfo);
        console.log(`Attempting withdraw: ${args.amount} ${args.assetSymbol} (${Number(amountInSmallestUnit)} smallest units) with updateOracle: ${args.updateOracle} for ${primaryAccount.address}`);
        const result = await primaryAccount.withdraw(coinInfo, Number(amountInSmallestUnit), args.updateOracle);
        console.log(`Withdraw transaction result:`, result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [ { type: 'text', text: `Successfully withdrew asset. Digest: ${result.digest}` } as TextContent ] };
        } else {
            return { isError: true, content: [ { type: 'text', text: `Withdraw failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent ] };
        }
    } catch (error: any) { return handleSdkError(error, "withdraw"); }
}

// Handler for navi_borrowAsset
async function handleNaviBorrowAsset(args: z.infer<typeof assetAmountOracleSchema>, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized for borrow'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
    if (!coinInfo) { return { isError: true, content: [{ type: 'text', text: `Asset symbol '${args.assetSymbol}' not found for borrow.` } as TextContent] }; }

    try {
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, coinInfo);
        console.log(`Attempting borrow: ${args.amount} ${args.assetSymbol} (${Number(amountInSmallestUnit)} smallest units) with updateOracle: ${args.updateOracle} for ${primaryAccount.address}`);
        const result = await primaryAccount.borrow(coinInfo, Number(amountInSmallestUnit), args.updateOracle); // Assuming borrow is the correct method name
        console.log(`Borrow transaction result:`, result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [ { type: 'text', text: `Successfully borrowed asset. Digest: ${result.digest}` } as TextContent ] };
        } else {
            return { isError: true, content: [ { type: 'text', text: `Borrow failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent ] };
        }
    } catch (error: any) { return handleSdkError(error, "borrow"); }
}

// Handler for navi_repayDebt
async function handleNaviRepayDebt(args: z.infer<typeof assetAmountSchema>, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized for repay'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
    if (!coinInfo) { return { isError: true, content: [{ type: 'text', text: `Asset symbol '${args.assetSymbol}' not found for repay.` } as TextContent] }; }

    try {
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, coinInfo);
        console.log(`Attempting repay: ${args.amount} ${args.assetSymbol} (${Number(amountInSmallestUnit)} smallest units) for ${primaryAccount.address}`);
        const result = await primaryAccount.repay(coinInfo, Number(amountInSmallestUnit));
        console.log(`Repay transaction result:`, result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [ { type: 'text', text: `Successfully repayed debt. Digest: ${result.digest}` } as TextContent ] };
        } else {
            return { isError: true, content: [ { type: 'text', text: `Repay failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent ] };
        }
    } catch (error: any) { return handleSdkError(error, "repay"); }
}

mcpServer.registerTool('navi_depositAsset', { description: 'Deposits asset.', inputSchema: assetAmountSchema.shape }, handleNaviDepositAsset);
mcpServer.registerTool('navi_withdrawAsset', { description: 'Withdraws asset.', inputSchema: assetAmountOracleSchema.shape }, handleNaviWithdrawAsset);
mcpServer.registerTool('navi_borrowAsset', { description: 'Borrows asset.', inputSchema: assetAmountOracleSchema.shape }, handleNaviBorrowAsset);
mcpServer.registerTool('navi_repayDebt', { description: 'Repays debt.', inputSchema: assetAmountSchema.shape }, handleNaviRepayDebt);

// --- Swap Quote Resource --- (Now a Tool)
// ORIGINAL RESOURCE SCHEMA (used by handleGetSwapQuote resource handler)
const getSwapQuoteParamsSchemaForResource = z.object({
    fromAssetSymbol: z.string().describe("Symbol of the asset to swap from (e.g., SUI)"),
    toAssetSymbol: z.string().describe("Symbol of the asset to swap to (e.g., USDC)"),
    amountIn: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {message: "amountIn must be a string representing a positive number"}).describe("Amount of the input asset (human-readable string, e.g., \"1.5\")")
});

// Original handler for the RESOURCE (kept for reference or if any other resource might use similar logic, though unlikely now)
// async function handleGetSwapQuote(uri: URL, params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; }}
//     try {
//         const validatedParams = getSwapQuoteParamsSchemaForResource.parse({ fromAssetSymbol: params.fromAssetSymbol, toAssetSymbol: params.toAssetSymbol, amountIn: params.amountIn });
//         const fromCoinInfo = mapAssetSymbolToCoinInfo(validatedParams.fromAssetSymbol);
//         const toCoinInfo = mapAssetSymbolToCoinInfo(validatedParams.toAssetSymbol);
//         if (!fromCoinInfo || !toCoinInfo) { return { contents: [], _meta: { error: 'Invalid asset symbol(s) for swap quote.' } };}
//         const amountInNumber = parseFloat(validatedParams.amountIn);
//         const amountInSmallest = amountToSmallestUnit(amountInNumber, fromCoinInfo);
//         const quoteResult: Quote = await naviSDKInstances.client.getQuote( fromCoinInfo.address, toCoinInfo.address, amountInSmallest, undefined, { dexList: undefined , byAmountIn: true, depth: 3 });
//         const contentItem: McpCompatibleContentItem = { uri: uri.href, type: 'text', text: JSON.stringify(quoteResult, null, 2), mimeType: 'application/json' };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error('Error getting swap quote:', e);
//         if (e instanceof z.ZodError) { return { contents: [], _meta: { error: `Invalid parameters for swap quote: ${JSON.stringify(e.errors)}` } }; }
//         return { contents: [], _meta: { error: e.message || 'Failed to get swap quote.' } };
//     }
// }
// mcpServer.resource('navi_getSwapQuote', new ResourceTemplate('navi://swap_quote?fromAssetSymbol={fromAssetSymbol}&toAssetSymbol={toAssetSymbol}&amountIn={amountIn}', { list: undefined }), async (uri, variables: McpResourceVariables, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetSwapQuote(uri, variables));

// NEW TOOL: navi_getSwapQuote
const getSwapQuoteToolSchema = z.object({
    fromAssetSymbol: z.string().describe("Symbol of the asset to swap from (e.g., SUI)"),
    toAssetSymbol: z.string().describe("Symbol of the asset to swap to (e.g., USDC)"),
    amountIn: z.number().positive("Amount of the input asset to swap (human-readable, e.g., 1.5)")
});
type GetSwapQuoteToolArgs = z.infer<typeof getSwapQuoteToolSchema>;

async function handleGetSwapQuoteTool(args: GetSwapQuoteToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] }; 
    }}
    const { client: naviClient } = naviSDKInstances;

    try {
        const fromCoinInfo = mapAssetSymbolToCoinInfo(args.fromAssetSymbol);
        const toCoinInfo = mapAssetSymbolToCoinInfo(args.toAssetSymbol);

        if (!fromCoinInfo || !toCoinInfo) { 
            return { isError: true, content: [{ type: 'text', text: 'Invalid asset symbol(s) for swap quote.' } as TextContent] };
        }

        const amountInSmallest = amountToSmallestUnit(args.amountIn, fromCoinInfo);
        // Log the smallest unit to verify conversion
        console.log(`[handleGetSwapQuoteTool] Amount in: ${args.amountIn} ${args.fromAssetSymbol}, Smallest unit: ${amountInSmallest.toString()}`);

        const quoteResult: Quote = await naviClient.getQuote( 
            fromCoinInfo.address, 
            toCoinInfo.address, 
            amountInSmallest, 
            undefined, // slippage, handled by minAmountOut in executeSwap if needed
            { dexList: undefined , byAmountIn: true, depth: 3 } // options
        );

        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify(quoteResult, null, 2), 
                mimeType: 'application/json' 
            } as TextContent] 
        };
    } catch (e: any) {
        console.error('Error in handleGetSwapQuoteTool:', e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to get swap quote.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getSwapQuote',
    {
        description: "Gets a swap quote for exchanging one asset for another via NAVI Aggregator.",
        inputSchema: getSwapQuoteToolSchema.shape
    },
    handleGetSwapQuoteTool
);

// --- Execute Swap Tool ---
const executeSwapToolInputSchema = z.object({
    fromAssetSymbol: z.string().describe("Symbol of the asset to swap from (e.g., SUI)"),
    toAssetSymbol: z.string().describe("Symbol of the asset to swap to (e.g., USDC)"),
    amountIn: z.number().positive("Amount of the input asset to swap (human-readable)"),
    minAmountOut: z.number().nonnegative("Minimum amount of output asset expected (human-readable, for slippage)"),
});
type ExecuteSwapToolArgs = z.infer<typeof executeSwapToolInputSchema>;
async function handleNaviExecuteSwap(args: ExecuteSwapToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    const fromCoinInfo = mapAssetSymbolToCoinInfo(args.fromAssetSymbol);
    const toCoinInfo = mapAssetSymbolToCoinInfo(args.toAssetSymbol);
    if (!fromCoinInfo || !toCoinInfo) { return { isError: true, content: [{ type: 'text', text: 'Invalid asset symbol(s) for swap.' } as TextContent] }; }
    try {
        const amountInSmallest = amountToSmallestUnit(args.amountIn, fromCoinInfo);
        const minAmountOutSmallest = amountToSmallestUnit(args.minAmountOut, toCoinInfo);
        console.log(`Attempting swap: ${args.amountIn} ${args.fromAssetSymbol} to ${args.toAssetSymbol} for min ${args.minAmountOut} ${args.toAssetSymbol}`);
        const result = await primaryAccount.swap( fromCoinInfo.address, toCoinInfo.address, amountInSmallest, Number(minAmountOutSmallest), undefined, { dexList: undefined, byAmountIn: true, depth: 3 });
        console.log('Swap transaction result:', result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [{ type: 'text', text: `Swap successful. Digest: ${result.digest}` } as TextContent] };
        } else {
            return { isError: true, content: [{ type: 'text', text: `Swap failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent] };
        }
    } catch (error: any) {
        console.error(`Error executing swap:`, error);
        return { isError: true, content: [{ type: 'text', text: `Error executing swap: ${error.message || 'Unknown'}` } as TextContent] };
    }
}
mcpServer.registerTool('navi_executeSwap', { description: 'Executes a token swap via NAVI Aggregator.', inputSchema: executeSwapToolInputSchema.shape }, handleNaviExecuteSwap);

// --- Available Rewards Resource --- (Now a Tool)
// ORIGINAL HANDLER
// async function handleGetAgentAvailableRewards(uri: URL, _params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; }}
//     const agentAddress = naviSDKInstances.primaryAccount.address;
//     try {
//         const rewards: PoolRewards[] = await naviSDKInstances.client.getAddressAvailableRewards(agentAddress, [NaviOptionType.OptionSupply, NaviOptionType.OptionBorrow]);
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify(rewards, null, 2),
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error(`Error fetching available rewards for agent ${agentAddress}:`, e);
//         return { contents: [], _meta: { error: e.message || 'Failed to fetch available rewards.' } };
//     }
// }
// mcpServer.resource('navi_getAgentAvailableRewards', 'navi://agent/rewards/available', async (uri, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetAgentAvailableRewards(uri, {}) );

// NEW TOOL: navi_getAgentAvailableRewards
const getAgentAvailableRewardsToolSchema = z.object({});
type GetAgentAvailableRewardsToolArgs = z.infer<typeof getAgentAvailableRewardsToolSchema>;

async function handleGetAgentAvailableRewardsTool(_args: GetAgentAvailableRewardsToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] }; 
    }}
    const { client: naviClient, primaryAccount } = naviSDKInstances;
    const agentAddress = primaryAccount.address;

    try {
        const rewards: PoolRewards[] = await naviClient.getAddressAvailableRewards(agentAddress, [NaviOptionType.OptionSupply, NaviOptionType.OptionBorrow]);
        
        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify(rewards, null, 2), 
                mimeType: 'application/json' 
            } as TextContent] 
        };
    } catch (e: any) {
        console.error(`Error fetching available rewards for agent ${agentAddress} in tool:`, e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to fetch available rewards.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAgentAvailableRewards',
    {
        description: "Gets all available (unclaimed) rewards for the agent.",
        inputSchema: getAgentAvailableRewardsToolSchema.shape
    },
    handleGetAgentAvailableRewardsTool
);

// --- Claim All Agent Rewards Tool ---
const claimAllAgentRewardsToolSchema = z.object({
    updateOracle: z.boolean().optional().default(true).describe('Whether to update oracle prices before claiming rewards.')
});
type ClaimAllAgentRewardsToolArgs = z.infer<typeof claimAllAgentRewardsToolSchema>;
async function handleClaimAllAgentRewards(args: ClaimAllAgentRewardsToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized'} as TextContent]}; }}
    const { primaryAccount } = naviSDKInstances;
    try {
        console.log(`Attempting to claim all rewards for ${primaryAccount.address} with updateOracle: ${args.updateOracle}`);
        const result = await primaryAccount.claimAllRewards(args.updateOracle);
        console.log('Claim all rewards transaction result:', result);
        if (result?.effects?.status?.status === 'success') {
            return { content: [{ type: 'text', text: `Successfully claimed all rewards. Digest: ${result.digest}` } as TextContent] };
        } else {
            return { isError: true, content: [{ type: 'text', text: `Claim all rewards failed. Status: ${result?.effects?.status?.status}, Error: ${result?.effects?.status?.error || 'Unknown'}` } as TextContent] };
        }
    } catch (error: any) {
        console.error(`Error claiming all rewards for ${primaryAccount.address}:`, error);
        return { isError: true, content: [{ type: 'text', text: `Error claiming all rewards: ${error.message || 'Unknown'}` } as TextContent] };
    }
}
mcpServer.registerTool('navi_claimAllAgentRewards', { description: 'Claims all available rewards for the agent.', inputSchema: claimAllAgentRewardsToolSchema.shape }, handleClaimAllAgentRewards);

// --- Get Dynamic Health Factor Resource (Agent Specific) --- (Now a Tool)
const getAgentDynamicHealthFactorParamsSchemaForResource = z.object({ // Schema for original resource parsing
    assetSymbol: z.string().describe("The symbol of the asset involved in the hypothetical change (e.g., SUI, USDC)." ),
    supplyChangeAmount: z.string().default('0').transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "supplyChangeAmount must be a string representing a number"}).describe("The change in supplied amount (human-readable, use negative for withdrawal simulation). Default 0."),
    borrowChangeAmount: z.string().default('0').transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "borrowChangeAmount must be a string representing a number"}).describe("The change in borrowed amount (human-readable, use negative for repayment simulation). Default 0."),
    isIncrease: z.string().optional().default('true').transform(val => val.toLowerCase() === 'true').describe("True if supply/borrow change is an increase, false if it's a decrease. Applies to the primary change amount (defaults to true).")
});

// Original handler for the RESOURCE
// async function handleGetAgentDynamicHealthFactor(uri: URL, params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; } }
//     const { client: naviClient, primaryAccount } = naviSDKInstances;
//     const agentAddress = primaryAccount.address; 
//     try {
//         const dataToParse = {
//             assetSymbol: typeof params.assetSymbol === 'string' ? params.assetSymbol : undefined,
//             supplyChangeAmount: params.supplyChangeAmount as string | undefined, // Zod will handle default
//             borrowChangeAmount: params.borrowChangeAmount as string | undefined, // Zod will handle default
//             isIncrease: params.isIncrease as string | undefined // Zod will handle default
//         };
//         if (dataToParse.assetSymbol === undefined) {
//             return { contents: [], _meta: { error: 'assetSymbol parameter is required for dynamic health factor.' } };
//         }
//         // Use the resource-specific schema for parsing string params from URI
//         const validatedParams = getAgentDynamicHealthFactorParamsSchemaForResource.parse(dataToParse);
//         const coinInfo = mapAssetSymbolToCoinInfo(validatedParams.assetSymbol);
//         if (!coinInfo) {
//             return { contents: [], _meta: { error: `Invalid asset symbol '${validatedParams.assetSymbol}' for dynamic health factor.` } };
//         }
//         const supplyChangeSmallest = amountToSmallestUnit(validatedParams.supplyChangeAmount, coinInfo);
//         const borrowChangeSmallest = amountToSmallestUnit(validatedParams.borrowChangeAmount, coinInfo);
//         console.log(`Predicting health factor for AGENT (${agentAddress}), asset: ${validatedParams.assetSymbol}, supplyChange: ${validatedParams.supplyChangeAmount}, borrowChange: ${validatedParams.borrowChangeAmount}, isIncrease: ${validatedParams.isIncrease}`);
//         const predictedHealthFactor = await naviClient.getDynamicHealthFactor( agentAddress, coinInfo, Number(supplyChangeSmallest), Number(borrowChangeSmallest), validatedParams.isIncrease );
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify({ suiAddress: agentAddress, predictedHealthFactor }, null, 2),
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error('Error getting agent dynamic health factor:', e);
//         if (e instanceof z.ZodError) {
//             return { contents: [], _meta: { error: `Invalid parameters for agent dynamic health factor: ${JSON.stringify(e.errors)}` } };
//         }
//         return { contents: [], _meta: { error: e.message || 'Failed to get agent dynamic health factor.' } };
//     }
// }
// mcpServer.resource('navi_getAgentDynamicHealthFactor', new ResourceTemplate('navi://agent/predict_health_factor?assetSymbol={assetSymbol}&supplyChangeAmount={supplyChangeAmount}&borrowChangeAmount={borrowChangeAmount}&isIncrease={isIncrease}', { list: undefined }), async (uri, variables: McpResourceVariables, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetAgentDynamicHealthFactor(uri, variables));

// NEW TOOL: navi_getAgentDynamicHealthFactor
const getAgentDynamicHealthFactorToolSchema = z.object({
    assetSymbol: z.string().describe("The symbol of the asset involved in the hypothetical change (e.g., SUI, USDC)."),
    supplyChangeAmount: z.number().default(0).describe("The change in supplied amount (human-readable, use negative for withdrawal simulation). Default 0."),
    borrowChangeAmount: z.number().default(0).describe("The change in borrowed amount (human-readable, use negative for repayment simulation). Default 0."),
    // Consider if isIncrease is still needed if supply/borrowChangeAmount can be negative.
    // For now, keeping it as per original resource logic for direct adaptation.
    isIncrease: z.boolean().optional().default(true).describe("True if the primary change (e.g. supplyChange if non-zero, else borrowChange) is an increase. If both are zero, this has no effect. If one is positive and other negative, it applies to the positive one. Advise: Use signed numbers for amounts instead for clarity.")
});
type GetAgentDynamicHealthFactorToolArgs = z.infer<typeof getAgentDynamicHealthFactorToolSchema>;

async function handleGetAgentDynamicHealthFactorTool(args: GetAgentDynamicHealthFactorToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] }; 
    }}
    const { client: naviClient, primaryAccount } = naviSDKInstances;
    const agentAddress = primaryAccount.address; 

    try {
        const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
        if (!coinInfo) {
            return { isError: true, content: [{ type: 'text', text: `Invalid asset symbol '${args.assetSymbol}' for dynamic health factor.` } as TextContent] };
        }

        const supplyChangeSmallest = amountToSmallestUnit(args.supplyChangeAmount, coinInfo);
        const borrowChangeSmallest = amountToSmallestUnit(args.borrowChangeAmount, coinInfo);
        
        console.log(`[Tool] Predicting health factor for AGENT (${agentAddress}), asset: ${args.assetSymbol}, supplyChange: ${args.supplyChangeAmount}, borrowChange: ${args.borrowChangeAmount}, isIncrease: ${args.isIncrease}`);
        
        const predictedHealthFactor = await naviClient.getDynamicHealthFactor( 
            agentAddress, 
            coinInfo, 
            Number(supplyChangeSmallest), 
            Number(borrowChangeSmallest), 
            args.isIncrease // SDK might interpret this based on the amounts if one is non-zero
        );
        
        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify({ suiAddress: agentAddress, predictedHealthFactor }, null, 2), 
                mimeType: 'application/json' 
            } as TextContent] 
        };
    } catch (e: any) {
        console.error('Error in handleGetAgentDynamicHealthFactorTool:', e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to get agent dynamic health factor.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAgentDynamicHealthFactor',
    {
        description: "Predicts the agent's health factor after a hypothetical change in supply or borrow for a specific asset.",
        inputSchema: getAgentDynamicHealthFactorToolSchema.shape
    },
    handleGetAgentDynamicHealthFactorTool
);

// --- Get Specific Reserve Detail Resource --- (Now a Tool)
const getReserveDetailParamsSchemaForResource = z.object({ // Original schema for resource parsing
    assetSymbol: z.string().describe("The symbol of the asset for which to get reserve details (e.g., SUI, USDC).")
});

// Original handler for the RESOURCE
// async function handleGetReserveDetail(uri: URL, params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; } }
//     const { client: naviClient } = naviSDKInstances;
//     try {
//         const assetSymbolParam = params.assetSymbol;
//         if (typeof assetSymbolParam !== 'string') {
//             return { contents: [], _meta: { error: 'assetSymbol parameter is required and must be a string.' } };
//         }
//         // Use resource-specific schema for parsing
//         const validatedParams = getReserveDetailParamsSchemaForResource.parse({ assetSymbol: assetSymbolParam });
//         
//         const coinInfo = mapAssetSymbolToCoinInfo(validatedParams.assetSymbol);
//         if (!coinInfo) {
//             return { contents: [], _meta: { error: `Asset symbol '${validatedParams.assetSymbol}' not found.` } };
//         }
//         const reserveDetail: SuiObjectResponse = await naviClient.getReserveDetail(coinInfo);
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify(reserveDetail.data, null, 2), // .data contains the object fields
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error(`Error fetching reserve detail for ${params.assetSymbol}:`, e);
//         if (e instanceof z.ZodError) { return { contents: [], _meta: { error: `Invalid parameters for reserve detail: ${JSON.stringify(e.errors)}` } }; }
//         return { contents: [], _meta: { error: e.message || 'Failed to fetch reserve detail.' } };
//     }
// }
// mcpServer.resource(
//     'navi_getReserveDetail',
//     new ResourceTemplate('navi://market_info/reserve_detail/{assetSymbol}', { list: undefined }),
//     async (uri, variables: McpResourceVariables, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetReserveDetail(uri, variables)
// );

// NEW TOOL: navi_getReserveDetail
const getReserveDetailToolSchema = z.object({
    assetSymbol: z.string().describe("The symbol of the asset for which to get reserve details (e.g., SUI, USDC).")
});
type GetReserveDetailToolArgs = z.infer<typeof getReserveDetailToolSchema>;

async function handleGetReserveDetailTool(args: GetReserveDetailToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] }; 
    }}
    const { client: naviClient } = naviSDKInstances;

    try {
        const coinInfo = mapAssetSymbolToCoinInfo(args.assetSymbol);
        if (!coinInfo) {
            return { isError: true, content: [{ type: 'text', text: `Asset symbol '${args.assetSymbol}' not found.` } as TextContent] };
        }
        
        const reserveDetail: SuiObjectResponse = await naviClient.getReserveDetail(coinInfo);
        
        // Ensure reserveDetail.data exists and is what we want to stringify
        const dataToReturn = reserveDetail && reserveDetail.data ? reserveDetail.data : {};

        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify(dataToReturn, null, 2),
                mimeType: 'application/json' 
            } as TextContent] 
        };
    } catch (e: any) {
        console.error(`Error in handleGetReserveDetailTool for ${args.assetSymbol}:`, e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to fetch reserve detail.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getReserveDetail',
    {
        description: "Gets detailed information about a specific asset reserve in the Navi Protocol.",
        inputSchema: getReserveDetailToolSchema.shape
    },
    handleGetReserveDetailTool
);

// --- Stake SUI for vSUI Tool --- (UNCOMMENTING AND ENSURING REFINEMENTS ARE PRESENT)
const stakeSuiToolSchema = z.object({
    amount: z.number().positive('Amount to stake must be positive (e.g., 1.0 for 1 SUI).').describe('The human-readable amount of SUI to stake.')
});
type StakeSuiToolArgs = z.infer<typeof stakeSuiToolSchema>;
async function handleStakeSuiForVSui(args: StakeSuiToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized'} as TextContent]}; }
    const { primaryAccount } = naviSDKInstances;
    const suiCoinInfo = mapAssetSymbolToCoinInfo('SUI');
    if (!suiCoinInfo) { return { isError: true, content: [{type: 'text', text: 'SUI CoinInfo not found in mappers.'} as TextContent]};}
    try {
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, suiCoinInfo);
        if (Number(amountInSmallestUnit) < 1e9) { // Min 1 SUI (10^9 MIST) SDK assertion
            return { isError: true, content: [{type: 'text', text: 'Stake amount must be at least 1 SUI.'} as TextContent]};
        }
        console.log(`Attempting stakeSuiToVoloSui: ${args.amount} SUI (${Number(amountInSmallestUnit)} smallest units) for ${primaryAccount.address}`);
        const result = await primaryAccount.stakeSuitoVoloSui(Number(amountInSmallestUnit));
        console.log('Stake SUI result:', result);

        if (result?.effects?.status?.status === 'success') {
            await sleep(5000); // Wait 5 seconds for indexer to attempt to get updated portfolio
            let vsuiReceivedHuman = 0;
            try {
                const portfolio = await getAddressPortfolio(primaryAccount.address, false, primaryAccount.client, true);
                const vsuiSymbolMapped = mapAssetSymbolToCoinInfo('VSUI');
                if (vsuiSymbolMapped) {
                    const vsuiKey = Object.keys(Object.fromEntries(portfolio)).find(k => k.toLowerCase() === vsuiSymbolMapped.symbol.toLowerCase());
                    if (vsuiKey) {
                        const portfolioEntry = portfolio.get(vsuiKey);
                        if (portfolioEntry) {
                           vsuiReceivedHuman = portfolioEntry.supplyBalance; 
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not fetch portfolio post-stake to confirm vSUI amount:", e);
            }

            return { 
                content: [{ 
                    type: 'text', 
                    text: `Successfully submitted stake of ${args.amount} SUI. Digest: ${result.digest}.` 
                } as TextContent] 
            };
        } else {
            return handleSdkError(result?.effects?.status?.error || 'Stake SUI failed without specific error message', "stakeSuiForVSui");
        }
    } catch (error: any) {
        return handleSdkError(error, "stakeSuiForVSui");
    }
}
mcpServer.registerTool('navi_stakeSuiForVSui', { description: 'Stakes SUI to receive vSUI (VoloSui). Minimum 1 SUI.', inputSchema: stakeSuiToolSchema.shape }, handleStakeSuiForVSui);

// --- Unstake vSUI for SUI Tool --- (UNCOMMENTING AND ENSURING REFINEMENTS ARE PRESENT)
const unstakeVSuiToolSchema = z.object({
    amount: z.number().positive('Amount to unstake must be positive (e.g., 1.0 for 1 vSUI).').optional().describe('Human-readable vSUI amount. If omitted, unstakes all. Min 1 vSUI if specified.')
});
type UnstakeVSuiToolArgs = z.infer<typeof unstakeVSuiToolSchema>;
async function handleUnstakeVSuiForSui(args: UnstakeVSuiToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { return { isError: true, content: [{type: 'text', text: 'Navi SDK not initialized'} as TextContent]}; }
    const { primaryAccount } = naviSDKInstances;
    
    const vsuiSdkCoinInfo = vSui; // Direct import from navi-sdk for reliable CoinInfo
    console.error(`[SERVER_UNSTAKE] Using vSUI address from SDK: ${vsuiSdkCoinInfo?.address}`);

    let amountToUnstakeSdk: number;
    let originalSuiBalanceHuman = 0;

    try {
        const initialPortfolioForSui = await getAddressPortfolio(primaryAccount.address, false, primaryAccount.client, true);
        const suiKey = Object.keys(Object.fromEntries(initialPortfolioForSui)).find(k => k.toLowerCase() === 'sui');
        if (suiKey) {
            const portfolioEntry = initialPortfolioForSui.get(suiKey);
            if (portfolioEntry) {
                originalSuiBalanceHuman = portfolioEntry.supplyBalance;
            }
        }
    } catch (e) {
        console.warn("Could not fetch initial SUI balance for unstake comparison:", e);
    }

    if (args.amount !== undefined) { 
        if (args.amount <= 0) return { isError: true, content: [{type: 'text', text: 'Unstake amount must be positive if specified.'} as TextContent]};
        if (!vsuiSdkCoinInfo) { return { isError: true, content: [{type: 'text', text: 'vSUI SDK coin info not found internally (critical error).'} as TextContent]}; }
        
        const amountInSmallestUnit = amountToSmallestUnit(args.amount, vsuiSdkCoinInfo); 
        if (Number(amountInSmallestUnit) < 1e9) { 
            return { isError: true, content: [{type: 'text', text: `Unstake amount must be at least 1 vSUI.`} as TextContent]};
        }
        amountToUnstakeSdk = Number(amountInSmallestUnit);
        console.log(`Attempting unstakeSuiFromVoloSui: ${args.amount} vSUI (${amountToUnstakeSdk} smallest units) for ${primaryAccount.address}`);
    } else { 
        console.log(`Attempting to unstake ALL vSUI for ${primaryAccount.address}`);
        try {
            if (!vsuiSdkCoinInfo || !vsuiSdkCoinInfo.address) { // Guard against vsuiSdkCoinInfo being undefined
                 return { isError: true, content: [{type: 'text', text: 'vSUI SDK coin info address not available for pre-check.'} as TextContent]};
            }
            const vsuiCoins = await primaryAccount.getCoins(vsuiSdkCoinInfo.address);
            let totalAgentVsuiBalanceSmallestUnits = BigInt(0);
            if (vsuiCoins.data && vsuiCoins.data.length > 0) {
                totalAgentVsuiBalanceSmallestUnits = vsuiCoins.data.reduce((acc, coin) => acc + BigInt(coin.balance), BigInt(0));
            }

            if (totalAgentVsuiBalanceSmallestUnits < BigInt(1e9)) {
                return { isError: true, content: [{type: 'text', text: 'No vSUI or insufficient vSUI balance (< 1 vSUI) to perform unstake operation.'} as TextContent]};
            }
            amountToUnstakeSdk = -1; 
        } catch (e: any) {
            console.error(`Error pre-fetching vSUI balance for unstake-all: ${e.message}.`);
            return handleSdkError(e, "preUnstakeCheckVSuiBalance");
        }
    }

    try {
        const result = await primaryAccount.unstakeSuiFromVoloSui(amountToUnstakeSdk);
        console.log('Unstake vSUI transaction result:', result);
        if (result?.effects?.status?.status === 'success') {
            await sleep(5000); 
            let suiReceivedHuman = 0;
            try {
                const finalPortfolio = await getAddressPortfolio(primaryAccount.address, false, primaryAccount.client, true);
                const suiKey = Object.keys(Object.fromEntries(finalPortfolio)).find(k => k.toLowerCase() === 'sui');
                if (suiKey) {
                    const portfolioEntry = finalPortfolio.get(suiKey);
                    if (portfolioEntry) {
                        const finalSuiBalanceHuman = portfolioEntry.supplyBalance;
                        suiReceivedHuman = finalSuiBalanceHuman - originalSuiBalanceHuman; 
                    }
                }
            } catch (e) {
                console.warn("Could not fetch portfolio post-unstake to confirm SUI received amount:", e);
            }
            return { 
                content: [{ 
                    type: 'text', 
                    text: `Successfully submitted unstake vSUI. Digest: ${result.digest}. Approx. SUI change in portfolio: ${suiReceivedHuman.toFixed(4)} SUI (please verify via explorer).` 
                } as TextContent] 
            };
        } else {
            return handleSdkError(result?.effects?.status?.error || 'Unstake vSUI failed without specific error message', "unstakeVSuiForSui");
        }
    } catch (error: any) {
        return handleSdkError(error, "unstakeVSuiForSui");
    }
}
mcpServer.registerTool('navi_unstakeVSuiForSui', { description: 'Unstakes vSUI (VoloSui) to receive SUI. Min 1 vSUI if amount specified.', inputSchema: unstakeVSuiToolSchema.shape }, handleUnstakeVSuiForSui);

// --- Get Claimed Rewards History Resource --- (Now a Tool)
const getRewardsHistoryParamsSchemaForResource = z.object({ // Original schema for resource parsing
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).refine(val => val === undefined || (Number.isInteger(val) && val > 0), { message: "Page must be a positive integer if provided."}),
    size: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined).refine(val => val === undefined || (Number.isInteger(val) && val > 0), { message: "Size must be a positive integer if provided."})
});

// Original handler for the RESOURCE
// async function handleGetAgentRewardsHistory(uri: URL, params: McpResourceVariables): Promise<ReadResourceResult> {
//     if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { return { contents: [], _meta: { error: 'Navi SDK not initialized' } }; } }
//     const { client: naviClient, primaryAccount } = naviSDKInstances;
//     try {
//         // Use resource-specific schema for parsing
//         const validatedParams = getRewardsHistoryParamsSchemaForResource.parse({ 
//             page: params.page, 
//             size: params.size 
//         });
//         
//         const history = await naviClient.getClaimedRewardsHistory(primaryAccount.address, validatedParams.page, validatedParams.size);
//         const contentItem: McpCompatibleContentItem = {
//             uri: uri.href,
//             type: 'text',
//             text: JSON.stringify(history, null, 2),
//             mimeType: 'application/json',
//         };
//         return { contents: [contentItem] };
//     } catch (e: any) {
//         console.error(`Error fetching rewards history for agent ${primaryAccount.address}:`, e);
//         if (e instanceof z.ZodError) { return { contents: [], _meta: { error: `Invalid parameters for rewards history: ${JSON.stringify(e.errors)}` } }; }
//         return { contents: [], _meta: { error: e.message || 'Failed to fetch rewards history.' } };
//     }
// }
// mcpServer.resource(
//     'navi_getAgentRewardsHistory',
//     new ResourceTemplate('navi://agent/rewards/history?page={page}&size={size}', { list: undefined }),
//     async (uri, variables: McpResourceVariables, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => handleGetAgentRewardsHistory(uri, variables)
// );
// mcpServer.resource(
//     'navi_getAgentRewardsHistory_default',
//     'navi://agent/rewards/history',
//     async (uri: URL, _extra: McpRequestHandlerExtra): Promise<ReadResourceResult> => {
//         return handleGetAgentRewardsHistory(uri, {}); 
//     }
// );

// NEW TOOL: navi_getAgentRewardsHistory
const getAgentRewardsHistoryToolSchema = z.object({
    page: z.number().int().positive("Page number must be a positive integer.").optional().describe("Page number (1-indexed) for pagination. Omitting implies first page or default behavior."),
    size: z.number().int().positive("Size must be a positive integer.").optional().describe("Number of items per page for pagination. Omitting implies default size.")
});
type GetAgentRewardsHistoryToolArgs = z.infer<typeof getAgentRewardsHistoryToolSchema>;

async function handleGetAgentRewardsHistoryTool(args: GetAgentRewardsHistoryToolArgs, _extra: McpRequestHandlerExtra): Promise<CallToolResult> {
    if (!naviSDKInstances) { await initializeNaviConnection(); if (!naviSDKInstances) { 
        return { isError: true, content: [{ type: 'text', text: 'Navi SDK not initialized' } as TextContent] }; 
    }}
    const { client: naviClient, primaryAccount } = naviSDKInstances;

    try {
        // Args.page and args.size are now numbers (or undefined) directly from Zod schema
        const history = await naviClient.getClaimedRewardsHistory(primaryAccount.address, args.page, args.size);
        
        return { 
            content: [{ 
                type: 'text', 
                text: JSON.stringify(history, null, 2),
                mimeType: 'application/json' 
            } as TextContent] 
        };
    } catch (e: any) {
        console.error(`Error in handleGetAgentRewardsHistoryTool for agent ${primaryAccount.address}:`, e);
        return { isError: true, content: [{ type: 'text', text: e.message || 'Failed to fetch rewards history.' } as TextContent] };
    }
}

mcpServer.registerTool(
    'navi_getAgentRewardsHistory',
    {
        description: "Gets the agent's history of claimed rewards, with optional pagination.",
        inputSchema: getAgentRewardsHistoryToolSchema.shape
    },
    handleGetAgentRewardsHistoryTool
);

console.error('[NaviMCPAgent] McpServer instance created. Ping, PoolInfo, Agent Portfolio & HealthFactor, Deposit, Withdraw, Borrow, Repay, Swap, Rewards, AgentDynamicHF, Staking, ReserveDetail, RewardsHistory tools/resources registered.'); 

// Helper function for sleep
function sleep(ms: number): Promise<void> { 
    return new Promise(resolve => setTimeout(resolve, ms)); 
} 