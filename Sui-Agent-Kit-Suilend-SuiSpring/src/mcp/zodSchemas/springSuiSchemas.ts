import { z } from 'zod';

const networkSchema = z.enum(['mainnet', 'testnet', 'devnet'])
    .default('mainnet')
    .describe("Optional. The Sui network to query. Defaults to mainnet.");

export const getLstSuiExchangeRateSchema = z.object({
    lstCoinType: z.string().optional().describe("The full coin type of the Liquid Staking Token (e.g., '0x...::afsui::AFSUI'). Provide this OR the symbol."),
    symbol: z.string().optional().describe("The symbol of the Liquid Staking Token (e.g., 'afSUI'). Provide this OR the lstCoinType."),
    network: networkSchema.optional(),
}).refine(data => !!data.lstCoinType !== !!data.symbol, {
    message: "Exactly one of 'lstCoinType' or 'symbol' must be provided.",
    path: ["lstCoinType", "symbol"],
}).describe("Fetches the current exchange rate between a specific Liquid Staking Token (LST) and SUI. Requires the LST's `coinType` or `symbol`. Useful for understanding the conversion value before staking or unstaking.");

export const getUserLstDetailsSchema = z.object({
    lstCoinType: z.string().describe("The coin type of the Liquid Staking Token."),
    network: networkSchema.optional(),
}).describe("Gets specific details about the user's position in a particular Liquid Staking Token (LST) from the SpringSui protocol. Includes the user's LST balance, current APY of the pool, and the SUI equivalent value. **Requires the `lstCoinType` of the desired LST, which can be obtained from `springSui.discoverLstPools`.**");

export const discoverLstPoolsSchema = z.object({
    network: networkSchema.optional()
        .describe("Optional. The Sui network to query. Defaults to mainnet."),
}).describe("Discovers all available Liquid Staking Token (LST) pools supported by the SpringSui protocol on the specified network. Returns a list of LSTs, including their names, symbols, and crucially, their `coinType`s. **Use this function to find a valid `lstCoinType` before calling `springSui.getUserLstDetails` or a specific staking tool like `springSui.stakeSuiForParaSui`.**");

export const getSpringSuiPoolApysSchema = z.object({
    network: networkSchema.optional(),
    specificCoinType: z.string().describe("If provided, fetches APY only for this LST coin type."),
}).describe("Gets the Annual Percentage Yields (APYs) for LST pools in the SpringSui protocol. Can fetch for a specific LST `coinType` or all pools.");

export const stakeSuiForSpringSuiLstSchema = z.object({
    lstCoinType: z.string().describe("The coin type of the LST to mint."),
    amountSuiToStake: z.string().describe("Amount of SUI to stake (e.g., '10.5')."),
    network: networkSchema.optional(),
}).describe("Executes staking SUI for a generic SpringSui LST. Requires the `lstCoinType` of the target LST (obtainable via `discoverLstPools`) and the amount of SUI to stake. Returns the transaction digest.");

export const stakeSuiForParaSuiSchema = z.object({
    amountSuiToStake: z.string().describe("Amount of SUI to stake for ParaSui."),
    network: networkSchema.optional(),
}).describe("Executes the action of staking SUI to obtain ParaSUI (a specific LST offered via SpringSui) on the specified network. The amount of SUI to stake is provided as input. Returns the transaction digest upon successful execution. **The `lstCoinType` for ParaSUI is handled internally by this specialized tool.**");

export const redeemSpringSuiLstForSuiSchema = z.object({
    lstCoinType: z.string().describe("The coin type of the LST to redeem (e.g., '0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI')."),
    amountLstToRedeem: z.string().describe("The amount of LST to redeem, in UI format (e.g., '1.25')."),
    network: networkSchema.optional(),
}).describe("Redeems a specified amount of a Liquid Staking Token (LST) back into SUI using the active user context. Requires the LST's `coinType` and the amount to redeem. Returns the transaction digest."); 