import { SuiClient, SuiTransactionBlockResponse, CoinMetadata, CoinBalance } from '@mysten/sui/client';
import { Transaction, TransactionArgument, TransactionObjectInput, TransactionObjectArgument, TransactionResult } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs'; // Added bcs import
import {
  SteammSDK,
  Pool,          // Assuming Pool type is exported for fetching
  Route,         // Assuming Route type is exported for swaps
  CoinPair,      // For finding routes
  DepositLiquidityParams, // For adding liquidity
  RedeemLiquidityParams, // Corrected type for removing liquidity
  PoolInfo,
  SwapQuote,
  DepositQuote,
  RedeemQuote,
  BankInfo,
  BankList,
  getBankFromUnderlying,
  getBankFromBToken
} from '@suilend/steamm-sdk';
import { MvpWalletAdapter, getTokenMeta, getUserTokenBalance } from '../mystensui/mystenSui.actions';
import { getDefaultSteammSDK } from './steamm.client';
import { STEAMM_MAINNET_CONFIG } from './steamm.config';
import { SteammPoolExtended, SteammRouteInfo, UserLiquidityPositionInfo } from './steamm.types';
import BigNumber from 'bignumber.js';
import { PoolModule, QuoteSwapParams, SwapParams, QuoteDepositParams, QuoteRedeemParams } from '@suilend/steamm-sdk/modules'; // Specific module if needed and QuoteSwapParams, Added QuoteDepositParams and QuoteRedeemParams
import { SUI_DECIMALS, SUI_TYPE_ARG, SUI_CLOCK_OBJECT_ID, normalizeStructTag } from '@mysten/sui/utils'; // For dummy coin
import { DepositQuote as SDKDepositQuote } from '@suilend/steamm-sdk/base/pool/poolTypes'; // Ensure correct import
import { SteammAddLiquidityQuoteResult } from './steamm.types'; // Import local UI type
import { RedeemQuote as SDKRedeemQuote } from '@suilend/steamm-sdk/base/pool/poolTypes';
import { SteammRemoveLiquidityQuoteResult } from './steamm.types'; // Local UI type
import { Routes } from '@suilend/steamm-sdk/modules/routerModule'; // Ajustado para pegar de routerModule
import { SuiNetwork } from '../mystensui/mystenSui.config'; // Corrected import path
import { bigNumberReplacer } from '../../mcp/mcpUtils'; // Removed 'log' import
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'; // Import Ed25519Keypair
import { parseTokenAmount } from '../../common/common.utils'; // Corrected path back
import { Bank } from "@suilend/steamm-sdk/base/bank"; 

export async function getAllSteammPools(
  steammSdk: SteammSDK | null // Keep null check for robustness
): Promise<PoolInfo[]> {
  if (!steammSdk) {
    return [];
  }
  try {
    const pools = await steammSdk.getPools(); // Call without arguments
    return pools;
  } catch (error) {
    return [];
  }
}

