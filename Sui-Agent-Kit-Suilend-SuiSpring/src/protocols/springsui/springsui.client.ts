import { SuiClient } from '@mysten/sui/client';
import { LstClient, fetchRegistryLiquidStakingInfoMap, LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';
import { SPRING_SUI_UPGRADE_CAP_ID, LiquidStakingTokenConfig, AFSUI_LST_CONFIG_PLACEHOLDER } from './springsui.config';
import { getSuiClient } from '../mystensui/mystenSui.client';
import { SuiNetwork } from '../mystensui/mystenSui.config';

// Cache for LstClients, keyed by LST object ID (market ID)
const lstClientCache: Partial<Record<string, LstClient>> = {};

// Cache for fetched LiquidStakingObjectInfo, keyed by a coin type string or a unique LST identifier
const lstInfoCache: Partial<Record<string, LiquidStakingObjectInfo>> = {};

// Variable to store the dynamically fetched package ID
let dynamicSpringSuiPackageId: string | null = null;

/**
 * Fetches the latest package ID for the SpringSui protocol using the UpgradeCap ID.
 * Caches the package ID after the first fetch.
 */
async function getSpringSuiPackageId(suiClient: SuiClient): Promise<string> {
  if (dynamicSpringSuiPackageId) {
    return dynamicSpringSuiPackageId;
  }
  const packageObject = await suiClient.getObject({
    id: SPRING_SUI_UPGRADE_CAP_ID,
    options: { showContent: true, showType: true },
  });
  if (packageObject.data?.content?.dataType !== 'moveObject') {
    throw new Error('UpgradeCap ID did not return a Move object for SpringSui package ID.');
  }
  dynamicSpringSuiPackageId = (packageObject.data.content.fields as { package: string }).package;
  if (!dynamicSpringSuiPackageId) {
    throw new Error('Could not extract package ID from UpgradeCap object for SpringSui.');
  }
  return dynamicSpringSuiPackageId;
}

/**
 * Initializes and returns an LstClient for a given LST configuration.
 * Dynamically resolves the package ID on first initialization of any LstClient.
 *
 * @param suiClient The underlying SuiClient instance.
 * @param lstConfig The configuration for the target LST.
 * @returns An initialized LstClient instance.
 */
export async function initializeLstClient(
  suiClient: SuiClient,
  lstObjectInfo: LiquidStakingObjectInfo
): Promise<LstClient> {
  if (lstClientCache[lstObjectInfo.id]) {
    return lstClientCache[lstObjectInfo.id]!;
  }

  // Ensure package ID is resolved (important for the SDK's internal workings)
  await getSpringSuiPackageId(suiClient); 

  // LstClient.initialize in the SDK itself handles setting the package ID internally now
  const client = await LstClient.initialize(suiClient, lstObjectInfo);
  lstClientCache[lstObjectInfo.id] = client;
  return client;
}

/**
 * Fetches LiquidStakingObjectInfo for a given LST coin type from the registry.
 * Caches the result.
 * @param suiClient 
 * @param targetCoinType e.g., AFSUI_LST_CONFIG_PLACEHOLDER.coinType
 * @returns LiquidStakingObjectInfo or null if not found
 */
export async function getLstInfoByCoinType(
  suiClient: SuiClient,
  targetCoinType: string
): Promise<LiquidStakingObjectInfo | null> {
  if (lstInfoCache[targetCoinType]) {
    return lstInfoCache[targetCoinType]!;
  }

  let registryMap: Record<string, Omit<LiquidStakingObjectInfo, 'weightHookId'> & { weightHookId?: string }> | null = null;
  try {
    registryMap = await fetchRegistryLiquidStakingInfoMap(suiClient);
  } catch (error) {
    console.error(`[SpringSui Client Error] Error fetching LST registry map from SDK:`, error);
    return null;
  }

  if (!registryMap) {
    console.warn(`[SpringSui Client Warn] SDK returned null or undefined LST registryMap.`);
    return null;
  }
  
  let foundEntry: (Omit<LiquidStakingObjectInfo, 'weightHookId'> & { weightHookId?: string }) | undefined = undefined;
  let lookupMethod = "";

  if (registryMap && registryMap[targetCoinType]) {
    foundEntry = registryMap[targetCoinType];
    lookupMethod = "direct key match";
  } else {
    const allValues = Object.values(registryMap);
    foundEntry = allValues.find(info => info && info.type && info.type.endsWith(targetCoinType));
    if (foundEntry) {
      lookupMethod = "endsWith match";
    }
  }
  
  if (!foundEntry) {
    console.warn(`[SpringSui Client Warn] No LST entry found for targetCoinType: "${targetCoinType}" in registryMap.`);
    return null;
  }

  if (typeof foundEntry.id !== 'string' || !foundEntry.id) {
    console.error(`[SpringSui Client Error] Found LST entry for "${targetCoinType}", but 'id' is missing or invalid:`, foundEntry.id);
    return null;
  }
  if (typeof foundEntry.type !== 'string' || !foundEntry.type) {
    console.error(`[SpringSui Client Error] Found LST entry for "${targetCoinType}", but 'type' is missing or invalid:`, foundEntry.type);
    return null;
  }
  
  if (typeof foundEntry.weightHookId !== 'string' || !foundEntry.weightHookId) {
    console.error(`[SpringSui Client Error] CRITICAL: 'weightHookId' is missing or invalid in found LST entry for "${targetCoinType}". This is required. Found entry:`, foundEntry);
    return null; 
  }

  const finalLstInfo: LiquidStakingObjectInfo = {
      id: foundEntry.id,
      type: foundEntry.type,
      weightHookId: foundEntry.weightHookId 
  };

  lstInfoCache[targetCoinType] = finalLstInfo;
  return finalLstInfo;
}


/**
 * Gets an LstClient for a specific LST, e.g., afSUI, by first fetching its info.
 *
 * @param network The Sui network.
 * @param lstConfig The static part of the LST config (like name and target coin type).
 * @returns An initialized LstClient or null if info cannot be fetched.
 */
export async function getSpecificLstClient(
  network: Exclude<SuiNetwork, 'custom'> = 'mainnet',
  targetLstCoinType: string = AFSUI_LST_CONFIG_PLACEHOLDER.coinType
): Promise<LstClient | null> {
  const suiClient = getSuiClient(network);
  const lstObjectInfo = await getLstInfoByCoinType(suiClient, targetLstCoinType);

  if (!lstObjectInfo) {
    return null;
  }
  
  return initializeLstClient(suiClient, lstObjectInfo);
} 