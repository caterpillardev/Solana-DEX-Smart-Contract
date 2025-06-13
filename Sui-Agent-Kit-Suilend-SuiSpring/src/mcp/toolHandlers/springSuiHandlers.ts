import { z } from 'zod';
import {
    getLstSuiExchangeRateSchema,
    getUserLstDetailsSchema,
    discoverLstPoolsSchema,
    getSpringSuiPoolApysSchema,
    stakeSuiForSpringSuiLstSchema,
    stakeSuiForParaSuiSchema,
    redeemSpringSuiLstForSuiSchema
} from '../zodSchemas/springSuiSchemas';
import {
    discoverSpringSuiLstPools as sdkDiscoverSpringSuiLstPools,
    getUserLstDetails as sdkGetUserLstDetails,
    getLstSuiExchangeRate as sdkGetLstSuiExchangeRate,
    getSpringSuiPoolApys as sdkGetSpringSuiPoolApys,
    stakeSuiForSpringSuiLst as sdkStakeSuiForSpringSuiLst,
    stakeSuiForParaSui as sdkStakeSuiForParaSui,
    redeemSpringSuiLstForSui as sdkRedeemSpringSuiLstForSui
} from '@/protocols/springsui/springsui.actions';
import { InternalSdkClientManager } from '../internalSdkClientManager';
import { Transaction } from '@mysten/sui/transactions';
import { LstClient } from '@suilend/springsui-sdk/client';
import { SUI_DECIMALS } from '@mysten/sui/utils';
import BigNumber from 'bignumber.js';
import { PARA_SUI_MAINNET_COIN_TYPE } from '@/protocols/springsui/springsui.config';
import { McpToolOutput, PreparedTransactionOutput, createErrorOutput, createTextOutput, createPreparedTransactionOutput } from '../mcpUtils';
import { SuiNetwork } from '@/protocols/mystensui/mystenSui.config';
import { getTokenMeta } from '@/protocols/mystensui/mystenSui.actions';
import { LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';

interface SimplifiedLstPoolInfo {
    coinType: string; // This is the LST's full type, e.g., "...::afsui::AFSUI"
    symbol?: string;   // Extracted from coinType if possible, e.g., "AFSUI"
    lstPoolId: string; // This is the ID of the LiquidStakingObjectInfo (Market ID)
    // weightHookId could also be included if deemed essential for a summary
}

export async function handleGetLstSuiExchangeRate(
    inputs: z.infer<typeof getLstSuiExchangeRateSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const { lstCoinType, symbol, network } = inputs;

    const networkArg = network;
    const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
    let lstObjectInfo: LiquidStakingObjectInfo | null = null;
    let identifier: string | undefined = symbol || lstCoinType;

    try {
        const allPoolsMap = await sdkDiscoverSpringSuiLstPools(suiClient);

        if (symbol) {
            const targetSymbolUpper = symbol.toUpperCase();
            for (const coinTypeKey in allPoolsMap) {
                const poolInfo = allPoolsMap[coinTypeKey];
                if (poolInfo && poolInfo.type) {
                    // Parseia o símbolo da string do coinType (ex: ...::module_name::SYMBOL_NAME)
                    const typeParts = poolInfo.type.split('::');
                    const potentialSymbolFromType = typeParts[typeParts.length - 1];
                    
                    if (potentialSymbolFromType && potentialSymbolFromType.toUpperCase() === targetSymbolUpper) {
                        lstObjectInfo = poolInfo;
                        identifier = symbol; // Garante que o identificador usado reflita o input
                        break; 
                    }
                }
            }
        } else if (lstCoinType) { 
            // Tentativa 1: Usar lstCoinType como chave direta no mapa de pools
            if (allPoolsMap[lstCoinType]) {
                 lstObjectInfo = allPoolsMap[lstCoinType];
            } else {
                // Tentativa 2: Se não for uma chave direta, iterar e verificar o campo 'type' de cada pool
                // (Isso é redundante se lstCoinType já for o coinTypeKey, mas pode pegar casos onde não é exatamente a chave)
                for (const coinTypeKeyInLoop in allPoolsMap) {
                    const poolInfo = allPoolsMap[coinTypeKeyInLoop];
                    if (poolInfo && poolInfo.type === lstCoinType) {
                        lstObjectInfo = poolInfo;
                        break;
                    }
                }
            }
             identifier = lstCoinType; // Garante que o identificador usado reflita o input
        }

        if (!lstObjectInfo) {
            throw new Error(`Could not find or resolve LST for identifier: ${identifier}`);
        }
        
        const rate = await sdkGetLstSuiExchangeRate(suiClient, lstObjectInfo);
        return createTextOutput({ 
            lstIdentifierUsed: identifier,
            resolvedLstCoinType: lstObjectInfo.type,
            exchangeRate: rate?.toString() || null 
        });
    } catch (error: any) {
        return createErrorOutput(`Failed to get LST/SUI exchange rate for ${identifier}. Details: ${error.message}`, error);
    }
}

export async function handleGetUserLstDetails(
    inputs: z.infer<typeof getUserLstDetailsSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const userAddress = clientManager.getActiveUserAddress();

        if (!userAddress) {
            return createErrorOutput("Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.", new Error("Missing userAddress"));
        }

        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const lstClient = await clientManager.getSpringSuiLstClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>, inputs.lstCoinType);
        
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }

        const result = await sdkGetUserLstDetails(suiClient, lstClient, userAddress, inputs.lstCoinType);
        return createTextOutput(result, 2);
    } catch (error: any) {
        return createErrorOutput(`Failed to get user LST details for ${inputs.lstCoinType} for the active user.`, error);
    }
}