export async function findSteammSwapRoutes(
  steammSdk: SteammSDK,
  inputCoinType: string,
  outputCoinType: string,
  network?: SuiNetwork
): Promise<Routes> { // Routes is HopData[][]
  const logPrefix = `[findSteammSwapRoutes (${network || 'mainnet'} - ${inputCoinType} -> ${outputCoinType})]:`;
  try {
    console.log(`${logPrefix} Initializing route finding...`);

    // Ensure SDK caches are warm by calling getBanks and getPools
    // These methods internally call refreshBankCache/refreshPoolCache if needed.
    console.log(`${logPrefix} Attempting to warm up SDK bank cache by calling getBanks()...`);
    const banks = await steammSdk.getBanks();
    const numBanks = Object.keys(banks).length;
    console.log(`${logPrefix} steammSdk.getBanks() returned. Found ${numBanks} banks.`);
    // Optional: Log a summary of bank keys if not too verbose
    // console.log(`${logPrefix} Bank keys: ${Object.keys(banks).join(', ')}`);

    console.log(`${logPrefix} Attempting to warm up SDK pool cache by calling getPools()...`);
    const pools = await steammSdk.getPools();
    console.log(`${logPrefix} steammSdk.getPools() returned. Found ${pools.length} pools.`);
    // Optional: Log a summary of pool IDs if not too verbose
    // console.log(`${logPrefix} Pool IDs: ${pools.map(p => p.poolId).join(', ')}`);

    const SUI_TYPE_ARG_LONG_HEX = normalizeStructTag(SUI_TYPE_ARG);

    const coinPair: CoinPair = {
      coinIn: inputCoinType,
      coinOut: outputCoinType,
    };
    console.log(`${logPrefix} Calling SteammSDK.Router.findSwapRoutes with coinPair:`, JSON.stringify(coinPair));

    const coinPairForSdk: CoinPair = {
      coinIn: coinPair.coinIn === SUI_TYPE_ARG ? SUI_TYPE_ARG_LONG_HEX : coinPair.coinIn,
      coinOut: coinPair.coinOut === SUI_TYPE_ARG ? SUI_TYPE_ARG_LONG_HEX : coinPair.coinOut,
    };

    if (coinPairForSdk.coinIn !== coinPair.coinIn || coinPairForSdk.coinOut !== coinPair.coinOut) {
      console.log(`${logPrefix} Normalized coinPair for SDK:`, JSON.stringify(coinPairForSdk, bigNumberReplacer, 2));
    }

    // The SDK's findSwapRoutes should handle bToken conversion internally.
    // We will log if it throws or returns an empty array.
    const routes = await steammSdk.Router.findSwapRoutes(coinPairForSdk);

    console.log(`${logPrefix} SteammSDK.Router.findSwapRoutes returned. Found ${routes.length} routes.`);
    if (routes.length > 0) {
      // Use bigNumberReplacer for logging complex objects that might contain BigNumber or bigint
      console.log(`${logPrefix} Routes details:`, JSON.stringify(routes, bigNumberReplacer, 2));
    } else {
      console.warn(`${logPrefix} No routes found. This could be due to:`);
      console.warn(`${logPrefix} 1. No actual liquidity path between the tokens.`);
      console.warn(`${logPrefix} 2. Issues in SDK's internal bank/pool cache population or data parsing.`);
      console.warn(`${logPrefix} 3. Underlying coins not present in the SDK's bank registry (banks object).`);
      console.warn(`${logPrefix}   Input Coin: ${coinPair.coinIn}, Output Coin: ${coinPair.coinOut}`);
      console.warn(`${logPrefix}   Is '${coinPair.coinIn}' registered in SDK banks? ${banks.hasOwnProperty(coinPair.coinIn)}`);
      console.warn(`${logPrefix}   Is '${coinPair.coinOut}' registered in SDK banks? ${banks.hasOwnProperty(coinPair.coinOut)}`);
      
      // Deeper check for bToken conversion using internal cache for logging if banks are populated
      if (numBanks > 0) {
        try {
          // @ts-ignore: _banks is private, used for deeper debugging log of SDK's internal state
          const internalBankCache = steammSdk.Bank._banks?.banks; 
          if (internalBankCache && Object.keys(internalBankCache).length > 0) {
              console.log(`${logPrefix} Attempting internal getBankFromUnderlying for ${coinPair.coinIn}:`);
              // @ts-ignore: getBankFromUnderlying is part of Bank module, usually accessed via sdk.Bank but using direct cache here.
              const bankInInfo = steammSdk.Bank.getBankFromUnderlying(internalBankCache, coinPair.coinIn);
              console.log(`${logPrefix} Internal BankInfo for ${coinPair.coinIn}: ${JSON.stringify(bankInInfo, bigNumberReplacer, 2)}`);
              
              console.log(`${logPrefix} Attempting internal getBankFromUnderlying for ${coinPair.coinOut}:`);
              // @ts-ignore: getBankFromUnderlying is part of Bank module.
              const bankOutInfo = steammSdk.Bank.getBankFromUnderlying(internalBankCache, coinPair.coinOut);
              console.log(`${logPrefix} Internal BankInfo for ${coinPair.coinOut}: ${JSON.stringify(bankOutInfo, bigNumberReplacer, 2)}`);
          } else {
               console.warn(`${logPrefix} Could not access or parse steammSdk.Bank._banks for detailed bToken check. Internal cache might be empty or structured differently.`);
          }
        } catch (e: any) {
          console.warn(`${logPrefix} Error during manual getBankFromUnderlying check using internal cache: ${e.message}`);
        }
      } else {
        console.warn(`${logPrefix} SteammSDK bank cache appears empty (0 banks found via getBanks()), skipping detailed bToken check.`);
      }
    }
    return routes;
  } catch (error: any) {
    console.error(`${logPrefix} Critical error during findSteammSwapRoutes execution:`, error);
    // Log the full error object for more details, including potential stack trace
    // console.error(error); // The error object itself might be logged by the runtime or test runner
    // Propagate a clear error message
    throw new Error(`${logPrefix} Failed to find Steamm swap routes. SDK Error: ${error.message || JSON.stringify(error, bigNumberReplacer)}`);
  }
}

