import { SuiClient, SuiTransactionBlockResponse, CoinMetadata } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { Obligation as RawSuilendObligation } from '@suilend/sdk/_generated/suilend/obligation/structs';
import { Reserve } from '@suilend/sdk/_generated/suilend/reserve/structs';
import { MvpWalletAdapter } from '../mystensui/mystenSui.actions';
import {
  SuilendObligationDetails,
  ObligationHistoryPage,
  UserSuilendObligationIdentifiers,
  SuilendMarketAssetLarge,
  ObligationPosition,
  SimplifiedUserReward
} from './suilend.types';
import { parseReserve, ParsedReserve } from '@suilend/sdk/parsers/reserve';
import { parseObligation, ParsedObligation } from '@suilend/sdk/parsers/obligation';
import BigNumber from 'bignumber.js';
import { normalizeStructTag, SUI_TYPE_ARG as SUI_TYPE_ARG_FROM_SDK } from '@mysten/sui/utils';
import { getObligationHistoryPage as sdkGetObligationHistoryPage } from '@suilend/sdk/utils/obligation';
import { SUI_TYPE_ARG, SUI_TYPE_ARG_LONG_HEX } from './suilend.config';

// Local type definition for TypeName if it cannot be imported easily from Sui/SDK types directly
interface LocalTypeName { name: string; }

// Helper function to stringify BigInts
const bigIntReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

/**
 * @returns {SuilendObligationDetails} The transformed obligation details.
 */
