import { z } from 'zod';
import {
    getSuiBalanceSchema,
    getTokenMetadataSchema,
    getUserTokenBalanceSchema,
    // transferFungibleTokenSchema, // Comentado conforme solicitado
    transferSuiSchema,
    getUserRecentTxsSchema,
    transferSuiToManySchema, // Added for multi-send
    transferFungTokensToManySchema // Added for multi-send fungible tokens
} from '../zodSchemas/mystenSuiSchemas';
import {
    getSuiBalance as sdkGetSuiBalance,
    getTokenMeta as sdkGetTokenMeta, // Renamed to avoid conflict with schema name
    getUserTokenBalance as sdkGetUserTokenBalance,
    // transferFungibleToken as sdkTransferFungibleToken, // Comentado
    transferSui as sdkTransferSui,
    transferSuiToMany as sdkTransferSuiToMany, // Added for multi-send
    transferFungTokensToMany as sdkTransferFungTokensToMany, // Added for multi-send fungible tokens
    getUserRecentTransactions as sdkGetUserRecentTransactions,
    // MvpWalletAdapter // This type is for internal SDK use, not directly for MCP handler params
} from '@/protocols/mystensui/mystenSui.actions';
import { InternalSdkClientManager } from '../internalSdkClientManager';
import { SuiTransactionBlockResponse, PaginatedCoins, SuiGasData } from '@mysten/sui/client'; // Adicionado PaginatedCoins, SuiGasData
import { Transaction, TransactionArgument } from '@mysten/sui/transactions'; // Corrected: Removed Coin
import { McpToolOutput, createErrorOutput, createTextOutput } from '../mcpUtils';
import { SUI_DECIMALS } from '@mysten/sui/utils'; // For SUI_DECIMALS
import BigNumber from 'bignumber.js'; // For amount calculations
import { SuiNetwork } from '@/protocols/mystensui/mystenSui.config'; // Added SuiNetwork import

export async function handleGetSuiBalance(
    inputs: z.infer<typeof getSuiBalanceSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const userAddress = clientManager.getActiveUserAddress();
        if (!userAddress) {
            throw new Error("Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.");
        }
        const result = await sdkGetSuiBalance(suiClient, userAddress);
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        throw new Error(`Error fetching SUI balance from SDK: ${error.message}`);
    }
}