export async function executeSteammSwap(
  suiClient: SuiClient, 
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolId: string,
  coinInType: string, // Underlying type of the input coin
  coinInDecimals: number,
  coinInObject: string | TransactionObjectArgument, // Underlying coin object ID or argument
  coinOutType: string, // Underlying type of the output coin
  coinOutDecimals: number, 
  amountInString: string, // Amount of the underlying input coin
  minAmountOutString?: string, 
  existingTx?: Transaction,
): Promise<SuiTransactionBlockResponse | null> {
  return null; // Function is fully commented out, so return null
}

export async function addSteammLiquidity(
  suiClient: SuiClient, 
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolInfo: PoolInfo,
  coinAIdentifier: TransactionObjectInput, // Changed from coinAInObjectId: string
  coinADecimals: number,
  amountADesiredString: string, 
  coinBIdentifier: TransactionObjectInput, // Changed from coinBInObjectId: string
  coinBDecimals: number,
  amountBDesiredString: string,
  minAmountAString?: string, // This and next are for slippage, not currently used by SDK deposit
  minAmountBString?: string, // This and next are for slippage, not currently used by SDK deposit
  existingTx?: Transaction
): Promise<SuiTransactionBlockResponse | null> {
  return null; // Function is fully commented out, so return null
}

export async function removeSteammLiquidity(
  suiClient: SuiClient, 
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolInfo: PoolInfo,
  lpCoinObjectId: string, 
  lpDecimals: number, 
  lpAmountString: string, 
  minAmountAString: string, 
  minAmountBString: string,  
  coinADecimals: number, 
  coinBDecimals: number,
  existingTx?: Transaction
): Promise<SuiTransactionBlockResponse | null> {
  return null; // Function is fully commented out, so return null
}