export async function handleDiscoverLstPools(
    inputs: z.infer<typeof discoverLstPoolsSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        // sdkDiscoverSpringSuiLstPools returns Record<string, LiquidStakingObjectInfo>
        // where the key is the LST coin type, and value is LiquidStakingObjectInfo
        const poolsMap: Record<string, LiquidStakingObjectInfo> = await sdkDiscoverSpringSuiLstPools(suiClient);

        const simplifiedPools: SimplifiedLstPoolInfo[] = Object.entries(poolsMap).map(([coinType, poolInfo]) => {
            let symbol = 'N/A';
            const typeParts = coinType.split('::');
            if (typeParts.length > 0) {
                symbol = typeParts[typeParts.length -1]; // Assumes symbol is the last part of the coinType
            }
            
            return {
                coinType: coinType, // The key from the map is the LST's coin type
                symbol: symbol,
                lstPoolId: poolInfo.id, // The ID of the LiquidStakingObjectInfo (Market ID)
                // weightHookId: poolInfo.weightHookId, // Optionally include this
            };
        });

        return createTextOutput(simplifiedPools, 2);
    } catch (error: any) {
        return createErrorOutput('Failed to discover SpringSui LST pools.', error);
    }
}

export async function handleGetSpringSuiPoolApys(
    inputs: z.infer<typeof getSpringSuiPoolApysSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        
        // Since specificCoinType is now mandatory, we don't need to discover all pools first unless the SDK requires it.
        // Assuming sdkGetSpringSuiPoolApys can take a specific coin type and work directly.
        // If sdkGetSpringSuiPoolApys still needs all pools, we would call sdkDiscoverSpringSuiLstPools here.
        // For now, simplifying based on the schema change.
        const pools = await sdkDiscoverSpringSuiLstPools(suiClient); // Assuming this is still needed or beneficial for the SDK call below.
                                                                    // If not, this could be optimized further.

        // The schema now makes specificCoinType mandatory.
        const result = await sdkGetSpringSuiPoolApys(suiClient, pools, inputs.specificCoinType);
        return createTextOutput(result, 2);
    } catch (error: any) {
        // Updated error message to reflect that specificCoinType is always provided.
        return createErrorOutput(`Failed to get SpringSui pool APYs for ${inputs.specificCoinType}.`, error);
    }
}

