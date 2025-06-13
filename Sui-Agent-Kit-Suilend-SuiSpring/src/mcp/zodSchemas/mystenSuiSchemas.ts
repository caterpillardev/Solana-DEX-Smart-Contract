import { z } from 'zod';

// Optional: Define a reusable network schema if many tools in this module need it.
const networkSchema = z.enum(['mainnet', 'testnet', 'devnet', 'localnet'])
    .optional()
    .default('mainnet')
    .describe("Optional. The Sui network to query. Defaults to mainnet.");

export const getSuiBalanceSchema = z.object({
    // userAddress: z.string().optional().describe("The Sui wallet address to fetch the SUI balance for. Optional, uses active user context if omitted."),
    network: networkSchema
}).describe("Gets the SUI balance (the native token of the Sui blockchain) for the currently active wallet in the MCP server. Returns both the human-readable formatted balance and the raw balance in MIST (atomic unit).");

export const getTokenMetadataSchema = z.object({
    coinType: z.string().describe("The full coin type string (e.g., '0x2::sui::SUI')."),
    network: networkSchema
}).describe("Retrieves detailed metadata for any fungible token on the Sui network, given its full `coinType` (e.g., '0xPOLKADOT::polkadot::POLKADOT' or '0x2::sui::SUI'). Returns information like name, official symbol, decimal places, textual description, and icon URL, if available.");

export const getUserTokenBalanceSchema = z.object({
    // userAddress: z.string().optional().describe("The Sui address of the user. Optional, uses active user context if omitted."),
    coinType: z.string().describe("The coin type of the token (e.g., '0x...::stable_coin::STABLE_COIN')."),
    network: networkSchema
}).describe("Gets the balance of a specific fungible token (OTHER THAN NATIVE SUI) for the currently active wallet in the MCP server. Requires the full `coinType` of the desired token. **To get the native SUI balance, use the `mystenSui.getSuiBalance` tool instead.**");

// export const transferFungibleTokenSchema = z.object({ // Comentando este schema conforme solicitado
//     senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted."),
//     recipientAddress: z.string().describe("The Sui address of the recipient."),
//     amount: z.string().describe("The amount of tokens to transfer, as a string (e.g., '10.5')."),
//     tokenCoinType: z.string().describe("The coin type of the token to transfer."),
//     tokenDecimals: z.number().int().min(0).describe("The number of decimals the token uses."),
//     coinObjectId: z.string().optional().describe("Optional. The specific object ID of the coin to use for the transfer. If not provided, the handler will attempt to find a suitable coin."),
//     network: networkSchema
// });

export const transferSuiSchema = z.object({
    recipientAddress: z.string().describe("The Sui address of the recipient."),
    amount: z.string().describe("The amount of SUI to transfer, as a string (e.g., '1.0')."),
    network: networkSchema.optional(),
    // senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted.") // Removendo este campo
}).describe("Executes a transfer of SUI (the native token) from the active wallet in the MCP server to a specified recipient address. Returns the transaction digest upon successful execution. **This tool is for native SUI only.**");

export const getUserRecentTxsSchema = z.object({
    // userAddress: z.string().optional().describe("The Sui address of the user. Optional, uses active user context if omitted."),
    limit: z.number().int().min(1).default(10).optional()
        .describe("Optional. Maximum number of transactions to return. Defaults to 10."),
    network: networkSchema
}).describe("Retrieves a list of the most recent transactions associated with the active wallet in the MCP server on the specified network. Allows specifying a limit on the number of transactions to return for pagination or summary purposes.");

export const transferSuiToManySchema = z.object({
    transfers: z.array(z.object({
        recipientAddress: z.string().describe("The Sui address of the recipient."),
        amount: z.string().describe("The amount of SUI to transfer to this recipient, as a string (e.g., '0.1').")
    })).min(1).describe("An array of transfer details. Each detail must specify a recipientAddress and an amount."),
    network: networkSchema.optional()
}).describe("Executes a transfer of SUI (the native token) from the active wallet in the MCP server to multiple specified recipient addresses in a single transaction. Returns the transaction digest upon successful execution.");

export const transferFungTokensToManySchema = z.object({
    tokenCoinType: z.string().describe("The coin type of the fungible token to transfer (e.g., '0x...::para_sui::PARA_SUI')."),
    tokenDecimals: z.number().int().min(0).describe("The number of decimals the token uses."),
    transfers: z.array(z.object({
        recipientAddress: z.string().describe("The Sui address of the recipient."),
        amount: z.string().describe("The amount of the token to transfer to this recipient, as a string (e.g., '10.5').")
    })).min(1).describe("An array of transfer details. Each detail must specify a recipientAddress and an amount."),
    network: networkSchema.optional()
}).describe("Executes a transfer of a specified fungible token from the active wallet in the MCP server to multiple recipient addresses in a single transaction. Returns the transaction digest upon successful execution."); 