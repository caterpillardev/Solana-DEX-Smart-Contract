import { z } from 'zod';
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
} from '../zodSchemas/suilendSchemas';

import {
    getSuilendMarketAssets as sdkGetSuilendMarketAssets,
    ensureSuilendObligation as sdkEnsureSuilendObligation,
    depositToSuilend as sdkDepositToSuilend,
    getSuilendObligationDetails as sdkGetSuilendObligationDetails,
    withdrawFromSuilend as sdkWithdrawFromSuilend,
    borrowFromSuilend as sdkBorrowFromSuilend,
    repayToSuilend as sdkRepayToSuilend,
    getSuilendObligationHistory as sdkGetSuilendObligationHistory,
    getUserSuilendObligationInfo as sdkGetUserSuilendObligationInfo
} from '@/protocols/suilend/suilend.actions';

import {
    // getSuiClientInstance, // REMOVED
    // getSuilendSdkInstance // REMOVED
} from '../internalSdkClientManager';
import { McpToolOutput, PreparedTransactionOutput, bigNumberReplacer, createPreparedTransactionOutput, createErrorOutput, createTextOutput } from '../mcpUtils';
import { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { CoinStruct } from '@mysten/sui/client';
import { SuilendClient as SuilendSDKClientModule } from '@suilend/sdk'; // Import the class for static access
import BigNumber from 'bignumber.js';
import { SuiNetwork } from '@/protocols/mystensui/mystenSui.config';
import { UserSuilendObligationIdentifiers } from '../../protocols/suilend/suilend.types';
import { InternalSdkClientManager } from '../internalSdkClientManager';
import { SUI_TYPE_ARG } from '../../protocols/suilend/suilend.config';
import { MvpWalletAdapter } from '@/protocols/mystensui/mystenSui.actions';
import { SuilendMarketAssetLarge } from '@/protocols/suilend/suilend.types'; // Ensure SuilendMarketAssetLarge is imported

// Schema Zod para os parâmetros da ferramenta getSuilendMarketAssets
export const SuilendGetMarketAssetsParams = z.object({
  network: z.enum(['mainnet', 'testnet', 'devnet', 'localnet']).optional().default('mainnet'),
  marketId: z.string().optional(),
  format: z.enum(['small', 'large']).optional().default('small')
});

// Define the simplified interface
interface SimplifiedSuilendMarketAsset {
    symbol: string;
    coinType: string;
    priceUsd: string;
    totalDepositedUsd: string;
    totalBorrowedUsd: string;
    depositApyPercent: string;
    borrowApyPercent: string;
    openLtvPercent: number;
}

export async function handleGetSuilendMarketAssets(
    inputs: z.infer<typeof SuilendGetMarketAssetsParams>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const suilendClient = await clientManager.getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClient) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        // sdkGetSuilendMarketAssets always returns SuilendMarketAssetLarge[]
        const fullMarketAssets: SuilendMarketAssetLarge[] = await sdkGetSuilendMarketAssets(suilendClient, suiClient);

        // If format is not 'large', default to small/simplified output.
        if (inputs.format !== 'large') {
            const simplifiedAssets: SimplifiedSuilendMarketAsset[] = fullMarketAssets.map(asset => ({
                symbol: asset.asset.symbol,
                coinType: asset.asset.coinType,
                priceUsd: asset.asset.priceUsd,
                totalDepositedUsd: asset.marketStats.totalDepositedUsd,
                totalBorrowedUsd: asset.marketStats.totalBorrowedUsd,
                depositApyPercent: asset.currentApys.depositApyPercent,
                borrowApyPercent: asset.currentApys.borrowApyPercent,
                openLtvPercent: asset.config.openLtvPercent,
            }));
            return createTextOutput(simplifiedAssets, 2);
        }

        // Otherwise, return the full large assets (current behavior for format: 'large')
        return createTextOutput(fullMarketAssets, 2);
    } catch (error: any) {
        return createErrorOutput(`Error fetching Suilend market assets: ${error.message}`, error);
    }
}