export async function handleStakeSuiForSpringSuiLst(
    inputs: z.infer<typeof stakeSuiForSpringSuiLstSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const senderAddress = clientManager.getActiveUserAddress();
        const wallet = clientManager.getActiveUserWallet();

        if (!senderAddress || !wallet) {
            return createErrorOutput("Active user context (sender address and wallet) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.", new Error("Missing senderAddress or wallet"));
        }

        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const lstClient = await clientManager.getSpringSuiLstClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>, inputs.lstCoinType);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }

        // Validate amount (already present, good)
        const amountSuiToStakeBn = new BigNumber(inputs.amountSuiToStake);
        if (amountSuiToStakeBn.lte(0)) {
            throw new Error("Amount to stake must be positive.");
        }
        const amountSuiToStakeString = inputs.amountSuiToStake; // Action expects string

        // Call the action that executes the transaction
        const result = await sdkStakeSuiForSpringSuiLst(
            suiClient,
            lstClient,
            wallet,
            amountSuiToStakeString
        );

        if (result && result.digest && result.effects?.status.status === 'success') {
            return createTextOutput({
                message: `Successfully staked ${inputs.amountSuiToStake} SUI for ${inputs.lstCoinType}.`,
                digest: result.digest,
                network: networkArg,
                details: result // Include full response for more info if needed
            }, 2);
        } else {
            const errorDetails = result?.effects?.status?.error || "Transaction execution failed or did not return a digest.";
            throw new Error(`Stake SUI for ${inputs.lstCoinType} failed. ${errorDetails}`);
        }
    } catch (error: any) {
        return createErrorOutput(`Failed to stake SUI for SpringSui LST (${inputs.lstCoinType}). Error: ${error.message}`, error);
    }
}

export async function handleStakeSuiForParaSui(
    inputs: z.infer<typeof stakeSuiForParaSuiSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const senderAddress = clientManager.getActiveUserAddress();
        const wallet = clientManager.getActiveUserWallet();

        if (!senderAddress || !wallet) {
            return createErrorOutput("Active user context (sender address and wallet) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.", new Error("Missing senderAddress or wallet"));
        }
        
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        // For stakeSuiForParaSui, the LST client for ParaSUI is obtained within the action itself.
        // We just need to call the action.

        const amountSuiToStakeBn = new BigNumber(inputs.amountSuiToStake);
        if (amountSuiToStakeBn.lte(0)) {
            throw new Error("Amount to stake must be positive.");
        }
        const amountSuiToStakeString = inputs.amountSuiToStake; // Action expects string

        const result = await sdkStakeSuiForParaSui( // Call the specific executing action
            suiClient,
            wallet,
            amountSuiToStakeString,
            networkArg as Exclude<SuiNetwork, 'custom'>
        );

        if (result && result.digest && result.effects?.status.status === 'success') {
            return createTextOutput({
                message: `Successfully staked ${inputs.amountSuiToStake} SUI for ParaSUI.`,
                digest: result.digest,
                network: networkArg,
                details: result
            }, 2);
        } else {
            const errorDetails = result?.effects?.status?.error || "Transaction execution failed or did not return a digest.";
            throw new Error(`Stake SUI for ParaSUI failed. ${errorDetails}`);
        }
    } catch (error: any) {
        return createErrorOutput(`Failed to stake SUI for ParaSui. Error: ${error.message}`, error);
    }
}

export async function handleRedeemLstForSui(
    inputs: z.infer<typeof redeemSpringSuiLstForSuiSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const senderAddress = clientManager.getActiveUserAddress();
        const wallet = clientManager.getActiveUserWallet();

        if (!senderAddress || !wallet) {
            return createErrorOutput(
                "Active user context (sender address and wallet) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.", 
                new Error("Missing senderAddress or wallet")
            );
        }

        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const lstClient = await clientManager.getSpringSuiLstClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>, inputs.lstCoinType);

        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }
        
        // Call the action, which now executes and returns SuiTransactionBlockResponse or null
        const result = await sdkRedeemSpringSuiLstForSui(
            suiClient,
            lstClient,
            wallet,
            inputs.amountLstToRedeem
        );

        if (result && result.digest && result.effects?.status.status === 'success') {
            return createTextOutput({
                message: `Successfully redeemed ${inputs.amountLstToRedeem} ${inputs.lstCoinType} for SUI.`,
                digest: result.digest,
                network: networkArg,
                details: result // Include full response for more info if needed
            }, 2);
        } else {
            const errorDetails = result?.effects?.status?.error || "Transaction execution failed, did not return a digest, or action returned null.";
            throw new Error(`Redeem ${inputs.lstCoinType} for SUI failed. ${errorDetails}`);
        }

    } catch (error: any) {
        return createErrorOutput(`Failed to execute redeem ${inputs.lstCoinType} for SUI. Error: ${error.message}`, error);
    }
} 