export function transformParsedObligationToDetails(
  parsedObligation: ParsedObligation,
  rawObligation: RawSuilendObligation<string>,
  parsedReserveMap: Map<string, ParsedReserve>
): SuilendObligationDetails {
  const logPrefix = "[transformParsedObligationToDetails]";

  const bnBorrowedAmountUsd = new BigNumber(parsedObligation.borrowedAmountUsd || '0');
  const bnBorrowLimitUsd = new BigNumber(parsedObligation.borrowLimitUsd || '0');
  const bnDepositedAmountUsd = new BigNumber(parsedObligation.depositedAmountUsd || '0');

  let healthFactor = "Infinity";
  if (bnBorrowedAmountUsd.gt(0)) {
    healthFactor = bnBorrowLimitUsd.div(bnBorrowedAmountUsd).toFixed(4); 
  }
  const netValueUsd = bnDepositedAmountUsd.minus(bnBorrowedAmountUsd).toString();

  const transformPosition = (
    rawPosition: ParsedObligation['deposits'][number] | ParsedObligation['borrows'][number],
    isDeposit: boolean
  ): ObligationPosition => {
    const positionLogPrefix = `${logPrefix}[${isDeposit ? 'Deposit' : 'Borrow'}:${rawPosition.coinType}]`;
    const simplifiedRewards: SimplifiedUserReward[] = [];
    
    const positionReserve = parsedReserveMap.get(normalizeStructTag(rawPosition.coinType));

    if (rawPosition.userRewardManager && rawPosition.userRewardManager.rewards && positionReserve) {
      for (const userReward of rawPosition.userRewardManager.rewards as any[]) { 
        if (userReward && userReward.poolRewardId) {
          let poolRewardDetails: any | null = null;
          const rewardManagerToCheck = isDeposit ? positionReserve.depositsPoolRewardManager : positionReserve.borrowsPoolRewardManager;

          if (rewardManagerToCheck && rewardManagerToCheck.poolRewards) {
            poolRewardDetails = rewardManagerToCheck.poolRewards.find((pr: any) => pr.id === userReward.poolRewardId);
          }

          if (poolRewardDetails) {
            const rewardReserve = parsedReserveMap.get(normalizeStructTag(poolRewardDetails.coinType));
            if (rewardReserve) {
              const rewardEarnedAmountAtomic = userReward.earnedRewards.value; 
              const rewardPrice = rewardReserve.price?.toString() || "0"; 
              const rewardIconUrl = rewardReserve.token?.iconUrl || null;
              const rewardMintDecimals = rewardReserve.token?.decimals ?? 0;
              const rewardSymbol = rewardReserve.token?.symbol || 'UNK';

              const earnedAmountFormatted = new BigNumber(rewardEarnedAmountAtomic)
                .shiftedBy(-rewardMintDecimals)
                .toFixed(6);
              
              const earnedAmountUsd = new BigNumber(earnedAmountFormatted)
                .times(rewardPrice)
                .decimalPlaces(2) 
                .toString();

              simplifiedRewards.push({
                rewardSymbol: rewardSymbol,
                rewardIconUrl: rewardIconUrl,
                rewardMintDecimals: rewardMintDecimals,
                earnedAmount: earnedAmountFormatted,
                rewardPrice: rewardPrice,
                earnedAmountUsd: earnedAmountUsd,
              });
            } else {
            }
          } else {
          }
        }
      }
    }

    const positionAmountBn = isDeposit 
        ? new BigNumber((rawPosition as ParsedObligation['deposits'][number]).depositedAmount)
        : new BigNumber((rawPosition as ParsedObligation['borrows'][number]).borrowedAmount);

    const positionAmountUsdBn = isDeposit
        ? new BigNumber((rawPosition as ParsedObligation['deposits'][number]).depositedAmountUsd)
        : new BigNumber((rawPosition as ParsedObligation['borrows'][number]).borrowedAmountUsd);

    const ctokenAmountBn = isDeposit
        ? new BigNumber((rawPosition as ParsedObligation['deposits'][number]).depositedCtokenAmount)
        : undefined;

    return {
      coinType: normalizeStructTag(rawPosition.coinType),
      symbol: positionReserve?.token?.symbol || 'UNK',
      iconUrl: positionReserve?.token?.iconUrl || null,
      amount: positionAmountBn.shiftedBy(-(positionReserve?.token?.decimals ?? 0)).toFormat(6),
      amountUsd: positionAmountUsdBn.toFormat(2),
      price: positionReserve?.price?.toString() || '0',
      mintDecimals: positionReserve?.token?.decimals ?? 0,
      ctokenAmount: ctokenAmountBn ? ctokenAmountBn.shiftedBy(-(positionReserve?.mintDecimals ?? 0)).toFormat(6) : undefined,
      reserveOpenLtvPct: positionReserve?.config?.openLtvPct ?? 0,
      reserveDepositAprPercent: positionReserve?.depositAprPercent?.toFixed(4) || '0.0000',
      reserveBorrowAprPercent: positionReserve?.borrowAprPercent?.toFixed(4) || '0.0000',
      rewards: simplifiedRewards,
    };
  };

  const deposits: ObligationPosition[] = (parsedObligation.deposits || []).map((dep) => transformPosition(dep, true));
  const borrows: ObligationPosition[] = (parsedObligation.borrows || []).map((bor) => transformPosition(bor, false));

  const details: SuilendObligationDetails = {
      id: parsedObligation.id,
      depositedAmountUsd: bnDepositedAmountUsd.toFormat(2),
      borrowedAmountUsd: bnBorrowedAmountUsd.toFormat(2),
      netValueUsd: netValueUsd, 
      borrowLimitUsd: bnBorrowLimitUsd.toFormat(2),
      unhealthyBorrowValueUsd: new BigNumber(parsedObligation.unhealthyBorrowValueUsd).toFormat(2),
      healthFactor: healthFactor, 
      depositPositionCount: parsedObligation.depositPositionCount ?? 0,
      borrowPositionCount: parsedObligation.borrowPositionCount ?? 0,
      deposits,
      borrows,
  };
  return details;
}