/**
 * Fetches extended data (like token symbols, decimals) for discovered pools for UI display.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getSteammPoolsExtended(
  steammSdk: SteammSDK | null,
  suiClient: SuiClient, // Needed for CoinMetadata
  limit?: number // Optional limit parameter
): Promise<SteammPoolExtended[]> {
  if (!steammSdk) {
     return [];
  }

  const basicPools: PoolInfo[] = await getAllSteammPools(steammSdk);
  if (!basicPools || basicPools.length === 0) {
    return [];
  }

  const poolsToProcess = limit ? basicPools.slice(0, limit) : basicPools;

  // Using Promise.allSettled to handle potential errors for individual pools gracefully
  const settledResults = await Promise.allSettled(
    poolsToProcess.map(async (poolInfo) => {
      await delay(200); // Add a delay to avoid rate limiting
      const [metaA, metaB, metaLp] = await Promise.all([
        suiClient.getCoinMetadata({ coinType: poolInfo.coinTypeA }),
        suiClient.getCoinMetadata({ coinType: poolInfo.coinTypeB }),
        suiClient.getCoinMetadata({ coinType: poolInfo.lpTokenType })
      ]);

      const getSymbol = (meta: CoinMetadata | null, fallbackCoinType: string) => 
          meta?.symbol || fallbackCoinType.split('::').pop()?.substring(0, 6) || 'UNK';
      const getDecimals = (meta: CoinMetadata | null) => meta?.decimals ?? 0;

      const extendedPool: SteammPoolExtended = {
        ...poolInfo, // Spread all fields from SDK PoolInfo
        symbolA: getSymbol(metaA, poolInfo.coinTypeA),
        symbolB: getSymbol(metaB, poolInfo.coinTypeB),
        decimalsA: getDecimals(metaA),
        decimalsB: getDecimals(metaB),
        lpSymbol: getSymbol(metaLp, poolInfo.lpTokenType),
        lpDecimals: getDecimals(metaLp),
        reserveA_ui: '0', // Placeholder for MVP
        reserveB_ui: '0', // Placeholder for MVP
        balanceAUi: '0', // Placeholder needed if field exists in type
        balanceBUi: '0', // Placeholder needed if field exists in type
        rawPoolInfo: poolInfo, // Explicitly keep original if needed, or remove if spread covers it
      };
      return extendedPool;
    })
  );

  const successfulPools: SteammPoolExtended[] = [];
  settledResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulPools.push(result.value);
    } else {
      // silent error
    }
  });

  return successfulPools;
}

/**
 * Gets a swap quote for a specific pool and input amount.
 */
export async function getSteammSwapQuote(
  steammSdk: SteammSDK | null,
  poolInfo: PoolInfo,
  inputCoinType: string,
  outputCoinType: string,
  inputAmountString: string,
  inputCoinDecimals: number
): Promise<SwapQuote | null> {
  if (!steammSdk) {
    return null;
  }
  if (!poolInfo) {
    return null;
  }

  let inputAmountRaw: string;
  try {
    inputAmountRaw = new BigNumber(inputAmountString)
      .shiftedBy(inputCoinDecimals)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    if (new BigNumber(inputAmountRaw).isLessThanOrEqualTo(0)) {
      throw new Error("Input amount must be positive.");
    }
  } catch (e) {
    return null;
  }

  try {
    // Fetch all banks - needed for constructing QuoteSwapParams
    const banks: BankList = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

    if (!bankInfoA || !bankInfoB) {
      return null;
    }

    // Determine swap direction
    const a_is_input = (inputCoinType === poolInfo.coinTypeA);
    const b_is_input = (inputCoinType === poolInfo.coinTypeB);

    if (!a_is_input && !b_is_input) {
        throw new Error(`Input coin ${inputCoinType} does not match pool assets ${poolInfo.coinTypeA} / ${poolInfo.coinTypeB}`);
    }
    const a2b = a_is_input; // If A is input, direction is A->B

    // Construct params including PoolInfo, BankInfos, amountIn and direction (a2b)
    const params: QuoteSwapParams = {
      poolInfo: poolInfo,
      bankInfoA: bankInfoA,
      bankInfoB: bankInfoB,
      // coinInType and coinOutType are not part of QuoteSwapArgs
      amountIn: BigInt(inputAmountRaw), 
      a2b: a2b, // Added direction flag
    };

    const quote: SwapQuote = await steammSdk.Pool.quoteSwap(params);
    return quote;

  } catch (error) {
    return null;
  }
}

/**
 * Gets a quote for adding liquidity to a pool.
 */
