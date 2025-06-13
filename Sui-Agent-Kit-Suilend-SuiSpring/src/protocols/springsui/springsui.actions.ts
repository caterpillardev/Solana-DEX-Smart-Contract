import { SuiClient, SuiTransactionBlockResponse, CoinMetadata, CoinStruct, PaginatedCoins } from '@mysten/sui/client';
import { Transaction, TransactionObjectInput, TransactionArgument } from '@mysten/sui/transactions';
import { LstClient, fetchLiquidStakingInfo, LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';
import { MvpWalletAdapter, getTokenMeta, getUserTokenBalance } from '../mystensui/mystenSui.actions';
import { AFSUI_LST_CONFIG_PLACEHOLDER, PARA_SUI_MAINNET_COIN_TYPE } from './springsui.config';
import { getSpecificLstClient } from './springsui.client';
import { SpringSuiUserLSTInfo } from './springsui.types';
import { SuiNetwork } from '../mystensui/mystenSui.config';
import BigNumber from 'bignumber.js';
import {
  fetchRegistryLiquidStakingInfoMap,
} from '@suilend/springsui-sdk/client';
import { SUI_DECIMALS } from '@mysten/sui/utils';

// Helper function to get LST <-> SUI exchange rate
export async function getLstSuiExchangeRate(
    suiClient: SuiClient,
    lstInfo: LiquidStakingObjectInfo // Use LiquidStakingObjectInfo to fetch the full LiquidStakingInfo
): Promise<BigNumber | null> {
    try {
        const rawSdkLstInfo = await fetchLiquidStakingInfo(lstInfo, suiClient);
        
        const totalSuiRaw = BigInt(rawSdkLstInfo.storage.totalSuiSupply.toString()); // Ensure string for BigInt
        const totalLstRaw = BigInt(rawSdkLstInfo.lstTreasuryCap.totalSupply.value.toString()); // Ensure string for BigInt

        if (totalLstRaw > 0n) { // Avoid division by zero if no LST minted yet
            // Rate: How much SUI do you get for 1 LST unit (raw for raw)
            const exchangeRate = new BigNumber(totalSuiRaw.toString())
                                 .div(new BigNumber(totalLstRaw.toString()));
            return exchangeRate;
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function getUserLstDetails(
  suiClient: SuiClient,
  lstClient: LstClient, // Used for APY and to get LiquidStakingObjectInfo
  userAddress: string,
  lstCoinType: string // The specific LST coin type
): Promise<SpringSuiUserLSTInfo | null> {
  const meta = await getTokenMeta(suiClient, lstCoinType);
  if (!meta) return null;

  const balanceInfo = await getUserTokenBalance(suiClient, userAddress, lstCoinType);
  let lstBalanceUi = "0.00";
  let lstBalanceRaw = "0";

  if (balanceInfo) {
    // Assuming balanceInfo.balance is UI formatted number, and rawBalance is available if needed for precision
    // For suiEquivalent, we need raw LST balance.
    lstBalanceUi = new BigNumber(balanceInfo.balance).toFixed(meta.decimals > 2 ? meta.decimals : 2); // Ensure at least 2 dec for UI
    lstBalanceRaw = new BigNumber(balanceInfo.balance).shiftedBy(meta.decimals).toString();
  } 

  let apyPercent = "N/A";
  try {
    const apy = await lstClient.getSpringSuiApy();
    apyPercent = apy.multipliedBy(100).toFixed(2) + '%';
  } catch (apyError) {
    if (!balanceInfo) {
        return {
            lstCoinType,
            lstSymbol: meta.symbol,
            lstBalanceUi: "0.00",
            apyPercent: "N/A",
        };
    }
  }

  let suiEquivalentUi: string | undefined;
  try {
    const exchangeRate = await getLstSuiExchangeRate(suiClient, lstClient.liquidStakingObject);
    if (exchangeRate && lstBalanceRaw !== "0") {
      const suiEquivalentRaw = new BigNumber(lstBalanceRaw).multipliedBy(exchangeRate);
      suiEquivalentUi = suiEquivalentRaw.shiftedBy(-SUI_DECIMALS).toFormat(SUI_DECIMALS > 2 ? SUI_DECIMALS : 2);
    }
  } catch (rateError) {
    // silent error
  }

  return {
    lstCoinType,
    lstSymbol: meta.symbol,
    lstBalanceUi,
    apyPercent,
    suiEquivalentUi,
  };
}

// Helper to get an LST client for default afSUI for convenience in UI calls
export async function getDefaultAfSuiLstClient(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): Promise<LstClient | null> {
    return getSpecificLstClient(network, AFSUI_LST_CONFIG_PLACEHOLDER.coinType);
}

/**
 * Discovers available SpringSui LST pools registered in the central registry.
 * 
 * @param suiClient Initialized SuiClient.
 * @returns A promise resolving to a map where keys are LST coin types (strings)
 *          and values are LiquidStakingObjectInfo, or an empty object on error.
 */
export async function discoverSpringSuiLstPools(
  suiClient: SuiClient
): Promise<Record<string, LiquidStakingObjectInfo>> {
  try {
    // The SDK function returns a slightly looser type, but we expect LiquidStakingObjectInfo
    const lstInfoMap = await fetchRegistryLiquidStakingInfoMap(suiClient);
    const verifiedInfoMap: Record<string, LiquidStakingObjectInfo> = {};
    for (const coinType in lstInfoMap) {
      const info = lstInfoMap[coinType];
      // Basic check for the expected fields
      if (info && typeof info.id === 'string' && typeof info.type === 'string' && typeof info.weightHookId === 'string') {
        verifiedInfoMap[coinType] = info as LiquidStakingObjectInfo;
      } else {
        // silent error
      }
    }
    return verifiedInfoMap;
  } catch (error) {
    return {};
  }
}

// ============================================================
// Implementation for getSpringSuiPoolApys
// ============================================================

export interface SpringSuiPoolApyInfo {
  coinType: string;
  symbol: string;
  apyPercent: string;
  lstInfo: LiquidStakingObjectInfo;
}

/**
 * Fetches APY for a specific LST pool.
 * @param suiClient 
 * @param lstPools Map of discovered pools (NÃO enriquecidos).
 * @param specificCoinType The LST coin type for which to fetch APY (now mandatory).
 */
export async function getSpringSuiPoolApys(
  suiClient: SuiClient,
  lstPools: Record<string, LiquidStakingObjectInfo>, // Espera LiquidStakingObjectInfo
  specificCoinType: string 
): Promise<SpringSuiPoolApyInfo[]> { 
  const results: SpringSuiPoolApyInfo[] = [];
  
  const lstInfo = lstPools[specificCoinType]; // Agora é LiquidStakingObjectInfo

  if (!lstInfo) {
    console.warn(`[getSpringSuiPoolApys] LST with coinType '${specificCoinType}' not found in provided lstPools.`);
    return results; 
  }
  
  let apyString = "N/A";
  let symbol = specificCoinType.split('::').pop() || "LST_FALLBACK"; // Fallback inicial, será substituído se getTokenMeta funcionar

  try {
    // Obter metadados para o símbolo
    const metadata = await getTokenMeta(suiClient, specificCoinType);
    if (metadata && metadata.symbol) {
        symbol = metadata.symbol;
    }

    const tempLstClient = await LstClient.initialize(suiClient, lstInfo); // lstInfo é LiquidStakingObjectInfo
    const apyBigNumber = await tempLstClient.getSpringSuiApy();
    apyString = apyBigNumber.multipliedBy(100).toFixed(2) + '%';

  } catch (error) {
    console.warn(`[getSpringSuiPoolApys] Could not fetch APY or full metadata for ${specificCoinType}. Error: ${error instanceof Error ? error.message : String(error)}. Using fallback symbol if necessary.`);
    // apyString permanece "N/A", symbol permanece como fallback se getTokenMeta falhou antes do erro de APY
  }

  results.push({
    coinType: specificCoinType, 
    symbol: symbol, // Usar o símbolo obtido (ou fallback)
    apyPercent: apyString,
    lstInfo: lstInfo, 
  });
  
  return results;
}

// ============================================================
// Implementation for stakeSuiForSpringSuiLst
// ============================================================

/**
 * Stakes SUI to mint a specific LST.
 * @param suiClient 
 * @param lstClient Initialized LstClient for the target LST pool.
 * @param wallet 
 * @param amountSuiToStakeString Amount of SUI to stake (e.g., "10.5").
 */
export async function stakeSuiForSpringSuiLst(
  suiClient: SuiClient,
  lstClient: LstClient,
  wallet: MvpWalletAdapter,
  amountSuiToStakeString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }
  if (!lstClient) {
    return null;
  }
  const lstCoinType = lstClient.liquidStakingObject.type;

  let amountSuiToStakeRaw: string;
  try {
    amountSuiToStakeRaw = new BigNumber(amountSuiToStakeString)
      .shiftedBy(SUI_DECIMALS) // SUI has SUI_DECIMALS (9)
      .integerValue(BigNumber.ROUND_FLOOR) // Ensure integer value for MIST
      .toString();
    if (new BigNumber(amountSuiToStakeRaw).lte(0)) {
      throw new Error("Amount to stake must be positive.");
    }
  } catch (e) {
    return null;
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);

  try {
    lstClient.mintAmountAndRebalanceAndSendToUser(
      tx,
      wallet.address,
      amountSuiToStakeRaw
    );
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      const newLstCoin = result.objectChanges?.find(
        (oc): oc is Extract<typeof oc, { type: 'created' }> => 
          oc.type === 'created' && 
          oc.objectType === lstCoinType && 
          (oc.owner as any)?.AddressOwner === wallet.address 
      );
      // silent success
    } else {
      // silent error
    }
    return result;

  } catch (error) {
    return null;
  }
}

// ============================================================
// Specific Staking Function for ParaSui
// ============================================================
/**
 * Stakes SUI specifically for ParaSUI LST.
 * This is a convenience wrapper around stakeSuiForSpringSuiLst.
 * @param suiClient 
 * @param wallet 
 * @param amountSuiToStakeString
 * @param network
 */
export async function stakeSuiForParaSui(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  amountSuiToStakeString: string,
  network: Exclude<SuiNetwork, 'custom'> = 'mainnet' // Added network parameter for client init
): Promise<SuiTransactionBlockResponse | null> {
  const paraSuiLstClient = await getSpecificLstClient(network, PARA_SUI_MAINNET_COIN_TYPE);

  if (!paraSuiLstClient) {
    return null;
  }

  // Call the generic staking function with the ParaSUI client
  return stakeSuiForSpringSuiLst(
    suiClient,
    paraSuiLstClient,
    wallet,
    amountSuiToStakeString
  );
}

// ============================================================
// Implementation for redeemSpringSuiLstForSui
// ============================================================

/**
 * Redeems a specific LST for SUI.
 * @param suiClient For fetching LST metadata and gas price.
 * @param lstClient Initialized LstClient for the target LST pool.
 * @param wallet 
 * @param amountLstToRedeemString Amount of LST to redeem (e.g., "50.0").
 */
export async function redeemSpringSuiLstForSui(
  suiClient: SuiClient, // Needed for gas price and LST metadata
  lstClient: LstClient,
  wallet: MvpWalletAdapter,
  amountLstToRedeemString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) { 
      console.error("Redeem LST Error: Wallet address not found.");
      return null; 
  }
  if (!lstClient) { 
      console.error("Redeem LST Error: LstClient not provided.");
      return null; 
  }

  const lstCoinType = lstClient.liquidStakingObject.type;

  const meta = await getTokenMeta(suiClient, lstCoinType);
  if (!meta) {
      console.error(`Redeem LST Error: Could not fetch metadata for ${lstCoinType}.`);
      return null;
  }
  const lstDecimals = meta.decimals;

  let amountLstToRedeemRawBigInt: bigint;
  try {
    const bnAmount = new BigNumber(amountLstToRedeemString)
      .shiftedBy(lstDecimals)
      .integerValue(BigNumber.ROUND_FLOOR);
    if (bnAmount.lte(0)) { 
      console.error("Redeem LST Error: Amount to redeem must be positive.");
      return null; 
    }
    amountLstToRedeemRawBigInt = BigInt(bnAmount.toString());
  } catch (e: any) { 
      console.error("Redeem LST Error: Invalid amount string.", e?.message);
      return null; 
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);
  // Gas settings can be set here or handled by the wallet adapter later
  // For now, let's assume wallet adapter or Sui SDK defaults handle gas if not explicitly set by MCP client.

  try {
    // Step 1: Find and prepare the LST coin input
    let allUserLstCoins: CoinStruct[] = [];
    let cursor: string | null | undefined = null;
    do {
      const coinsResponse: PaginatedCoins = await suiClient.getCoins({ owner: wallet.address, coinType: lstCoinType, cursor });
      allUserLstCoins = allUserLstCoins.concat(coinsResponse.data);
      cursor = coinsResponse.nextCursor;
    } while (cursor);

    if (allUserLstCoins.length === 0) {
      console.error(`Redeem LST Error: No ${lstCoinType} coins found for address ${wallet.address}.`);
      return null;
    }

    // Sort coins by balance to prefer using fewer, larger coins if merging, or smallest sufficient if splitting one.
    // For splitting a single coin, finding the smallest one that's >= amount is good.
    // For merging, the order might not strictly matter as much as collecting enough.
    // Let's try a strategy: find the smallest coin that is sufficient, or collect and merge if no single coin is.

    let lstCoinArgument: TransactionArgument | null = null;

    // Strategy 1: Find a single coin that can be used (exact match or can be split)
    let bestSingleCoinToSplit: CoinStruct | null = null;
    for (const coin of allUserLstCoins) {
      const coinBalance = BigInt(coin.balance);
      if (coinBalance === amountLstToRedeemRawBigInt) {
        lstCoinArgument = tx.object(coin.coinObjectId);
        break; 
      }
      if (coinBalance > amountLstToRedeemRawBigInt) {
        if (!bestSingleCoinToSplit || coinBalance < BigInt(bestSingleCoinToSplit.balance)) {
          bestSingleCoinToSplit = coin;
        }
      }
    }

    if (lstCoinArgument) {
      // Exact match found and used
    } else if (bestSingleCoinToSplit) {
      // Split from the smallest sufficient single coin
      [lstCoinArgument] = tx.splitCoins(tx.object(bestSingleCoinToSplit.coinObjectId), [amountLstToRedeemRawBigInt.toString()]);
    } else {
      // Strategy 2: Collect and merge coins if no single coin was sufficient
      allUserLstCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance))); // Largest first for merging
      
      let selectedCoinsForMerging: CoinStruct[] = [];
      let currentMergedBalance = 0n;
      for (const coin of allUserLstCoins) {
        selectedCoinsForMerging.push(coin);
        currentMergedBalance += BigInt(coin.balance);
        if (currentMergedBalance >= amountLstToRedeemRawBigInt) {
          break;
        }
      }

      if (currentMergedBalance < amountLstToRedeemRawBigInt) {
        console.error(`Redeem LST Error: Insufficient total balance of ${lstCoinType}. Required: ${amountLstToRedeemRawBigInt}, Available: ${currentMergedBalance}.`);
        return null;
      }

      const coinObjectsForMerging = selectedCoinsForMerging.map(c => tx.object(c.coinObjectId));
      const primaryCoin = coinObjectsForMerging[0];
      if (coinObjectsForMerging.length > 1) {
        tx.mergeCoins(primaryCoin, coinObjectsForMerging.slice(1));
      }
      // Now primaryCoin holds the merged balance.
      if (currentMergedBalance === amountLstToRedeemRawBigInt) {
        lstCoinArgument = primaryCoin;
      } else { // currentMergedBalance > amountLstToRedeemRawBigInt, need to split the merged coin
        [lstCoinArgument] = tx.splitCoins(primaryCoin, [amountLstToRedeemRawBigInt.toString()]);
      }
    }
    
    if (!lstCoinArgument) {
        // This case should ideally not be reached if the balance checks are correct
        console.error("Redeem LST Error: Failed to prepare LST coin for redemption.");
        return null;
    }

    // Step 2: Call the SDK's redeem function with the prepared LST coin
    const suiCoinResult = lstClient.redeem(tx, lstCoinArgument);

    // Step 3: Transfer the redeemed SUI to the user
    tx.transferObjects([suiCoinResult], wallet.address);
    
    // Log the transaction block data for debugging IF NEEDED (can be removed after confirming fix)
    // console.log("SpringSui Redeem - Transaction Block Data (inside action, manual prep):", JSON.stringify(tx.blockData, null, 2));

    // RE-ADDED: Signing and execution
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result?.effects?.status.status === 'success') {
        // silent success
    } else {
        console.error("Redeem LST Info: Transaction execution did not report success.", result?.effects?.status?.error);
    }
    return result; // Return the SuiTransactionBlockResponse

  } catch (error: any) { 
      console.error("ERROR IN redeemSpringSuiLstForSui ACTION CATCH BLOCK (manual prep):", {
        message: error?.message,
        name: error?.name,
        // stack: error?.stack, // Stack can be very long
        errorObject: JSON.stringify(error, null, 2)
      });
      return null; 
  }
} 