export async function getSuilendMarketAssets(
  suilendClient: SuilendSDKClient,
  suiClient: SuiClient,
  outputFormat: 'small' | 'large' = 'small'
): Promise<SuilendMarketAssetLarge[]> {
  if (!suilendClient || !suilendClient.lendingMarket) {
    return [];
  }

  const rawReserves: Reserve<string>[] = suilendClient.lendingMarket.reserves;
  
  if (!rawReserves || rawReserves.length === 0) {
    return [];
  }

  const allCoinTypesToFetch = new Set<string>();
  rawReserves.forEach((r: Reserve<string>) => {
    if (r.coinType && (r.coinType as unknown as LocalTypeName).name) {
      allCoinTypesToFetch.add((r.coinType as unknown as LocalTypeName).name);
    }
    r.depositsPoolRewardManager?.poolRewards?.forEach((pr: any) => {
      if (pr && pr.coinType && (pr.coinType as unknown as LocalTypeName).name) { 
        allCoinTypesToFetch.add((pr.coinType as unknown as LocalTypeName).name);
      }
    });
    r.borrowsPoolRewardManager?.poolRewards?.forEach((pr: any) => {
      if (pr && pr.coinType && (pr.coinType as unknown as LocalTypeName).name) { 
        allCoinTypesToFetch.add((pr.coinType as unknown as LocalTypeName).name);
      }
    });
  });

  const uniqueCoinTypes = Array.from(allCoinTypesToFetch);

  const coinMetadataMap: Record<string, CoinMetadata> = {};
  await Promise.all(
    uniqueCoinTypes.map(async (coinType) => {
      let normalizedCoinType = coinType;
      try {
        normalizedCoinType = normalizeStructTag(coinType);
        const metadata = await suiClient.getCoinMetadata({ coinType: normalizedCoinType });
        if (metadata) {
          coinMetadataMap[normalizedCoinType] = metadata;
        } else {
          coinMetadataMap[normalizedCoinType] = {
            decimals: 0,
            name: normalizedCoinType.split('::').pop() || 'Unknown',
            symbol: normalizedCoinType.split('::').pop()?.substring(0, 4).toUpperCase() || 'UNK',
            description: `Metadata not found for ${normalizedCoinType}`,
            iconUrl: null,
            id: null, 
          };
        }
      } catch (error) {
        try { normalizedCoinType = normalizeStructTag(coinType); } catch (_) { }
        coinMetadataMap[normalizedCoinType] = {
            decimals: 0,
            name: normalizedCoinType.split('::').pop() || 'Unknown',
            symbol: normalizedCoinType.split('::').pop()?.substring(0, 4).toUpperCase() || 'UNK',
            description: `Error fetching metadata for ${normalizedCoinType}`,
            iconUrl: null,
            id: null, 
        };
      }
    })
  );

  const extendedAssets: SuilendMarketAssetLarge[] = [];
  for (const rawReserve of rawReserves) {
      try {
        const mainCoinTypeName = (rawReserve.coinType as unknown as LocalTypeName)?.name;
        if (!mainCoinTypeName) {
            continue;
        }
        let normalizedMainCoinType = normalizeStructTag(mainCoinTypeName);

        if (normalizedMainCoinType === SUI_TYPE_ARG_LONG_HEX) {
            normalizedMainCoinType = SUI_TYPE_ARG;
        }
        
        const parsedSdkReserve: ParsedReserve = parseReserve(rawReserve, coinMetadataMap);

        const priceBigNumber = parsedSdkReserve.price;
        const totalDepositedUsd = new BigNumber(parsedSdkReserve.depositedAmount).times(priceBigNumber).toFormat(2);
        const totalBorrowedUsd = new BigNumber(parsedSdkReserve.borrowedAmount).times(priceBigNumber).toFormat(2);
        const availableToBorrowUsd = new BigNumber(parsedSdkReserve.availableAmount).times(priceBigNumber).toFormat(2);

        const marketAsset: SuilendMarketAssetLarge = {
          reserveId: parsedSdkReserve.id,
          asset: {
            coinType: normalizedMainCoinType,
            symbol: parsedSdkReserve.token.symbol,
            name: parsedSdkReserve.token.name,
            decimals: parsedSdkReserve.token.decimals,
            priceUsd: priceBigNumber.dp(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals).toString(),
            iconUrl: parsedSdkReserve.token.iconUrl,
          },
          marketStats: {
            totalDepositedAsset: new BigNumber(parsedSdkReserve.depositedAmount).toFormat(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals),
            totalDepositedUsd: totalDepositedUsd,
            totalBorrowedAsset: new BigNumber(parsedSdkReserve.borrowedAmount).toFormat(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals),
            totalBorrowedUsd: totalBorrowedUsd,
            availableToBorrowAsset: new BigNumber(parsedSdkReserve.availableAmount).toFormat(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals),
            availableToBorrowUsd: availableToBorrowUsd,
            utilizationPercent: parsedSdkReserve.utilizationPercent.toFixed(2),
            cTokenTotalSupply: new BigNumber(parsedSdkReserve.ctokenSupply).toFormat(parsedSdkReserve.mintDecimals > 4 ? 4 : parsedSdkReserve.mintDecimals, BigNumber.ROUND_DOWN),
            depositLimitAsset: new BigNumber(parsedSdkReserve.config.depositLimit).shiftedBy(-parsedSdkReserve.token.decimals).toFormat(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals), 
            borrowLimitAsset: new BigNumber(parsedSdkReserve.config.borrowLimit).shiftedBy(-parsedSdkReserve.token.decimals).toFormat(parsedSdkReserve.token.decimals > 4 ? 4 : parsedSdkReserve.token.decimals),
          },
          currentApys: {
            depositApyPercent: parsedSdkReserve.depositAprPercent.toFixed(4),
            borrowApyPercent: parsedSdkReserve.borrowAprPercent.toFixed(4),
          },
          config: {
            openLtvPercent: parsedSdkReserve.config.openLtvPct,
            closeLtvPct: parsedSdkReserve.config.closeLtvPct,
            maxCloseLtvPct: parsedSdkReserve.config.maxCloseLtvPct,
            borrowWeightBps: parsedSdkReserve.config.borrowWeightBps.toString(),
            liquidationBonusBps: parsedSdkReserve.config.liquidationBonusBps,
            borrowFeeBps: parsedSdkReserve.config.borrowFeeBps,
            spreadFeeBps: parsedSdkReserve.config.spreadFeeBps,
            protocolLiquidationFeeBps: parsedSdkReserve.config.protocolLiquidationFeeBps,
            depositLimitUsd: parsedSdkReserve.config.depositLimitUsd.toString(),
            borrowLimitUsd: parsedSdkReserve.config.borrowLimitUsd.toString(),
            isolated: parsedSdkReserve.config.isolated,
          },
          cTokenInfo: {
            coinType: "N/A",
            decimals: parsedSdkReserve.mintDecimals,
            exchangeRateToAsset: parsedSdkReserve.cTokenExchangeRate.dp(6).toString(),
          },
        };

        if (outputFormat === 'large') {
          marketAsset.rawParsedData = parsedSdkReserve;
        }

        extendedAssets.push(marketAsset);
      } catch (parseError: any) {
          const mainCoinTypeName = (rawReserve.coinType as unknown as LocalTypeName)?.name;
      }
  }
  return extendedAssets;
}