export async function getSteammAddLiquidityQuote(
  suiClient: SuiClient,
  steammSdk: SteammSDK,
  poolInfo: PoolInfo,
  maxAmountAString: string | null | undefined, 
  decimalsA: number,
  maxAmountBString: string | null | undefined, 
  decimalsB: number,
  userAddress?: string
): Promise<SteammAddLiquidityQuoteResult | null> {
  try {
    const banks = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

    if (!bankInfoA || !bankInfoB) {
      return null;
    }

    // Convert string amounts to BigInt, defaulting to 0n if null, undefined, or invalid
    let maxARaw = 0n;
    if (maxAmountAString && parseFloat(maxAmountAString) > 0) {
      maxARaw = BigInt(new BigNumber(maxAmountAString).shiftedBy(decimalsA).toFixed(0));
    }

    let maxBRaw = 0n;
    if (maxAmountBString && parseFloat(maxAmountBString) > 0) {
      maxBRaw = BigInt(new BigNumber(maxAmountBString).shiftedBy(decimalsB).toFixed(0));
    }

    // Ensure at least one amount is positive for the quote, otherwise it's pointless or might error.
    // The SDK might handle one side being 0n for single-sided quote intentions.
    if (maxARaw <= 0n && maxBRaw <= 0n) {
        return null;
    }

    const sdkQuoteDepositParams: QuoteDepositParams = {
      poolInfo,
      bankInfoA,
      bankInfoB,
      maxA: maxARaw,
      maxB: maxBRaw,
    };

    const rawQuote: SDKDepositQuote = await steammSdk.Pool.quoteDeposit(sdkQuoteDepositParams);

    let lpTokenDecimals = 9; // Default LP token decimals
    const lpCoinMeta = await getTokenMeta(suiClient, poolInfo.lpTokenType);
    if (lpCoinMeta) {
      lpTokenDecimals = lpCoinMeta.decimals;
    } else {
      // silent error
    }

    return {
      poolId: poolInfo.poolId,
      amountAInUi: new BigNumber(rawQuote.depositA.toString()).shiftedBy(-decimalsA).toFormat(),
      amountBInUi: new BigNumber(rawQuote.depositB.toString()).shiftedBy(-decimalsB).toFormat(),
      lpTokensOutUi: new BigNumber(rawQuote.mintLp.toString()).shiftedBy(-lpTokenDecimals).toFormat(),
      coinTypeA: poolInfo.coinTypeA, // Sourced from input poolInfo
      coinTypeB: poolInfo.coinTypeB, // Sourced from input poolInfo
      lpCoinType: poolInfo.lpTokenType, // Sourced from input poolInfo
      rawQuote: rawQuote,
    };

  } catch (error: any) {
    return null;
  }
}

/**
 * Gets the user's LP token balance for a specific pool.
 */
export async function getUserSteammLpBalance(
  suiClient: SuiClient,
  userAddress: string,
  poolInfo: PoolInfo | null // Allow null to handle cases where poolInfo might not be loaded
): Promise<CoinBalance | null> {
  if (!suiClient || !userAddress) {
    return null;
  }
  if (!poolInfo || !poolInfo.lpTokenType) {
    return null;
  }

  try {
    const lpBalance = await suiClient.getBalance({
      owner: userAddress,
      coinType: poolInfo.lpTokenType,
    });
    return lpBalance;
  } catch (error) {
    return null;
  }
}

/**
 * Gets a quote for removing liquidity based on LP token amount.
 */
export async function getSteammRemoveLiquidityQuote(
  steammSdk: SteammSDK | null,
  poolInfo: PoolInfo,
  lpAmountString: string, // UI amount of LP tokens to remove
  lpDecimals: number 
): Promise<RedeemQuote | null> {
  if (!steammSdk) { return null; }
  if (!poolInfo) { return null; }

  let lpAmountRawBigInt: bigint;
  try {
    lpAmountRawBigInt = BigInt(new BigNumber(lpAmountString).shiftedBy(lpDecimals).integerValue(BigNumber.ROUND_FLOOR).toString());
    if (lpAmountRawBigInt <= 0n) {
      throw new Error("LP amount must be positive.");
    }
  } catch (e) {
    return null;
  }

  try {
    const banks: BankList = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);
    if (!bankInfoA || !bankInfoB) throw new Error(`Could not find BankInfo for pool assets ${poolInfo.coinTypeA}/${poolInfo.coinTypeB}`);

    // Construct QuoteRedeemParams
    // Base QuoteRedeemArgs is { lpTokens }
    const params: QuoteRedeemParams = {
      poolInfo: poolInfo,
      bankInfoA: bankInfoA,
      bankInfoB: bankInfoB,
      lpTokens: lpAmountRawBigInt,
    };

    const quote: RedeemQuote = await steammSdk.Pool.quoteRedeem(params);
    return quote;

  } catch (error) {
    return null;
  }
}