export async function handleGetTokenMetadata(
    inputs: z.infer<typeof getTokenMetadataSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const result = await sdkGetTokenMeta(suiClient, inputs.coinType);
        return { 
            content: [
                {
                    type: "text", 
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        throw new Error(`Error fetching token metadata from SDK: ${error.message}`);
    }
}

export async function handleGetUserTokenBalance(
    inputs: z.infer<typeof getUserTokenBalanceSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const userAddress = clientManager.getActiveUserAddress();
        if (!userAddress) {
            throw new Error("Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.");
        }
        const result = await sdkGetUserTokenBalance(suiClient, userAddress, inputs.coinType);
        return { 
            content: [
                {
                    type: "text", 
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        throw new Error(`Error fetching user token balance from SDK: ${error.message}`);
    }
}

// export async function handleTransferFungibleToken( // Comentando este handler conforme solicitado
//     inputs: z.infer<typeof transferFungibleTokenSchema>,
//     clientManager: InternalSdkClientManager
// ): Promise<PreparedTransactionOutput> {
//     try {
//         const suiClient = clientManager.getSuiClientInstance(inputs.network);
//         const senderAddress = inputs.senderAddress ?? clientManager.getActiveUserAddress();
//         if (!senderAddress) {
//             throw new Error("Sender address is required, either as input or from active user context.");
//         }

//         const tx = new Transaction();
//         tx.setSender(senderAddress);

//         const targetAmountRaw = new BigNumber(inputs.amount)
//             .shiftedBy(inputs.tokenDecimals)
//             .integerValue(BigNumber.ROUND_FLOOR);

//         if (targetAmountRaw.lte(0)) {
//             throw new Error("Token amount to transfer must be positive.");
//         }

//         let coinToUseId: string | undefined = inputs.coinObjectId;
//         let coinToUseBalance: BigNumber | undefined;

//         if (!coinToUseId) {
//             let cursor: string | null | undefined = null;
//             let foundCoinStruct: { coinObjectId: string; balance: string } | null = null;

//             do {
//                 const coinsPage: PaginatedCoins = await suiClient.getCoins({
//                     owner: senderAddress,
//                     coinType: inputs.tokenCoinType,
//                     cursor: cursor,
//                 });

//                 for (const coin of coinsPage.data) {
//                     const currentCoinBalance = new BigNumber(coin.balance);
//                     if (currentCoinBalance.gte(targetAmountRaw)) {
//                         if (!foundCoinStruct || currentCoinBalance.lt(new BigNumber(foundCoinStruct.balance))) {
//                             foundCoinStruct = coin;
//                         }
//                         if (currentCoinBalance.eq(targetAmountRaw)) {
//                             foundCoinStruct = coin;
//                             break; 
//                         }
//                     }
//                 }
//                 if (foundCoinStruct && new BigNumber(foundCoinStruct.balance).eq(targetAmountRaw)) {
//                     break; 
//                 }
//                 cursor = coinsPage.nextCursor;
//             } while (cursor);
            
//             if (foundCoinStruct) {
//                 coinToUseId = foundCoinStruct.coinObjectId;
//                 coinToUseBalance = new BigNumber(foundCoinStruct.balance);
//             } else {
//                 throw new Error(`No single suitable coin object found for ${inputs.tokenCoinType} with sufficient balance to transfer ${inputs.amount}.`);
//             }
//         }

//         if (!coinToUseId) { 
//              throw new Error("Could not determine a coin object ID for the transfer.");
//         }

//         if (coinToUseBalance === undefined) { 
//             const coinObjectData = await suiClient.getObject({ id: coinToUseId, options: { showContent: true } });
//             const fields = coinObjectData.data?.content?.dataType === 'moveObject' ? coinObjectData.data.content.fields as { balance: string; id: { id: string } } : null;
//             if (fields && typeof fields.balance === 'string') {
//                 coinToUseBalance = new BigNumber(fields.balance);
//             } else {
//                 throw new Error(`Could not fetch balance for provided coinObjectId: ${coinToUseId}. Object data: ${JSON.stringify(coinObjectData.data)}`);
//             }
//         }
        
//         if (!coinToUseBalance) { 
//             throw new Error("Could not determine the balance of the coin to be used for transfer.");
//         }

//         let coinToSendArg: TransactionArgument;
//         const coinObjectRef = tx.object(coinToUseId);

//         if (coinToUseBalance.eq(targetAmountRaw)) {
//             coinToSendArg = coinObjectRef;
//         } else if (coinToUseBalance.gt(targetAmountRaw)) {
//             const [splitCoin] = tx.splitCoins(coinObjectRef, [targetAmountRaw.toString()]);
//             coinToSendArg = splitCoin;
//         } else {
//             throw new Error(`Selected coin balance ${coinToUseBalance.toString()} is less than target amount ${targetAmountRaw.toString()}. This indicates an issue in coin selection or a race condition.`);
//         }

//         tx.transferObjects([coinToSendArg], tx.pure.address(inputs.recipientAddress));

//         const gasPrice = await suiClient.getReferenceGasPrice();
//         if (!gasPrice) throw new Error("Failed to get reference gas price.");
//         tx.setGasPrice(gasPrice);
//         tx.setGasBudget(30000000); 

//         return createPreparedTransactionOutput({
//             status: "prepared",
//             message: "Fungible token transfer transaction prepared. Client must sign and execute.",
//             serializedTransactionBlock: tx.serialize(),
//             requiredSender: senderAddress,
//             chain: "Sui",
//             network: inputs.network || 'mainnet'
//         });

//     } catch (error: any) {
//         throw new Error(`Error preparing fungible token transfer: ${error.message}`);
//     }
// }

export async function handleTransferSui(
    inputs: z.infer<typeof transferSuiSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleTransferSui]`;
    console.warn(`${logPrefix} Received request to transfer ${inputs.amount} SUI to ${inputs.recipientAddress}`);

    try {
        const walletAdapter = clientManager.getActiveUserWallet();

        if (!walletAdapter || !walletAdapter.address) {
            console.warn(`${logPrefix} Active user wallet (MvpWalletAdapter with address) not found in ClientManager.`);
            return createErrorOutput(
                "Active user wallet with address not found. Ensure a wallet is configured and active.",
                new Error("Missing active user wallet or address")
            );
        }
        // O senderAddress será o walletAdapter.address

        if (!inputs.recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(inputs.recipientAddress)) {
            const errMsg = `Invalid recipient address provided: ${inputs.recipientAddress}`;
            console.warn(`${logPrefix} ${errMsg}`);
            return createErrorOutput(errMsg, new Error("Invalid recipient address"));
        }
        if (new BigNumber(inputs.amount).lte(0)) {
            const errMsg = `Amount to transfer must be positive. Received: ${inputs.amount}`;
            console.warn(`${logPrefix} ${errMsg}`);
            return createErrorOutput(errMsg, new Error("Invalid transfer amount"));
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        
        console.warn(`${logPrefix} Calling sdkTransferSui action for sender ${walletAdapter.address}...`);
        const txResponse = await sdkTransferSui(
            suiClient,
            walletAdapter, // This wallet will be the sender
            inputs.recipientAddress,
            inputs.amount // UI amount string, action handles MIST conversion
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully transferred ${inputs.amount} SUI to ${inputs.recipientAddress}. Digest: ${txResponse.digest}`;
            console.warn(`${logPrefix} ${message}`);
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error during SUI transfer';
            const errorMessage = `SUI transfer transaction failed or digest missing. Status: ${errorDetails}`;
            console.warn(`${logPrefix} ${errorMessage}`, txResponse ? JSON.stringify(txResponse.effects || txResponse, null, 2) : 'No txResponse');
            return createErrorOutput(
                `Error during SUI transfer: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        console.warn(`${logPrefix} Unhandled error: ${error.message}`, error.stack);
        return createErrorOutput(
            `Error processing SUI transfer: ${error.message}`,
            error
        );
    }
}

export async function handleTransferSuiToMany(
    inputs: z.infer<typeof transferSuiToManySchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleTransferSuiToMany]`;
    console.warn(`${logPrefix} Received request to transfer SUI to multiple recipients.`);

    try {
        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter || !walletAdapter.address) {
            console.warn(`${logPrefix} Active user wallet (MvpWalletAdapter with address) not found in ClientManager.`);
            return createErrorOutput(
                "Active user wallet with address not found. Ensure a wallet is configured and active.",
                new Error("Missing active user wallet or address")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        
        console.warn(`${logPrefix} Calling sdkTransferSuiToMany action for sender ${walletAdapter.address}...`);
        const txResponse = await sdkTransferSuiToMany(
            suiClient,
            walletAdapter,
            inputs.transfers
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully transferred SUI to multiple recipients. Digest: ${txResponse.digest}`;
            console.warn(`${logPrefix} ${message}`);
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || 'Unknown error during SUI multi-transfer';
            const errorMessage = `SUI multi-transfer transaction failed or digest missing. Status: ${errorDetails}`;
            console.warn(`${logPrefix} ${errorMessage}`, txResponse ? JSON.stringify(txResponse.effects || txResponse, null, 2) : 'No txResponse');
            return createErrorOutput(
                `Error during SUI multi-transfer: ${errorMessage}`,
                new Error(errorDetails)
            );
        }

    } catch (error: any) {
        console.warn(`${logPrefix} Unhandled error: ${error.message}`, error.stack);
        return createErrorOutput(
            `Error processing SUI multi-transfer: ${error.message}`,
            error
        );
    }
}

export async function handleTransferFungTokensToMany(
    inputs: z.infer<typeof transferFungTokensToManySchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    const logPrefix = `[HANDLER][handleTransferFungTokensToMany][${inputs.tokenCoinType}]`;
    console.warn(`${logPrefix} Received request to transfer token to multiple recipients.`);

    try {
        const walletAdapter = clientManager.getActiveUserWallet();
        if (!walletAdapter || !walletAdapter.address) {
            console.warn(`${logPrefix} Active user wallet not found.`);
            return createErrorOutput(
                "Active user wallet with address not found. Ensure a wallet is configured and active.",
                new Error("Missing active user wallet or address")
            );
        }

        const networkArg = inputs.network || 'mainnet';
        const suiClient = clientManager.getSuiClientInstance(networkArg as Exclude<SuiNetwork, 'custom'>);
        
        console.warn(`${logPrefix} Calling sdkTransferFungTokensToMany action for sender ${walletAdapter.address}...`);
        const txResponse = await sdkTransferFungTokensToMany(
            suiClient,
            walletAdapter,
            inputs.tokenCoinType,
            inputs.tokenDecimals,
            inputs.transfers
        );

        if (txResponse && txResponse.effects && txResponse.effects.status.status === 'success' && txResponse.digest) {
            const message = `Successfully transferred ${inputs.tokenCoinType} to multiple recipients. Digest: ${txResponse.digest}`;
            console.warn(`${logPrefix} ${message}`);
            return createTextOutput({
                message,
                digest: txResponse.digest,
                transactionDetailsUrl: `https://suiscan.xyz/${networkArg}/tx/${txResponse.digest}`
            });
        } else {
            const errorDetails = txResponse?.effects?.status?.error || `Unknown error during ${inputs.tokenCoinType} multi-transfer`;
            const errorMessage = `${inputs.tokenCoinType} multi-transfer transaction failed or digest missing. Status: ${errorDetails}`;
            console.warn(`${logPrefix} ${errorMessage}`, txResponse ? JSON.stringify(txResponse.effects || txResponse, null, 2) : 'No txResponse');
            return createErrorOutput(
                `Error during ${inputs.tokenCoinType} multi-transfer: ${errorMessage}`,
                new Error(errorDetails.toString())
            );
        }

    } catch (error: any) {
        console.warn(`${logPrefix} Unhandled error: ${error.message}`, error.stack);
        return createErrorOutput(
            `Error processing ${inputs.tokenCoinType} multi-transfer: ${error.message}`,
            error
        );
    }
}

interface SimplifiedTransactionSummary {
    digest: string;
    timestampMs: string | null;
    status: 'success' | 'failure';
    error: string | null; // Populated if status is 'failure'
    gasUsed: string; // e.g., "net gas cost in MIST"
    gasOwner: string | null; // Address of the gas object owner
    sender: string | null;
    transactionKind: string;
    createdCount: number;
    mutatedCount: number;
    deletedCount: number;
}

export async function handleGetUserRecentTxs(
    inputs: z.infer<typeof getUserRecentTxsSchema>,
    clientManager: InternalSdkClientManager
): Promise<McpToolOutput> {
    try {
        const suiClient = clientManager.getSuiClientInstance(inputs.network);
        const userAddress = clientManager.getActiveUserAddress();
        if (!userAddress) {
            throw new Error("Active user context (address) not found. Configure SUI_MAINNET_PRIVATE_KEY or connect wallet.");
        }
        const fullTransactions: SuiTransactionBlockResponse[] = await sdkGetUserRecentTransactions(suiClient, userAddress, inputs.limit);
        
        const limit = inputs.limit ?? 10; 
        const recentFullTransactions = fullTransactions.slice(0, limit);

        const simplifiedTransactions: SimplifiedTransactionSummary[] = recentFullTransactions.map(tx => {
            const effects = tx.effects;
            const gasUsedData = effects?.gasUsed;
            let totalGasUsed = '0';
            if (gasUsedData) {
                totalGasUsed = new BigNumber(gasUsedData.computationCost)
                    .plus(gasUsedData.storageCost)
                    .minus(gasUsedData.storageRebate)
                    .toString();
            }

            let txKindString = 'Unknown';
            if (tx.transaction?.data.transaction) {
                const kindObject = tx.transaction.data.transaction;
                if ('ProgrammableTransaction' in kindObject) txKindString = 'ProgrammableTransaction';
                else if ('ChangeEpoch' in kindObject) txKindString = 'ChangeEpoch';
                else txKindString = Object.keys(kindObject)[0] || 'Unknown';
            }

            let gasObjectOwnerString: string | null = null;
            if (effects?.gasObject.owner && typeof effects.gasObject.owner === 'object') {
                if ('AddressOwner' in effects.gasObject.owner) {
                    gasObjectOwnerString = effects.gasObject.owner.AddressOwner;
                } else if ('ObjectOwner' in effects.gasObject.owner) {
                    gasObjectOwnerString = effects.gasObject.owner.ObjectOwner;
                } else if ('Shared' in effects.gasObject.owner) {
                    gasObjectOwnerString = `Shared(version:${effects.gasObject.owner.Shared.initial_shared_version})`;
                } else {
                    gasObjectOwnerString = 'ImmutableOrUnknown';
                }
            }

            return {
                digest: tx.digest,
                timestampMs: tx.timestampMs || null,
                status: effects?.status.status || 'failure',
                error: effects?.status.error || null,
                gasUsed: totalGasUsed,
                gasOwner: gasObjectOwnerString,
                sender: tx.transaction?.data.sender || null,
                transactionKind: txKindString,
                createdCount: effects?.created?.length || 0,
                mutatedCount: effects?.mutated?.length || 0,
                deletedCount: effects?.deleted?.length || 0,
            };
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(simplifiedTransactions, null, 2),
                    details: `Showing ${simplifiedTransactions.length} of ${fullTransactions.length} fetched transactions. Output simplified.`
                }
            ]
        };
    } catch (error: any) {
        throw new Error(`Error fetching user recent transactions: ${error.message}`);
    }
} 