export async function ensureSuilendObligation(
  suiClient: SuiClient,
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter
): Promise<{ obligationId?: string; ownerCapId?: string; createdNow: boolean } | null> {
  if (!wallet.address || !suilendClient) {
    return null;
  }

  const marketTypeArgs: string[] = [suilendClient.lendingMarket.$typeArgs[0]];
  let obligationId: string | undefined;
  let ownerCapId: string | undefined;
  let createdNow = false;

  try {
    const ownerCaps = await SuilendSDKClient.getObligationOwnerCaps(
      wallet.address,
      marketTypeArgs,
      suiClient
    );

    if (ownerCaps && ownerCaps.length > 0) {
      const cap = ownerCaps[0];
      ownerCapId = cap.id as string;
      obligationId = cap.obligationId;
    } else {
      const tx = new Transaction();
      tx.setSender(wallet.address);
      const gasPrice = await suiClient.getReferenceGasPrice();
      tx.setGasPrice(gasPrice);

      suilendClient.createObligation(tx);
      
      const response = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (response?.effects?.status.status === 'success') {
        createdNow = true;
        
        response.objectChanges?.forEach(change => {
          if (change.type === 'created') {
            if (change.objectType.includes('::obligation::Obligation')) {
              obligationId = change.objectId;
            }
            if (change.objectType.includes('::lending_market::ObligationOwnerCap') && 
                (change.owner as { AddressOwner: string })?.AddressOwner === wallet.address) {
              ownerCapId = change.objectId;
            }
          }
        });

        if (obligationId && ownerCapId) {
        } else {
          const refreshedCaps = await SuilendSDKClient.getObligationOwnerCaps(wallet.address, marketTypeArgs, suiClient);
          if (refreshedCaps && refreshedCaps.length > 0) {
            const newCap = refreshedCaps[0];
            if (newCap) {
                ownerCapId = newCap.id as string;
                obligationId = newCap.obligationId;
            } else {
                 return null;
            }
          } else {
            return null;
          }
        }
      } else {
        return null;
      }
    }
    if (!obligationId || !ownerCapId) {
        return null;
    }
    return { obligationId, ownerCapId, createdNow };
  } catch (error) {
    return null;
  }
}