export async function handleEnsureSuilendObligation(
    inputs: z.infer<typeof ensureSuilendObligationSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput | PreparedTransactionOutput> {
    try {
        const userAddress = clientManager.getActiveUserAddress();
        if (!userAddress) {
            return createErrorOutput(
                "Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
                new Error("Missing userAddress")
            );
        }

        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const suilendClientInstance = await clientManager.getSuilendSdkInstance(undefined, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for default market on network ${inputs.network}`);
        }

        const marketTypeArgs: string[] = [suilendClientInstance.lendingMarket.$typeArgs[0]];
        const ownerCaps = await SuilendSDKClientModule.getObligationOwnerCaps(
            userAddress,
            marketTypeArgs,
            suiClient
        );

        if (ownerCaps && ownerCaps.length > 0 && ownerCaps[0]) {
            const cap = ownerCaps[0];
            const existingObligation = {
                obligationId: cap.obligationId,
                ownerCapId: cap.id,
                createdNow: false,
                message: "Obligation already exists."
            };
            return {
                content: [{ type: "text", text: JSON.stringify(existingObligation) }]
            };
        } else {
            const tx = new Transaction();
            tx.setSender(userAddress);
            suilendClientInstance.createObligation(tx);
            
            const gasPrice = await suiClient.getReferenceGasPrice();
            if (gasPrice) tx.setGasPrice(gasPrice);
            tx.setGasBudget(50000000);

            return createPreparedTransactionOutput({
                status: "prepared",
                message: "Suilend obligation creation transaction prepared. Client must sign and execute. The new obligationId and ownerCapId will be in the transaction effects.",
                serializedTransactionBlock: tx.serialize(),
                requiredSender: userAddress,
                chain: "Sui",
                network: inputs.network || 'mainnet'
            });
        }
    } catch (error: any) {
        const userAddressForErrorMessage = "active_user_context";
        return createErrorOutput(`Error ensuring Suilend obligation for user ${userAddressForErrorMessage}.`, error);
    }
}

export async function handleDepositToSuilend(
    inputs: z.infer<typeof depositToSuilendSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleDepositToSuilend][Asset: ${inputs.assetCoinType}]`;

    try {
        const senderAddress = clientManager.getActiveUserAddress();
        if (!senderAddress) {
            return createErrorOutput(
                "Active user context (sender address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
                new Error("Missing senderAddress")
            );
        }

        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter) {
            return createErrorOutput(
                "Active user wallet not found. Ensure a wallet is configured and set in the MCP server context.",
                new Error("Missing active user wallet")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const suilendClientInstance = await clientManager.getSuilendSdkInstance(inputs.marketId, networkArg as Exclude<SuiNetwork, 'custom'>);

        if (!suilendClientInstance) {
            const errorMsg = `SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${networkArg}`;
            throw new Error(errorMsg);
        }

        if (new BigNumber(inputs.amountToDeposit).lte(0)) {
            const errorMsg = "Amount to deposit must be positive.";
            return createErrorOutput(errorMsg, new Error(errorMsg));
        }

        const txResponse = await sdkDepositToSuilend(
            suiClient,
            suilendClientInstance,
            walletAdapter,
            inputs.assetCoinType,
            inputs.assetDecimals,
            inputs.amountToDeposit,
            inputs.userOwnerCapId
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully deposited ${inputs.amountToDeposit} of ${inputs.assetCoinType}. Digest: ${txResponse.digest}`;
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error';
            const errorMessage = `Deposit transaction failed or digest missing. Status: ${errorDetails}`;
            return createErrorOutput(
                `Error during Suilend deposit for asset ${inputs.assetCoinType}: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        return createErrorOutput(
            `Error preparing deposit to Suilend for asset ${inputs.assetCoinType}: ${error.message}`,
            error
        );
    }
}

export async function handleGetObligationDetails(
    inputs: z.infer<typeof getObligationDetailsSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const suilendClient = await clientManager.getSuilendSdkInstance(inputs.marketId, inputs.network);
        if (!suilendClient) {
            return createErrorOutput('Failed to initialize Suilend SDK client', new Error('Suilend client init failed'));
        }
        const details = await sdkGetSuilendObligationDetails(suilendClient, suiClient, inputs.obligationId);
        if (!details) {
            return createErrorOutput(`No obligation details found for ID ${inputs.obligationId}`, new Error('Obligation not found'));
        }
        return createTextOutput(details, 2);
    } catch (error: any) {
        return createErrorOutput(`Error fetching Suilend obligation details for ID ${inputs.obligationId}: ${error.message}`, error);
    }
}

export async function handleWithdrawFromSuilend(
    inputs: z.infer<typeof withdrawFromSuilendSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleWithdrawFromSuilend][ObligationID: ${inputs.userObligationId}][Asset: ${inputs.assetCoinType}]`;

    try {
        const senderAddress = clientManager.getActiveUserAddress();
        if (!senderAddress) {
            return createErrorOutput(
                "Active user context (sender address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
                new Error("Missing senderAddress")
            );
        }

        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter) {
            return createErrorOutput(
                "Active user wallet not found. Ensure a wallet is configured and set in the MCP server context.",
                new Error("Missing active user wallet")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const suilendClientInstance = await clientManager.getSuilendSdkInstance(inputs.marketId, networkArg as Exclude<SuiNetwork, 'custom'>);

        if (!suilendClientInstance) {
            const errorMsg = `SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${networkArg}`;
            throw new Error(errorMsg);
        }

        if (inputs.amountToWithdraw.toUpperCase() !== 'MAX' && new BigNumber(inputs.amountToWithdraw).lte(0)) {
            const errorMsg = "Amount to withdraw must be positive or 'MAX'.";
            return createErrorOutput(errorMsg, new Error(errorMsg));
        }
        
        const txResponse = await sdkWithdrawFromSuilend(
            suiClient,
            suilendClientInstance,
            walletAdapter,
            inputs.userObligationId,
            inputs.userObligationOwnerCapId,
            inputs.assetCoinType,
            inputs.assetDecimals,
            inputs.amountToWithdraw
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully withdrew ${inputs.amountToWithdraw} of ${inputs.assetCoinType}. Digest: ${txResponse.digest}`;
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error during withdrawal';
            const errorMessage = `Withdraw transaction failed or digest missing. Status: ${errorDetails}`;
            return createErrorOutput(
                `Error during Suilend withdrawal for asset ${inputs.assetCoinType}: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        return createErrorOutput(
            `Error preparing withdrawal from Suilend for asset ${inputs.assetCoinType}: ${error.message}`,
            error
        );
    }
}

export async function handleBorrowFromSuilend(
    inputs: z.infer<typeof borrowFromSuilendSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleBorrowFromSuilend][ObligationID: ${inputs.userObligationId}][Asset: ${inputs.assetCoinType}]`;

    try {
        const senderAddress = clientManager.getActiveUserAddress();
        if (!senderAddress) {
            return createErrorOutput(
                "Active user context (sender address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
                new Error("Missing senderAddress")
            );
        }

        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter) {
            return createErrorOutput(
                "Active user wallet not found. Ensure a wallet is configured and set in the MCP server context.",
                new Error("Missing active user wallet")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const suilendClientInstance = await clientManager.getSuilendSdkInstance(inputs.marketId, networkArg as Exclude<SuiNetwork, 'custom'>);

        if (!suilendClientInstance) {
            const errorMsg = `SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${networkArg}`;
            throw new Error(errorMsg);
        }

        if (new BigNumber(inputs.amountToBorrow).lte(0)) {
            const errorMsg = "Amount to borrow must be positive.";
            return createErrorOutput(errorMsg, new Error(errorMsg));
        }
        
        const txResponse = await sdkBorrowFromSuilend(
            suiClient,
            suilendClientInstance,
            walletAdapter,
            inputs.userObligationId,
            inputs.userObligationOwnerCapId,
            inputs.assetCoinType,
            inputs.assetDecimals,
            inputs.amountToBorrow
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully borrowed ${inputs.amountToBorrow} of ${inputs.assetCoinType}. Digest: ${txResponse.digest}`;
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error during borrow operation';
            const errorMessage = `Borrow transaction failed or digest missing. Status: ${errorDetails}`;
            return createErrorOutput(
                `Error during Suilend borrow for asset ${inputs.assetCoinType}: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        return createErrorOutput(
            `Error preparing borrow from Suilend for asset ${inputs.assetCoinType}: ${error.message}`,
            error
        );
    }
}

export async function handleRepayToSuilend(
    inputs: z.infer<typeof repayToSuilendSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleRepayToSuilend][ObligationID: ${inputs.userObligationId}][Asset: ${inputs.assetCoinType}]`;

    try {
        const senderAddress = clientManager.getActiveUserAddress();
        if (!senderAddress) {
            return createErrorOutput(
                "Active user context (sender address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
                new Error("Missing senderAddress")
            );
        }

        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter) {
            return createErrorOutput(
                "Active user wallet not found. Ensure a wallet is configured and set in the MCP server context.",
                new Error("Missing active user wallet")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const suilendClientInstance = await clientManager.getSuilendSdkInstance(inputs.marketId, networkArg as Exclude<SuiNetwork, 'custom'>);

        if (!suilendClientInstance) {
            const errorMsg = `SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${networkArg}`;
            throw new Error(errorMsg);
        }

        const txResponse = await sdkRepayToSuilend(
            suiClient,
            suilendClientInstance,
            walletAdapter,
            inputs.userObligationId,
            inputs.assetCoinType,
            inputs.assetDecimals,
            inputs.amountToRepay
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully repaid ${inputs.amountToRepay} of ${inputs.assetCoinType} to obligation ${inputs.userObligationId}. Digest: ${txResponse.digest}`;
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error';
            const errorMessage = `Repay transaction failed or digest missing. Status: ${errorDetails}`;
            return createErrorOutput(
                `Error during Suilend repay for asset ${inputs.assetCoinType}: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        return createErrorOutput(
            `Error preparing repay to Suilend for asset ${inputs.assetCoinType}: ${error.message}`, 
            error
        );
    }
}

export async function handleGetObligationHistory(
    inputs: z.infer<typeof getObligationHistorySchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const history = await sdkGetSuilendObligationHistory(
            suiClient, 
            inputs.obligationId, 
            inputs.maxQuantity, 
            inputs.cursor
        );
        if (!history) {
            throw new Error(`No obligation history found for ID ${inputs.obligationId}`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(history, null, 2),
                },
            ],
        };
    } catch (error: any) {
        throw new Error(`Error fetching Suilend obligation history for ID ${inputs.obligationId}: ${error.message}`);
    }
}

export async function handleGetUserObligationInfo(
    inputs: z.infer<typeof getUserObligationInfoSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const networkArg = inputs.network || 'mainnet';
    const marketIdArg = inputs.marketId;
    const userAddress = clientManager.getActiveUserAddress();

    if (!userAddress) {
        return createErrorOutput(
            "Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.",
            new Error("Missing userAddress")
        );
    }

    try {
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        const suilendClient = await clientManager.getSuilendSdkInstance(marketIdArg, networkArg as Exclude<SuiNetwork, 'custom'>);

        if (!suiClient) {
            throw new Error(`Failed to get SuiClient for network ${networkArg}`);
        }
        if (!suilendClient) {
            throw new Error(`Failed to get SuilendSDKClient for market ${marketIdArg || 'default'} on network ${networkArg}`);
        }

        const result = await sdkGetUserSuilendObligationInfo(suiClient, suilendClient, userAddress);

        if (!result || (!result.obligationId && !result.ownerCapId)) {
            return {
                content: [{ type: "text", text: JSON.stringify({ obligationId: null, ownerCapId: null }) }]
            };
        }

        return {
            content: [{ type: "text", text: JSON.stringify(result, bigNumberReplacer) }]
        };
    } catch (error: any) {
        const userAddressForErrorMessage = "active_user_context";
        return createErrorOutput(`Error fetching Suilend obligation info for user ${userAddressForErrorMessage} on market ${inputs.marketId || 'default'}.`, error);
    }
}

// All Suilend handlers implemented based on provided schemas. 