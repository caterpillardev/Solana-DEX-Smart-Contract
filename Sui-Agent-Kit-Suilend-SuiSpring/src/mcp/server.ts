import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';

// Zod schemas imports
import {
    getSuiBalanceSchema, getTokenMetadataSchema, getUserTokenBalanceSchema, 
    transferSuiSchema, /* transferFungibleTokenSchema, */ getUserRecentTxsSchema,
    transferSuiToManySchema,
    transferFungTokensToManySchema
} from './zodSchemas/mystenSuiSchemas';
import {
    formatTokenAmountSchema,
    parseTokenAmountSchema,
    shortenAddressSchema,
    getCoinTypeBySymbolSchema
} from './zodSchemas/commonSchemas';
import {
    getLstSuiExchangeRateSchema,
    getUserLstDetailsSchema,
    discoverLstPoolsSchema,
    getSpringSuiPoolApysSchema,
    stakeSuiForSpringSuiLstSchema,
    stakeSuiForParaSuiSchema,
    redeemSpringSuiLstForSuiSchema
} from './zodSchemas/springSuiSchemas';
/*
import { getAllSteammPoolsSchema, findSteammSwapRoutesSchema, executeSteammSwapSchema, addSteammLiquiditySchema, removeSteammLiquiditySchema, getSteammPoolsExtendedSchema, getSteammSwapQuoteSchema } from './zodSchemas/steammSchemas';
*/
import {
    getSuilendMarketAssetsSchema,
    ensureSuilendObligationSchema,
    depositToSuilendSchema,
    getObligationDetailsSchema,
    withdrawFromSuilendSchema,
    borrowFromSuilendSchema,
    repayToSuilendSchema,
    getObligationHistorySchema,
    getUserObligationInfoSchema
} from './zodSchemas/suilendSchemas';
import { InternalSdkClientManager } from './internalSdkClientManager';
import {
    MvpWalletAdapter,
    SimpleMvpWalletAdapter
} from '../protocols/mystensui/mystenSui.actions';
import { SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Handlers imports
import {
    handleGetSuiBalance, handleGetTokenMetadata, handleGetUserTokenBalance, 
    handleTransferSui, /* handleTransferFungibleToken, */ handleGetUserRecentTxs,
    handleTransferSuiToMany,
    handleTransferFungTokensToMany // Added for multi-send fungible tokens
} from './toolHandlers/mystenSuiHandlers';
import {
    handleFormatTokenAmount,
    handleParseTokenAmount,
    handleShortenAddress,
    handleGetCoinTypeBySymbol
} from './toolHandlers/commonHandlers';
import {
    handleGetLstSuiExchangeRate,
    handleGetUserLstDetails,
    handleDiscoverLstPools,
    handleGetSpringSuiPoolApys,
    handleStakeSuiForSpringSuiLst,
    handleStakeSuiForParaSui,
    handleRedeemLstForSui
} from './toolHandlers/springSuiHandlers';
/*
import { handleGetAllSteammPools, handleFindSteammSwapRoutes, handleExecuteSteammSwap, handleAddSteammLiquidity, handleRemoveSteammLiquidity, handleGetSteammPoolsExtended, handleGetSteammSwapQuote } from './toolHandlers/steammHandlers';
*/
import {
    handleGetSuilendMarketAssets,
    handleEnsureSuilendObligation,
    handleDepositToSuilend,
    handleGetObligationDetails,
    handleWithdrawFromSuilend,
    handleBorrowFromSuilend,
    handleRepayToSuilend,
    handleGetObligationHistory,
    handleGetUserObligationInfo
} from './toolHandlers/suilendHandlers';

const SUI_MAINNET_PRIVATE_KEY_BECH32 = process.env.SUI_MAINNET_PRIVATE_KEY || "your_test_suiprivkey1_here_if_not_in_env";

async function main() {
    const server = new McpServer({
        name: "DeFiProtocolGateway",
        version: "1.0.0",
        description: "MCP Server for interacting with various Sui DeFi protocols via a TypeScript SDK.",
        tools: [],
    });

    const clientManager = new InternalSdkClientManager();

    // --- Set Active User Wallet Context ---
    if (SUI_MAINNET_PRIVATE_KEY_BECH32 && SUI_MAINNET_PRIVATE_KEY_BECH32 !== "your_test_suiprivkey1_here_if_not_in_env") {
        try {
            const suiClient = clientManager.getSuiClientInstance('mainnet');
            
            const { schema, secretKey: privateKeyBytes } = decodeSuiPrivateKey(SUI_MAINNET_PRIVATE_KEY_BECH32);
            let keypair: Ed25519Keypair;

            if (schema === 'ED25519') {
                keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
            } else {
                throw new Error(`Unsupported private key schema: ${schema}. Only ED25519 is currently handled for Bech32 keys.`);
            }
            
            const activeWallet = new SimpleMvpWalletAdapter(keypair, suiClient);
            clientManager.setActiveUserWallet(activeWallet);

        } catch (error: any) {
            console.error("[MCP Server] ERRO DETALHADO no bloco try/catch da inicialização da carteira:", error);
            const detailedErrorMessage = error.stack ? error.stack : error.message;
            throw new Error(`[MCP Server] Failed to initialize and set active user wallet from SUI_MAINNET_PRIVATE_KEY: ${detailedErrorMessage}${error.message.includes("Invalid Private Key") ? " Hint: Ensure SUI_MAINNET_PRIVATE_KEY in your .env file is a valid Bech32 encoded private key (starts with suiprivkey1...)." : ""}`);
        }
    } else {
        let envKeyStatus = "não definida ou vazia.";
        if (SUI_MAINNET_PRIVATE_KEY_BECH32 === "your_test_suiprivkey1_here_if_not_in_env") {
            envKeyStatus = "definida como placeholder 'your_test_suiprivkey1_here_if_not_in_env'.";
        }
        throw new Error(`[MCP Server] SUI_MAINNET_PRIVATE_KEY ${envKeyStatus} This is required for the server to operate with a default active user context.`);
    }

    // Registering tools with the server
    registerMcpTools(server, clientManager);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

// Registering tools with the server
export function registerMcpTools(server: McpServer, clientManager: InternalSdkClientManager) {
    // MystenSui Tools
    server.tool('mystenSui_getSuiBalance', getSuiBalanceSchema.shape, (inputs: z.infer<typeof getSuiBalanceSchema>) => handleGetSuiBalance(inputs, clientManager));
    server.tool('mystenSui_getTokenMetadata', getTokenMetadataSchema.shape, (inputs: z.infer<typeof getTokenMetadataSchema>) => handleGetTokenMetadata(inputs, clientManager));
    server.tool('mystenSui_getUserTokenBalance', getUserTokenBalanceSchema.shape, (inputs: z.infer<typeof getUserTokenBalanceSchema>) => handleGetUserTokenBalance(inputs, clientManager));
    server.tool('mystenSui_transferSui', transferSuiSchema.shape, (inputs: z.infer<typeof transferSuiSchema>) => handleTransferSui(inputs, clientManager));
    server.tool('mystenSui_transferSuiToMany', transferSuiToManySchema.shape, (inputs: z.infer<typeof transferSuiToManySchema>) => handleTransferSuiToMany(inputs, clientManager));
    server.tool('mystenSui_transferFungTokensToMany', transferFungTokensToManySchema.shape, (inputs: z.infer<typeof transferFungTokensToManySchema>) => handleTransferFungTokensToMany(inputs, clientManager));
    server.tool('mystenSui_getUserRecentTxs', getUserRecentTxsSchema.shape, (inputs: z.infer<typeof getUserRecentTxsSchema>) => handleGetUserRecentTxs(inputs, clientManager));

    // Common Utility Tools
    server.tool('common_formatTokenAmount', formatTokenAmountSchema.shape, (inputs: z.infer<typeof formatTokenAmountSchema>) => handleFormatTokenAmount(inputs)); 
    server.tool('common_parseTokenAmount', parseTokenAmountSchema.shape, (inputs: z.infer<typeof parseTokenAmountSchema>) => handleParseTokenAmount(inputs)); 
    server.tool('common_shortenAddress', shortenAddressSchema.shape, (inputs: z.infer<typeof shortenAddressSchema>) => handleShortenAddress(inputs)); 
    server.tool('common_getCoinTypeBySymbol', getCoinTypeBySymbolSchema.shape, (inputs: z.infer<typeof getCoinTypeBySymbolSchema>) => handleGetCoinTypeBySymbol(inputs)); 

    // SpringSui Tools
    server.tool('springSui_getLstSuiExchangeRate', 
        getLstSuiExchangeRateSchema._def.schema.shape,
        (inputs: z.infer<typeof getLstSuiExchangeRateSchema>) => handleGetLstSuiExchangeRate(inputs, clientManager)
    );
    server.tool('springSui_getUserLstDetails', getUserLstDetailsSchema.shape, (inputs: z.infer<typeof getUserLstDetailsSchema>) => handleGetUserLstDetails(inputs, clientManager));
    server.tool('springSui_discoverLstPools', discoverLstPoolsSchema.shape, (inputs: z.infer<typeof discoverLstPoolsSchema>) => handleDiscoverLstPools(inputs, clientManager));
    server.tool('springSui_getSpringSuiPoolApys', getSpringSuiPoolApysSchema.shape, (inputs: z.infer<typeof getSpringSuiPoolApysSchema>) => handleGetSpringSuiPoolApys(inputs, clientManager));
    server.tool('springSui_stakeSuiForSpringSuiLst', stakeSuiForSpringSuiLstSchema.shape, (inputs: z.infer<typeof stakeSuiForSpringSuiLstSchema>) => {
        return handleStakeSuiForSpringSuiLst(inputs, clientManager);
    });
    server.tool('springSui_stakeSuiForParaSui', stakeSuiForParaSuiSchema.shape, (inputs: z.infer<typeof stakeSuiForParaSuiSchema>) => {
        return handleStakeSuiForParaSui(inputs, clientManager);
    });
    server.tool('springSui_redeemSpringSuiLstForSui', redeemSpringSuiLstForSuiSchema.shape, (inputs: z.infer<typeof redeemSpringSuiLstForSuiSchema>) => handleRedeemLstForSui(inputs, clientManager));
    
    // Steamm Tools (Commented)
    /*
    server.tool('steamm_getAllSteammPools', getAllSteammPoolsSchema.shape, (inputs) => handleGetAllSteammPools(inputs, clientManager));
    server.tool('steamm_findSteammSwapRoutes', findSteammSwapRoutesSchema.shape, (inputs) => handleFindSteammSwapRoutes(inputs, clientManager));
    server.tool('steamm_executeSteammSwap', executeSteammSwapSchema.shape, (inputs) => handleExecuteSteammSwap(inputs, clientManager));
    server.tool('steamm_addSteammLiquidity', addSteammLiquiditySchema.shape, (inputs) => handleAddSteammLiquidity(inputs, clientManager));
    server.tool('steamm_removeSteammLiquidity', removeSteammLiquiditySchema.shape, (inputs) => handleRemoveSteammLiquidity(inputs, clientManager));
    server.tool('steamm_getSteammPoolsExtended', getSteammPoolsExtendedSchema.shape, (inputs) => handleGetSteammPoolsExtended(inputs, clientManager));
    server.tool('steamm_getSteammSwapQuote', getSteammSwapQuoteSchema.shape, (inputs) => handleGetSteammSwapQuote(inputs, clientManager));
    */

    // Suilend Tools
    server.tool('suilend_getSuilendMarketAssets', getSuilendMarketAssetsSchema.shape, (inputs: z.infer<typeof getSuilendMarketAssetsSchema>) => handleGetSuilendMarketAssets(inputs, clientManager));
    server.tool('suilend_ensureSuilendObligation', ensureSuilendObligationSchema.shape, (inputs: z.infer<typeof ensureSuilendObligationSchema>) => handleEnsureSuilendObligation(inputs, clientManager));
    server.tool('suilend_depositToSuilend', depositToSuilendSchema.shape, (inputs: z.infer<typeof depositToSuilendSchema>) => handleDepositToSuilend(inputs, clientManager));
    server.tool('suilend_getObligationDetails', getObligationDetailsSchema.shape, (inputs: z.infer<typeof getObligationDetailsSchema>) => handleGetObligationDetails(inputs, clientManager));
    server.tool('suilend_withdrawFromSuilend', withdrawFromSuilendSchema.shape, (inputs: z.infer<typeof withdrawFromSuilendSchema>) => handleWithdrawFromSuilend(inputs, clientManager));
    server.tool('suilend_borrowFromSuilend', borrowFromSuilendSchema.shape, (inputs: z.infer<typeof borrowFromSuilendSchema>) => handleBorrowFromSuilend(inputs, clientManager));
    server.tool('suilend_repayToSuilend', repayToSuilendSchema.shape, (inputs: z.infer<typeof repayToSuilendSchema>) => handleRepayToSuilend(inputs, clientManager));
    server.tool('suilend_getObligationHistory', getObligationHistorySchema.shape, (inputs: z.infer<typeof getObligationHistorySchema>) => handleGetObligationHistory(inputs, clientManager));
    server.tool('suilend_getUserObligationInfo', getUserObligationInfoSchema.shape, (inputs: z.infer<typeof getUserObligationInfoSchema>) => handleGetUserObligationInfo(inputs, clientManager));
}

main().catch(error => {
    console.error('[MCP Server] CRITICAL ERROR DURING SERVER INITIALIZATION):', error);
    process.exit(1);
}); 