export async function depositToSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  assetCoinType: string,
  assetDecimals: number, 
  amountToDepositString: string,
  userOwnerCapId: string 
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userOwnerCapId) {
    return null;
  }

  const amountRawString = new BigNumber(amountToDepositString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    await suilendClient.depositIntoObligation(
      wallet.address,
      assetCoinType,
      amountRawString,
      tx,
      userOwnerCapId
    );
    
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'failure') {
      }
    } else {
      if (response && response.effects) {
      } else if (response) {
      } else {
      }
    }
    return response;
  } catch (error: any) {
    return null;
  }
}

export async function getSuilendObligationDetails(
  suilendClient: SuilendSDKClient,
  suiClient: SuiClient,
  obligationId: string,
): Promise<SuilendObligationDetails | null> {
  const logPrefix = `[SDK ACTION][getSuilendObligationDetails][ObligationID: ${obligationId}]`;
  try {
    const startTimeGetObligation = Date.now();
    const rawObligation = await suilendClient.getObligation(obligationId);
    const durationGetObligation = Date.now() - startTimeGetObligation;

    if (!rawObligation) {
        return null;
    }

    const startTimeMarketAssets = Date.now();
    const marketAssets = await getSuilendMarketAssets(suilendClient, suiClient, 'large'); 
    const durationMarketAssets = Date.now() - startTimeMarketAssets;

    const parsedReserveMap: Record<string, ParsedReserve> = {};
    marketAssets.forEach(asset => {
        if (asset.rawParsedData && asset.asset && asset.asset.coinType) {
             parsedReserveMap[normalizeStructTag(asset.asset.coinType)] = asset.rawParsedData as ParsedReserve;
        } else {
        }
    });

    if (parsedReserveMap[SUI_TYPE_ARG] && !parsedReserveMap[SUI_TYPE_ARG_LONG_HEX]) {
        parsedReserveMap[SUI_TYPE_ARG_LONG_HEX] = parsedReserveMap[SUI_TYPE_ARG];
    }
    if (parsedReserveMap[SUI_TYPE_ARG_LONG_HEX] && !parsedReserveMap[SUI_TYPE_ARG]) {
      parsedReserveMap[SUI_TYPE_ARG] = parsedReserveMap[SUI_TYPE_ARG_LONG_HEX];
    }
    
    const startTimeParseObligation = Date.now();
    const parsedObligation: ParsedObligation = parseObligation(rawObligation, parsedReserveMap);
    const durationParseObligation = Date.now() - startTimeParseObligation;
    
    const startTimeStringify = Date.now();
    const stringifiedParsedObligation = JSON.parse(JSON.stringify(parsedObligation, bigIntReplacer));
    const durationStringify = Date.now() - startTimeStringify;

    const startTransform = Date.now();
    const parsedReserveMapForFunc = new Map(Object.entries(parsedReserveMap));
    const finalDetails = transformParsedObligationToDetails(parsedObligation, rawObligation, parsedReserveMapForFunc);
    const durationTransform = Date.now() - startTransform;
    
    return finalDetails;

  } catch (error: any) {
    console.error(`${logPrefix} Error:`, error);
    return null;
  }
}

export async function withdrawFromSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  userObligationOwnerCapId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToWithdrawString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId || !userObligationOwnerCapId) {
    return null;
  }

  const amountRawString = new BigNumber(amountToWithdrawString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null; 
    }
    
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.withdrawAndSendToUser(
      wallet.address,
      userObligationOwnerCapId,
      userObligationId,
      assetCoinType,
      amountRawString,
      tx
    );
    
    const response = await wallet.signAndExecuteTransactionBlock({ 
        transactionBlock: tx, 
        options: { showEffects: true, showObjectChanges: true, showEvents: true }
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
      } else {
      }
    } else {
    }
    return response;
  } catch (error: any) {
    return null;
  }
}

