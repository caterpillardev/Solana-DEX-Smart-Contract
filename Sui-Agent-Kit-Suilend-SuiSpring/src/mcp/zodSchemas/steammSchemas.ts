/*
import { z } from 'zod';

const networkSchema = z.enum(['mainnet', 'testnet', 'devnet']).optional().default('mainnet').describe("Optional. The Sui network for Steamm operations. Defaults to mainnet.");

export const getAllSteammPoolsSchema = z.object({
    network: networkSchema
});

export const findSteammSwapRoutesSchema = z.object({
    inputCoinType: z.string().describe("The coin type of the input asset for the swap."),
    outputCoinType: z.string().describe("The coin type of the output asset for the swap."),
    network: networkSchema
});

export const executeSteammSwapSchema = z.object({
    senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted."),
    poolId: z.string().describe("The ID of the Steamm liquidity pool to use for the swap."),
    coinInType: z.string().describe("The coin type of the input asset."),
    coinInDecimals: z.number().int().min(0).describe("The number of decimals for the input asset."),
    coinInObjectId: z.string().describe("The object ID of the specific coin to be used as input."),
    coinOutType: z.string().describe("The coin type of the output asset."),
    amountIn: z.string().describe("The amount of the input asset to swap, as a string."),
    minAmountOut: z.string().optional().describe("Optional. The minimum amount of the output asset expected."),
    network: networkSchema
});

export const addSteammLiquiditySchema = z.object({
    senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted."),
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    coinAInObjectId: z.string().describe("The object ID of the user's coin for asset A."),
    coinADecimals: z.number().int().min(0).describe("Decimals for asset A."),
    amountADesired: z.string().describe("Desired amount of asset A to deposit, as a string (usually from a quote). paleontologo "),
    coinBInObjectId: z.string().describe("The object ID of the user's coin for asset B."),
    coinBDecimals: z.number().int().min(0).describe("Decimals for asset B."),
    amountBDesired: z.string().describe("Desired amount of asset B to deposit, as a string (usually from a quote). paleontologo "),
    network: networkSchema
});

export const removeSteammLiquiditySchema = z.object({
    senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted."),
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    lpCoinObjectId: z.string().describe("The object ID of the user's LP coin to burn."),
    lpDecimals: z.number().int().min(0).describe("Decimals for the LP token."),
    lpAmount: z.string().describe("Amount of LP tokens to remove, as a string."),
    minAmountA: z.string().describe("Minimum amount of asset A expected back."),
    minAmountB: z.string().describe("Minimum amount of asset B expected back."),
    coinADecimals: z.number().int().min(0).describe("Decimals for asset A."),
    coinBDecimals: z.number().int().min(0).describe("Decimals for asset B."),
    userAddress: z.string().optional().describe("Optional. The user's Sui address. Uses active user context if omitted (may affect certain quote types)."),
    network: networkSchema
});

export const getSteammPoolsExtendedSchema = z.object({
    limit: z.number().int().min(1).optional().describe("Optional. Limit the number of pools returned."),
    network: networkSchema
});

export const getSteammSwapQuoteSchema = z.object({
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    inputCoinType: z.string().describe("Coin type of the input asset."),
    outputCoinType: z.string().describe("Coin type of the output asset."),
    inputAmount: z.string().describe("Amount of the input asset, as a string."),
    inputCoinDecimals: z.number().int().min(0).describe("Decimals for the input asset."),
    network: networkSchema
});

export const getSteammAddLiquidityQuoteSchema = z.object({
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    maxAmountA: z.string().nullable().optional().describe("Optional. Maximum amount of asset A to deposit, as a string."),
    decimalsA: z.number().int().min(0).describe("Decimals for asset A."),
    maxAmountB: z.string().nullable().optional().describe("Optional. Maximum amount of asset B to deposit, as a string."),
    decimalsB: z.number().int().min(0).describe("Decimals for asset B."),
    userAddress: z.string().optional().describe("Optional. The user's Sui address (may affect certain quote types)."),
    network: networkSchema
});

export const getUserSteammLpBalanceSchema = z.object({
    userAddress: z.string().optional().describe("The Sui address of the user. Optional, uses active user context if omitted."),
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    network: networkSchema
});

export const getSteammRemoveLiquidityQuoteSchema = z.object({
    poolId: z.string().describe("The ID of the Steamm liquidity pool."),
    lpAmount: z.string().describe("Amount of LP tokens to remove, as a string."),
    lpDecimals: z.number().int().min(0).describe("Decimals for the LP token."),
    network: networkSchema
});

export const getSteammUserPositionsSchema = z.object({
    userAddress: z.string().optional().describe("The Sui address of the user. Optional, uses active user context if omitted."),
    network: networkSchema
});

export const executeSteammRoutedSwapSchema = z.object({
    senderAddress: z.string().optional().describe("The Sui address of the transaction sender. Optional, uses active user context if omitted."),
    coinInType: z.string().describe("Coin type of the input asset."),
    coinInDecimals: z.number().int().min(0).describe("Decimals for the input asset."),
    coinOutType: z.string().describe("Coin type of the output asset."),
    amountIn: z.string().describe("Amount of the input asset to swap, as a string."),
    coinInObjectId: z.string().optional().describe("Optional. The object ID of the specific coin to be used as input."),
    network: networkSchema
});
*/ 