/**
 * Fetches and formats user positions across all relevant STEAMM pools using sdk.getUserPositions.
 */
export async function getSteammUserPositions(
  steammSdk: SteammSDK | null,
  suiClient: SuiClient, // For metadata
  userAddress: string
): Promise<UserLiquidityPositionInfo[]> {
  if (!steammSdk) { return []; }
  if (!suiClient || !userAddress) { return []; }
  
  try {
    // const rawPositions = await steammSdk.getUserPositions(userAddress); // Original call
    // Temporary mock to avoid SDK issues or until SDK is stable/patched
    const rawPositions = await steammSdk.getUserPositions(userAddress);

    if (!rawPositions || rawPositions.length === 0) {
        return [];
    }

    // Fetch all pools once to create a lookup map
    const allPools = await steammSdk.getPools();
    const poolInfoMap: Record<string, PoolInfo> = {};
    allPools.forEach(p => { poolInfoMap[p.poolId] = p; });

    const formattedPositions: UserLiquidityPositionInfo[] = [];
    const metadataCache: Record<string, CoinMetadata | null> = {};

    const getMeta = async (coinType: string): Promise<CoinMetadata | null> => {
      if (!coinType) return null; // Handle cases where coinType might be undefined from poolInfo
      if (metadataCache[coinType] === undefined) {
          try {
              metadataCache[coinType] = await suiClient.getCoinMetadata({ coinType }) || null;
          } catch (e) {
              metadataCache[coinType] = null;
          }
      }
      return metadataCache[coinType];
    };

    for (const pos of rawPositions) {
      const poolInfo = poolInfoMap[pos.poolId];
      await delay(200); // Add a delay to avoid rate limiting
      
      const [metaA, metaB, metaLp] = await Promise.all([
        getMeta(pos.coinTypeA),
        getMeta(pos.coinTypeB),
        poolInfo ? getMeta(poolInfo.lpTokenType) : Promise.resolve(null),
      ]);

      const decimalsA = metaA?.decimals ?? 0;
      const decimalsB = metaB?.decimals ?? 0;
      const decimalsLp = metaLp?.decimals ?? 9; 

      const symbolA = metaA?.symbol || pos.coinTypeA.split('::').pop()?.substring(0, 6) || 'UNK';
      const symbolB = metaB?.symbol || pos.coinTypeB.split('::').pop()?.substring(0, 6) || 'UNK';
      const lpSymbol = metaLp?.symbol || poolInfo?.lpTokenType.split('::').pop()?.substring(0,6) || 'LP';

      formattedPositions.push({
        poolId: pos.poolId,
        poolType: poolInfo?.quoterType ?? 'Unknown',
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
        symbolA: symbolA,
        symbolB: symbolB,
        lpCoinType: poolInfo?.lpTokenType ?? 'UnknownLPType',
        lpSymbol: lpSymbol,
        lpDecimals: decimalsLp,
        lpCoinBalanceUi: pos.lpTokenBalance.shiftedBy(-decimalsLp).toFormat(decimalsLp > 6 ? 6 : decimalsLp), 
        pooledAmountAUi: pos.balanceA.shiftedBy(-decimalsA).toFormat(decimalsA > 6 ? 6 : decimalsA), 
        pooledAmountBUi: pos.balanceB.shiftedBy(-decimalsB).toFormat(decimalsB > 6 ? 6 : decimalsB), 
      });
    }
    return formattedPositions;

  } catch (error: any) {
    return [];
  }
}