export async function borrowFromSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  userObligationOwnerCapId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToBorrowString: string
): Promise<SuiTransactionBlockResponse | null> {
  const logPrefix = `[SDK ACTION][borrowFromSuilend][ObligationID: ${userObligationId}][Asset: ${assetCoinType}]`;

  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId || !userObligationOwnerCapId) {
    return null;
  }

  if (new BigNumber(amountToBorrowString).lte(0)) {
    return null;
  }
  const amountRawString = new BigNumber(amountToBorrowString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  try {
    const gasPrice = await suiClient.getReferenceGasPrice();
    if (gasPrice) {
      tx.setGasPrice(gasPrice);
    } else {
    }
  } catch (e: any) {
  }
  tx.setGasBudget(150000000);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null;
    }
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.borrowAndSendToUser(
      wallet.address,
      userObligationOwnerCapId,
      userObligationId,
      assetCoinType,
      amountRawString,
      tx
    );

    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
      } else {
        console.error(`${logPrefix} Borrow failed. Status: ${response.effects.status.error}. Digest: ${response.digest}`);
        if (response.events && response.events.length > 0) {
        }
      }
    } else {
      console.warn(`${logPrefix} Borrow response or effects or status missing. Response: ${JSON.stringify(response)}`);
    }
    return response;
  } catch (error: any) {
    console.error(`${logPrefix} Error during borrowFromSuilend: ${error.message}`, error.stack);
    return null;
  }
}

export async function repayToSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToRepayString: string
): Promise<SuiTransactionBlockResponse | null> {
  const logPrefix = `[SDK ACTION][repayToSuilend][ObligationID: ${userObligationId}][Asset: ${assetCoinType}]`;
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId) {
    return null;
  }

  const normalizedAssetCoinType = normalizeStructTag(assetCoinType);
  const amountRawString = new BigNumber(amountToRepayString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  if (gasPrice) {
    tx.setGasPrice(gasPrice);
  } else {
  }
  tx.setGasBudget(150000000);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null;
    }
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.repayIntoObligation(
      wallet.address,
      userObligationId,
      normalizedAssetCoinType,
      amountRawString,
      tx
    );

    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
      } else {
        console.error(`${logPrefix} Repayment failed. Status: ${response.effects.status.error}. Digest: ${response.digest}`);
        if (response.events && response.events.length > 0) {
        }
      }
    } else {
      console.warn(`${logPrefix} Repayment response or effects or status missing. Response: ${JSON.stringify(response)}`);
    }
    return response;
  } catch (error: any) {
    console.error(`${logPrefix} Error during repayToSuilend: ${error.message}`, error.stack);
    return null;
  }
}

export async function getSuilendObligationHistory(
  suiClient: SuiClient,
  obligationId: string,
  maxQuantity: number = 10,
  cursor: string | null = null
): Promise<ObligationHistoryPage | null> {
  if (!obligationId) {
    return null;
  }
  try {
    const historyPage = await sdkGetObligationHistoryPage(
      suiClient,
      obligationId,
      maxQuantity,
      cursor
    );
    return historyPage as ObligationHistoryPage;
  } catch (error) {
    return null;
  }
}

export async function getUserSuilendObligationInfo(
  suiClient: SuiClient,
  suilendClient: SuilendSDKClient,
  userAddress: string
): Promise<UserSuilendObligationIdentifiers | null> {
  const logPrefix = `[getUserSuilendObligationInfo][User: ${userAddress}]`;
  if (!userAddress || !suilendClient || !suilendClient.lendingMarket) {
    return null;
  }
  const marketTypeArgs: string[] = [suilendClient.lendingMarket.$typeArgs[0]];

  try {
    const ownerCaps: any[] = await SuilendSDKClient.getObligationOwnerCaps(
      userAddress,
      marketTypeArgs,
      suiClient
    );

    if (ownerCaps && ownerCaps.length > 0) {
      const cap = ownerCaps[0]; 
      if (cap && cap.id && cap.obligationId) {
        return {
          obligationId: cap.obligationId,
          ownerCapId: cap.id as string, 
        };
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch (error: any) {
    console.error(`${logPrefix} Error fetching obligation owner caps:`, error);
    return null;
  }
} 