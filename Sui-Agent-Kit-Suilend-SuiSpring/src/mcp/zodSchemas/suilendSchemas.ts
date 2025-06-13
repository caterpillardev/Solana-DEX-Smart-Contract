import { z } from 'zod';

const networkSchema = z.enum(['mainnet', 'testnet', 'devnet', 'localnet'])
    .default('mainnet')
    .describe("Optional. The Sui network for Suilend operations. Defaults to mainnet.");

export const getSuilendMarketAssetsSchema = z.object({
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema,
    format: z.enum(['small', 'large']).optional().default('small')
        .describe("Optional. Output format for the market assets. 'small' for summarized, 'large' for full data. Defaults to 'small'.")
}).describe("Lists the supported assets and their current metrics (like interest rates, APYs, etc.) for a specific Suilend market. **Useful for discovering which `assetCoinType`s and their respective `assetDecimals` are available for deposit or borrowing before using `depositToSuilend` or `borrowFromSuilend`.** Generally does not require specific user authentication.");

export const ensureSuilendObligationSchema = z.object({
    network: networkSchema.optional(),
}).describe("Checks if the active user has an obligation (loan position) in the specified Suilend market. If an obligation does not exist, this tool will create one. **Can be used as an initial step before a first deposit to ensure the obligation and its `ownerCapId` exist. Returns obligation information, including `obligationId` and `ownerCapId`, which are crucial for subsequent interactions.**");

export const depositToSuilendSchema = z.object({
    userOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to deposit."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToDeposit: z.string().describe("Amount of the asset to deposit, as a string."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Deposits an asset (e.g., SUI, USDC) as collateral into the user's existing Suilend obligation. This can increase the user's borrowing power. **Requires the `userOwnerCapId` (obtained from `suilend.getUserObligationInfo` for the correct wallet and market) to authorize modifying the obligation.** Also specify the `assetCoinType` (e.g., '0x2::sui::SUI'), `assetDecimals` (e.g., 9 for SUI), and the `amountToDeposit`. Returns the transaction digest.");

export const getObligationDetailsSchema = z.object({
    obligationId: z.string().describe("The ID of the Suilend obligation to fetch details for."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Retrieves a comprehensive report of a specific Suilend obligation (loan/collateral position). Includes all deposited assets, borrowed assets, health factor, borrowing limits, and accrued rewards. **Requires the `obligationId` of the obligation to inspect, which is obtained from `suilend.getUserObligationInfo`.**");

export const withdrawFromSuilendSchema = z.object({
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    userObligationOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to withdraw."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToWithdraw: z.string()
        .describe("Amount of the asset to withdraw, as a string ('MAX' for full withdrawal of a specific asset can be a special value handled by the handler if SDK supports)."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Withdraws an asset previously deposited as collateral from a Suilend obligation. This may decrease borrowing power or require debt repayment if the health factor becomes too low. **Requires both the `userObligationId` and `userObligationOwnerCapId` (both obtained from `suilend.getUserObligationInfo`).** Specify the `assetCoinType`, `assetDecimals`, and `amountToWithdraw`. The value 'MAX' can be used for `amountToWithdraw` to withdraw the entire balance of a specific collateral, if supported by the handler. Returns the transaction digest.");

export const borrowFromSuilendSchema = z.object({
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    userObligationOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to borrow."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToBorrow: z.string().describe("Amount of the asset to borrow, as a string."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Borrows an asset from a Suilend market, using the collateral deposited in the user's obligation as security. **Requires both the `userObligationId` and `userObligationOwnerCapId` (both obtained from `suilend.getUserObligationInfo`).** Specify the `assetCoinType` of the asset to borrow, its `assetDecimals`, and the `amountToBorrow`. Returns the transaction digest.");

export const repayToSuilendSchema = z.object({
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    assetCoinType: z.string().describe("The coin type of the asset to repay."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToRepay: z.string()
        .describe("Amount of the asset to repay, as a string ('MAX' for full repayment of a specific debt can be a special value handled by the handler if SDK supports)."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Repays (partially or fully) a previously borrowed asset in a Suilend obligation. **Requires the `userObligationId` (obtained from `suilend.getUserObligationInfo`).** Specify the `assetCoinType` of the asset to repay, its `assetDecimals`, and the `amountToRepay`. The value 'MAX' can be used for `amountToRepay` to repay the entire debt of a specific asset, if supported by the handler. Returns the transaction digest.");

export const getObligationHistorySchema = z.object({
    obligationId: z.string().describe("The ID of the Suilend obligation."),
    maxQuantity: z.number().int().min(1).default(10).optional()
        .describe("Optional. Maximum number of history items per page. Defaults to 10."),
    cursor: z.string().nullable().optional()
        .describe("Optional. Cursor for pagination."),
    network: networkSchema.optional(),
}).describe("Fetches the transaction history (such as deposits, withdrawals, borrows, repayments, liquidations) for a specific Suilend obligation. **Requires the `obligationId` of the obligation (obtained from `suilend.getUserObligationInfo`).** Supports pagination via `cursor` and `maxQuantity` parameters.");

export const getUserObligationInfoSchema = z.object({
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
}).describe("Gets the unique `obligationId` and `ownerCapId` for the active user's Suilend obligation in the specified market (or main market if `marketId` is omitted). **These IDs are FUNDAMENTAL PREREQUISITES and usually the FIRST STEP before using most other Suilend functions that interact with a user's loan/collateral position, such as `depositToSuilend`, `withdrawFromSuilend`, `borrowFromSuilend`, `repayToSuilend`, and `getObligationDetails`.** If the user has no obligation for the specified `marketId`, the response will indicate this."); 