// ============================================================
// ==                ROUTED SWAP FUNCTIONS                   ==
// ============================================================

/**
 * Executes a multi-hop swap using the best route found by the SDK.
 */
export async function executeSteammRoutedSwap(
  suiClient: SuiClient, // Retained for logging or coin metadata if findOrCreateCoinOfRequiredBalance is used more broadly
  steammSdk: SteammSDK | null,
  wallet: MvpWalletAdapter,
  coinInType: string, 
  coinInDecimals: number, 
  coinOutType: string, 
  amountInString: string, 
  coinInObjectId?: string 
): Promise<SuiTransactionBlockResponse | null> {
  if (!steammSdk) {
    return null;
  }
  if (!wallet.address) {
    return null;
  }

  try {
    const amountInRaw = BigInt(new BigNumber(amountInString).shiftedBy(coinInDecimals).toString());
    if (amountInRaw <= 0n) {
      return null;
    }

    const swapRouteData = await steammSdk.Router.getBestSwapRoute(
      { coinIn: coinInType, coinOut: coinOutType }, 
      amountInRaw
    );

    if (!swapRouteData || !swapRouteData.route || swapRouteData.route.length === 0) {
      return null;
    }
    const { route, quote: multiSwapQuote } = swapRouteData;

    const tx = new Transaction();
    tx.setSender(wallet.address);

    let coinInArg: TransactionArgument | string;
    if (coinInObjectId) {
      coinInArg = tx.object(coinInObjectId); 
    } else if (coinInType === SUI_TYPE_ARG) {
      const suiCoin = await findOrCreateCoinOfRequiredBalance(tx, suiClient, wallet.address, amountInRaw.toString());
      if (!suiCoin) {
        return null;
      }
      coinInArg = suiCoin;
    } else {
      return null;
    }

    // steammSdk.Router.swapWithRoute is Promise<void>
    // It modifies the transaction (tx) in place and the contract handles sending output to the user.
    await steammSdk.Router.swapWithRoute(tx, {
      coinIn: coinInArg, 
      route: route,
      quote: multiSwapQuote 
    });
    
    // No explicit transferObjects needed here if swapWithRoute handles output transfer internally.

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      // silent success
    } else {
      // silent error
    }
    return result;

  } catch (error: any) {
    return null;
  }
}

// Helper function (ensure this is robust if kept, especially for non-SUI)
async function findOrCreateCoinOfRequiredBalance(
  tx: Transaction, 
  suiClient: SuiClient, 
  ownerAddress: string, 
  amountRequiredRaw: string
): Promise<TransactionArgument | null> {
  const requiredBN = new BigNumber(amountRequiredRaw);
  const coins = await suiClient.getCoins({ owner: ownerAddress, coinType: SUI_TYPE_ARG });
  
  let primaryCoinArg: TransactionArgument | undefined;
  const otherCoinArgs: TransactionArgument[] = []; // Ensure these are TransactionArgument

  for (const coin of coins.data) {
    const coinObjArg = tx.object(coin.coinObjectId);
    if (new BigNumber(coin.balance).gte(requiredBN)) {
      const [splitCoin] = tx.splitCoins(coinObjArg, [tx.pure.u64(amountRequiredRaw)]);
      return splitCoin;
    }
    if (!primaryCoinArg) primaryCoinArg = coinObjArg;
    else otherCoinArgs.push(coinObjArg);
  }

  if (primaryCoinArg && otherCoinArgs.length > 0) {
    tx.mergeCoins(primaryCoinArg, otherCoinArgs); // Now using TransactionArgument[]
    const [splitCoin] = tx.splitCoins(primaryCoinArg, [tx.pure.u64(amountRequiredRaw)]);
    return splitCoin;
  } else if (primaryCoinArg) {
    const [splitCoin] = tx.splitCoins(primaryCoinArg, [tx.pure.u64(amountRequiredRaw)]);
    return splitCoin;
  }
  
  return null;
} 