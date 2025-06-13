import { SuiClient, CoinMetadata } from '@mysten/sui/client';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { getDefaultSuilendClient, initializeSuilendClient } from '../src/protocols/suilend/suilend.client';
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { SUILEND_DEFAULT_MARKET_CONFIG } from '../src/protocols/suilend/suilend.config';
import { Reserve as RawSuilendReserve } from '@suilend/sdk/_generated/suilend/reserve/structs'; // For typing raw reserves
import { parseReserve, ParsedReserve } from '@suilend/sdk/parsers/reserve'; // For parsing
import BigNumber from 'bignumber.js'; // For BigNumberReplacer
import { normalizeStructTag, SUI_TYPE_ARG } from '@mysten/sui/utils'; // IMPORT ADDED
import { getSuilendMarketAssets } from '../src/protocols/suilend/suilend.actions';

const TEST_TIMEOUT = 200000; // 200 seconds
jest.setTimeout(TEST_TIMEOUT);

let suiClient: SuiClient;
let suilendClient: SuilendSDKClient | null = null;
let rawReserves: RawSuilendReserve<string>[] = []; // Store raw reserves
const fullCoinMetadataMap: Record<string, CoinMetadata | null> = {}; // Keep for on-demand filling

// Helper for logging BigNumber and BigInt
const bigNumberReplacer = (key: any, value: any) => {
    if (BigNumber.isBigNumber(value)) {
      return value.toString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
};

describe('Suilend Actions - Advanced Simulation (Isolated)', () => {
    beforeAll(async () => {
        console.log("--- Initializing Suilend Test Setup for Advanced Simulation (mainnet) ---");
        suiClient = getSuiClient('mainnet');

        if (!SUILEND_DEFAULT_MARKET_CONFIG) {
            throw new Error("SUILEND_DEFAULT_MARKET_CONFIG is not defined. Check src/protocols/suilend/suilend.config.ts");
        }

        try {
            suilendClient = await initializeSuilendClient(suiClient, SUILEND_DEFAULT_MARKET_CONFIG);
            if (suilendClient) {
                console.log("Advanced Sim: SuilendClient initialized for market:", SUILEND_DEFAULT_MARKET_CONFIG.name);
                if (suilendClient.lendingMarket && suilendClient.lendingMarket.reserves) {
                    rawReserves = suilendClient.lendingMarket.reserves;
                    console.log(`Advanced Sim: Fetched ${rawReserves.length} raw reserves from SuilendClient.`);
                } else {
                    console.error("Advanced Sim: SuilendClient lendingMarket or reserves not available after initialization.");
                    rawReserves = []; // Ensure it's an empty array
                }
            } else {
                console.error("Advanced Sim: Failed to initialize SuilendClient (initializeSuilendClient returned null for default config)");
            }
        } catch (error) {
            console.error("Advanced Sim: Error during SuilendClient initialization:", error);
            suilendClient = null; // Ensure client is null on error
            rawReserves = []; // Ensure it's an empty array on error
        }
    });

    it('should have initialized suiClient and suilendClient', () => {
        expect(suiClient).toBeDefined();
        expect(suilendClient).not.toBeNull();
        expect(rawReserves.length).toBeGreaterThan(0); // Expect some reserves to be fetched
    });

    it('should display coinType.name for all raw reserves', () => {
        console.log(`\n--- Raw Reserve coinType.name Listing (Total: ${rawReserves.length}) ---`);
        if (rawReserves.length === 0) {
            console.log("No raw reserves available to display.");
            return;
        }
        rawReserves.forEach(reserve => {
            // The 'coinType' field in Reserve<string> is an object { name: string }
            const coinTypeName = reserve.coinType && typeof reserve.coinType.name === 'string' 
                ? reserve.coinType.name 
                : 'Unknown or malformed coinType structure';
            console.log(`Reserve ID: ${reserve.id}, CoinType Name: ${coinTypeName}`);
        });
        console.log("--- End of Raw Reserve Listing ---");
    });

    it('should fetch metadata and parse details for SUI reserve', async () => {
        if (!suiClient || !suilendClient || rawReserves.length === 0) {
            console.warn("Skipping SUI reserve parsing: suiClient, suilendClient, or rawReserves not available.");
            return;
        }
        
        const SUI_COIN_TYPE_IN_RESERVE = "0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"; // Adjusted based on logs
        const SUI_METADATA_COIN_TYPE = "0x2::sui::SUI"; // For getCoinMetadata
        let suiReserveRaw: RawSuilendReserve<string> | undefined;

        suiReserveRaw = rawReserves.find(r => r.coinType && r.coinType.name === SUI_COIN_TYPE_IN_RESERVE);

        if (!suiReserveRaw) {
            console.error(`Could not find raw reserve for SUI using actual name: ${SUI_COIN_TYPE_IN_RESERVE}`);
            expect(suiReserveRaw).toBeDefined(); 
            return; 
        }
        console.log(`Found raw SUI reserve, ID: ${suiReserveRaw.id}, using coinType.name: ${SUI_COIN_TYPE_IN_RESERVE}`);

        // 1. Collect all unique raw coin type names from the SUI reserve (main + rewards)
        const allRelevantRawCoinTypeNames = new Set<string>();
        if (suiReserveRaw.coinType?.name) {
            allRelevantRawCoinTypeNames.add(suiReserveRaw.coinType.name);
        }
        suiReserveRaw.depositsPoolRewardManager?.poolRewards?.forEach(reward => {
            if (reward && reward.coinType?.name) {
                allRelevantRawCoinTypeNames.add(reward.coinType.name);
            }
        });
        suiReserveRaw.borrowsPoolRewardManager?.poolRewards?.forEach(reward => {
            if (reward && reward.coinType?.name) {
                allRelevantRawCoinTypeNames.add(reward.coinType.name);
            }
        });

        console.log('All relevant raw coin type names for SUI reserve and its rewards:', Array.from(allRelevantRawCoinTypeNames));

        // 2. Fetch metadata for all unique, normalized coin types
        const comprehensiveMetadataMap: Record<string, CoinMetadata | null> = {};
        for (const rawName of allRelevantRawCoinTypeNames) {
            try {
                const normalizedCoinType = normalizeStructTag(rawName);
                if (comprehensiveMetadataMap[normalizedCoinType] === undefined) { // Fetch only if not already fetched
                    console.log(`Fetching metadata for normalized type: ${normalizedCoinType} (from raw: ${rawName})`);
                    const metadata = await suiClient.getCoinMetadata({ coinType: normalizedCoinType });
                    comprehensiveMetadataMap[normalizedCoinType] = metadata || null;
                }
            } catch (e) {
                const normalizedWithError = normalizeStructTag(rawName); // try to normalize for key consistency
                console.error(`Failed to fetch or normalize metadata for raw coin type: ${rawName} (normalized: ${normalizedWithError})`, e);
                if (comprehensiveMetadataMap[normalizedWithError] === undefined) {
                    comprehensiveMetadataMap[normalizedWithError] = null;
                }
            }
        }

        console.log("Comprehensive metadata map constructed:", JSON.stringify(comprehensiveMetadataMap, bigNumberReplacer, 2));

        // 3. Attempt to parse the SUI reserve using the comprehensive metadata map
        try {
            console.log(`Attempting to parse SUI reserve (ID: ${suiReserveRaw.id}) using parseReserve with comprehensive map...`);
            const parsedSuiReserve: ParsedReserve = parseReserve(suiReserveRaw, comprehensiveMetadataMap as Record<string, CoinMetadata>); // Cast needed if nulls present but parser expects no nulls
            console.log("Successfully parsed SUI reserve:", JSON.stringify(parsedSuiReserve, bigNumberReplacer, 2));
            
            // Add assertions here to verify parts of parsedSuiReserve
            expect(parsedSuiReserve).toBeDefined();
            expect(parsedSuiReserve.coinType).toEqual(normalizeStructTag(SUI_COIN_TYPE_IN_RESERVE)); // Or SUI_METADATA_COIN_TYPE
            expect(parsedSuiReserve.token.symbol).toEqual("SUI");

        } catch (error) {
            console.error(`Error calling parseReserve for SUI reserve (ID: ${suiReserveRaw.id}) WITH COMPREHENSIVE MAP:`, error);
            console.error("Raw SUI Reserve that failed parsing:", JSON.stringify(suiReserveRaw, bigNumberReplacer, 2));
            console.error("Comprehensive Metadata map used for parsing:", JSON.stringify(comprehensiveMetadataMap, bigNumberReplacer, 2));
            throw error; // Re-throw to fail the test
        }
    });

    it('should run a main advanced simulation test (placeholder)', () => {
        console.log('Running main advanced simulation test (placeholder)...');
        expect(true).toBe(true);
    });
});

describe('Suilend Advanced SDK Simulation Tests', () => {
  let suiClient: SuiClient;
  let suilendSDKClient: SuilendSDKClient;

  beforeAll(async () => {
    suiClient = getSuiClient('mainnet'); 
    if (!SUILEND_DEFAULT_MARKET_CONFIG) {
      throw new Error("SUILEND_DEFAULT_MARKET_CONFIG is not defined. Check suilend.config.ts");
    }
    suilendSDKClient = await initializeSuilendClient(suiClient, SUILEND_DEFAULT_MARKET_CONFIG);
    
    if (!suilendSDKClient.lendingMarket) {
        throw new Error("Failed to load lendingMarket data in suilendSDKClient during initialization.");
    }
  }, 30000); // Increased timeout for beforeAll

  test('Should fetch, parse, and log SUI reserve asset data in the new detailed format', async () => {
    console.log('[TEST_STEP] Calling getSuilendMarketAssets...');
    const marketAssets = await getSuilendMarketAssets(suilendSDKClient, suiClient);

    if (!marketAssets || marketAssets.length === 0) {
      console.error("No market assets returned from getSuilendMarketAssets.");
      throw new Error("No market assets returned.");
    }
    console.log(`[TEST_STEP] getSuilendMarketAssets returned ${marketAssets.length} assets.`);

    // Normalize coinType before comparison
    const suiAsset = marketAssets.find(asset => normalizeStructTag(asset.asset.coinType) === SUI_TYPE_ARG);

    if (!suiAsset) {
      console.error("SUI asset not found in marketAssets after attempting normalization.");
      const foundCoinTypes = marketAssets.map(a => ({ original: a.asset.coinType, normalized: normalizeStructTag(a.asset.coinType) }));
      console.log("Found coin types (original and normalized):", JSON.stringify(foundCoinTypes, null, 2));
      console.log("Expected SUI_TYPE_ARG:", SUI_TYPE_ARG);
      throw new Error("SUI asset not found.");
    }

    console.log('\n=== SUI Market Asset (Variação 2: Detalhes Intermediários) ===\n');
    console.log(JSON.stringify(suiAsset, bigNumberReplacer, 2));
    console.log('\n==============================================================\n');

    expect(suiAsset).toBeDefined();
    expect(suiAsset.reserveId).toBeDefined();
    expect(suiAsset.asset).toBeDefined();
    expect(normalizeStructTag(suiAsset.asset.coinType)).toEqual(SUI_TYPE_ARG);
    expect(suiAsset.asset.symbol).toEqual('SUI');
    expect(suiAsset.marketStats).toBeDefined();
    expect(suiAsset.currentApys).toBeDefined();
    expect(suiAsset.config).toBeDefined();
    expect(suiAsset.activeRewards).toBeDefined();
    expect(suiAsset.activeRewards.deposit).toBeInstanceOf(Array);
    expect(suiAsset.activeRewards.borrow).toBeInstanceOf(Array);
    expect(suiAsset.cTokenInfo).toBeDefined();

    expect(typeof suiAsset.asset.priceUsd).toBe('string');
    expect(isNaN(parseFloat(suiAsset.asset.priceUsd))).toBe(false);

  }, 60000);

}); 