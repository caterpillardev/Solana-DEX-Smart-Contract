// tests/springsui.actions.test.ts
import { SuiClient, getFullnodeUrl, SuiTransactionBlockResponse, CoinMetadata } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { LstClient, LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';
import { normalizeStructTag, SUI_DECIMALS } from '@mysten/sui/utils';

// Import helpers and actions
import { MvpWalletAdapter, getSuiBalance, getUserTokenBalance, getTokenMeta } from '../src/protocols/mystensui/mystenSui.actions';
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { SuiNetwork } from '../src/protocols/mystensui/mystenSui.config';
import { initializeLstClient, getLstInfoByCoinType } from '../src/protocols/springsui/springsui.client'; // Assuming getLstInfoByCoinType might be useful
import { 
    discoverSpringSuiLstPools,
    getSpringSuiPoolApys,
    stakeSuiForSpringSuiLst,
    redeemSpringSuiLstForSui,
    getUserLstDetails,
    SpringSuiPoolApyInfo,
    stakeSuiForParaSui,
} from '../src/protocols/springsui/springsui.actions';
import { SpringSuiUserLSTInfo } from '../src/protocols/springsui/springsui.types';

dotenv.config();

// --- Environment Variables ---
const TEST_NETWORK: Exclude<SuiNetwork, 'custom'> = (process.env.TEST_SUI_NETWORK as Exclude<SuiNetwork, 'custom'>) || 'mainnet';
const privateKeyBase64 = process.env.TEST_WALLET_PRIVATE_KEY;

// --- Test Configuration ---
// Option 1: Define a specific LST to test (e.g., afSUI if its mainnet coinType is known and stable)
const TARGET_LST_COIN_TYPE: string | undefined = process.env.TEST_SPRING_SUI_TARGET_LST_COIN_TYPE; // e.g., "0x...::afsui::AFSUI"
const STAKE_AMOUNT_SUI_STR = process.env.TEST_SPRING_SUI_STAKE_AMOUNT || '0.01'; // Amount of SUI to stake

jest.setTimeout(300000); // 300 seconds for mainnet transactions

// Helper function for sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to stringify objects with BigNumber/BigInt
function stringifyWithBigNumbers(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
        if (value instanceof BigNumber) {
            return value.toString();
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    }, 2);
}

const canRunWriteTests = privateKeyBase64;

describe(`SpringSui Actions on ${TEST_NETWORK}`, () => {
    let suiClient: SuiClient;
    let keypair: Ed25519Keypair;
    let senderAddress: string;
    let walletAdapter: MvpWalletAdapter;

    let discoveredLstPools: Record<string, LiquidStakingObjectInfo> = {};
    let selectedLstInfo: LiquidStakingObjectInfo | undefined;
    let selectedLstClient: LstClient | undefined;
    let selectedLstCoinType: string | undefined;
    let selectedLstMetadata: CoinMetadata | null = null;
    
    let initialSuiBalance: string | null = null;
    let initialLstBalance: string | null = null;


    beforeAll(async () => {
        if (!canRunWriteTests) {
            console.warn(`Skipping SpringSui write tests on ${TEST_NETWORK}: Missing TEST_WALLET_PRIVATE_KEY.`);
            throw new Error("Required env vars missing for SpringSui write tests.");
        }
        console.log(`--- Initializing SpringSui Test Setup for ${TEST_NETWORK} ---`);

        suiClient = getSuiClient(TEST_NETWORK);

        try {
            const { schema, secretKey } = decodeSuiPrivateKey(privateKeyBase64!);
            if ((schema as string) !== 'ED25519') {
                throw new Error('Private key schema must be Ed25519');
            }
            keypair = Ed25519Keypair.fromSecretKey(secretKey);
            senderAddress = keypair.getPublicKey().toSuiAddress();
            console.log(`Test Wallet Address: ${senderAddress}`);
        } catch (e: any) {
            console.error("Failed to decode private key:", e.message);
            throw new Error(`Invalid TEST_WALLET_PRIVATE_KEY: ${e.message}`);
        }
        
        walletAdapter = {
            address: senderAddress,
            signAndExecuteTransactionBlock: async (txInput) => {
                const result = await suiClient.signAndExecuteTransaction({
                    signer: keypair,
                    transaction: txInput.transactionBlock,
                    options: txInput.options ?? { showEffects: true, showObjectChanges: true, showEvents: true },
                });
                if (result.effects?.status?.status !== 'success') {
                    console.error('[WalletAdapter] TX failed!', result.effects?.status?.error, result.errors);
                }
                return result;
            }
        };

        // Discover LST pools
        discoveredLstPools = await discoverSpringSuiLstPools(suiClient);
        expect(Object.keys(discoveredLstPools).length).toBeGreaterThan(0);
        console.log(`Discovered ${Object.keys(discoveredLstPools).length} LST pools.`);

        if (TARGET_LST_COIN_TYPE) {
            const normalizedTarget = normalizeStructTag(TARGET_LST_COIN_TYPE);
            selectedLstInfo = Object.values(discoveredLstPools).find(
                pool => normalizeStructTag(pool.type) === normalizedTarget
            );
            if (selectedLstInfo) {
                selectedLstCoinType = selectedLstInfo.type; // The type field IS the LST coin type
                console.log(`Using target LST: ${selectedLstCoinType}`);
            } else {
                console.warn(`Target LST ${TARGET_LST_COIN_TYPE} not found among discovered pools. Will try to pick the first one.`);
            }
        }

        if (!selectedLstInfo) {
            const firstPoolKey = Object.keys(discoveredLstPools)[0];
            if (firstPoolKey) {
                selectedLstInfo = discoveredLstPools[firstPoolKey];
                selectedLstCoinType = selectedLstInfo.type; // The type field IS the LST coin type
                console.log(`No target LST specified or found, selected first discovered LST: ${selectedLstCoinType}`);
            } else {
                throw new Error("No LST pools discovered, cannot proceed with tests.");
            }
        }
        
        expect(selectedLstInfo).toBeDefined();
        expect(selectedLstCoinType).toBeDefined();

        selectedLstClient = await initializeLstClient(suiClient, selectedLstInfo!);
        expect(selectedLstClient).toBeDefined();
        
        selectedLstMetadata = await getTokenMeta(suiClient, selectedLstCoinType!);
        expect(selectedLstMetadata).toBeDefined();
        console.log(`Selected LST for testing: ${selectedLstMetadata?.symbol} (${selectedLstCoinType}) with ${selectedLstMetadata?.decimals} decimals.`);

        // Fetch initial balances
        const suiBal = await getSuiBalance(suiClient, senderAddress);
        initialSuiBalance = suiBal ? new BigNumber(suiBal.rawBalance).shiftedBy(-SUI_DECIMALS).toFixed() : "0";
        console.log(`Initial SUI Balance: ${initialSuiBalance} SUI`);

        if (selectedLstCoinType) {
            const lstBalInfo = await getUserTokenBalance(suiClient, senderAddress, selectedLstCoinType);
            initialLstBalance = lstBalInfo ? new BigNumber(lstBalInfo.balance).toFixed() : "0";
            console.log(`Initial ${selectedLstMetadata?.symbol} Balance: ${initialLstBalance}`);
        }
    });

    afterEach(async () => {
        console.log('Waiting 5 seconds after test...');
        await sleep(5000);
    });

    it('should discover SpringSui LST pools', () => {
        console.log("\n--- Test: Discover SpringSui LST Pools ---");
        expect(Object.keys(discoveredLstPools).length).toBeGreaterThan(0);
        console.log("Discovered pools:", stringifyWithBigNumbers(discoveredLstPools));
    });

    it('should get APY for the selected LST pool', async () => {
        console.log(`\n--- Test: Get APY for ${selectedLstMetadata?.symbol} ---`);
        expect(selectedLstCoinType).toBeDefined();
        const apys: SpringSuiPoolApyInfo[] = await getSpringSuiPoolApys(suiClient, discoveredLstPools, selectedLstCoinType!);
        expect(apys.length).toBe(1);
        const poolApy = apys[0];
        expect(poolApy).toBeDefined();
        expect(poolApy.coinType).toEqual(selectedLstCoinType);
        expect(poolApy.apyPercent).not.toEqual("N/A");
        console.log(`${selectedLstMetadata?.symbol} APY: ${poolApy.apyPercent}`);
        console.log("Pool APY Info:", stringifyWithBigNumbers(poolApy));
    });
    
    it('should allow user to stake SUI for the selected LST', async () => {
        console.log(`\n--- Test: Stake ${STAKE_AMOUNT_SUI_STR} SUI for ${selectedLstMetadata?.symbol} ---`);
        expect(suiClient).toBeDefined();
        expect(selectedLstClient).toBeDefined();
        expect(walletAdapter).toBeDefined();
        expect(STAKE_AMOUNT_SUI_STR).toBeDefined();

        const initialLstBalBN = new BigNumber(initialLstBalance || 0);

        const result = await stakeSuiForSpringSuiLst(
            suiClient,
            selectedLstClient!,
            walletAdapter,
            STAKE_AMOUNT_SUI_STR
        );
        expect(result).toBeDefined();
        expect(result?.effects?.status?.status).toEqual('success');
        console.log(`Stake successful! Digest: ${result?.digest}`);

        if (result?.digest && result?.effects?.status?.status === 'success') {
            await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
            console.log(`TX (stake) ${result.digest} processed.`);

            const currentLstBalInfo = await getUserTokenBalance(suiClient, senderAddress, selectedLstCoinType!);
            expect(currentLstBalInfo).toBeDefined();
            const currentLstBalBN = new BigNumber(currentLstBalInfo!.balance);
            console.log(`Balance of ${selectedLstMetadata?.symbol} after stake: ${currentLstBalBN.toFixed()}`);
            expect(currentLstBalBN.isGreaterThan(initialLstBalBN)).toBe(true);
            // Store this for redeem test, as a string representation of BigNumber
            initialLstBalance = currentLstBalBN.toFixed(); 
        } else {
            throw new Error(`Stake transaction failed or no digest: ${result?.effects?.status?.error}`);
        }
    });

    it('should get user LST details after staking', async () => {
        console.log(`\n--- Test: Get User LST Details for ${selectedLstMetadata?.symbol} After Staking ---`);
        expect(selectedLstClient).toBeDefined(); // LstClient for APY
        expect(senderAddress).toBeDefined();
        expect(selectedLstCoinType).toBeDefined();

        const details: SpringSuiUserLSTInfo | null = await getUserLstDetails(
            suiClient,
            selectedLstClient!, 
            senderAddress,
            selectedLstCoinType!
        );
        expect(details).toBeDefined();
        expect(details?.lstCoinType).toEqual(selectedLstCoinType);
        expect(new BigNumber(details!.lstBalanceUi).isGreaterThan(0)).toBe(true); // Should have some balance
        expect(details?.apyPercent).not.toEqual("N/A");
        // Check for SUI equivalent if the selected LST was ParaSUI (or if exchange rate was generally fetchable)
        if (selectedLstCoinType === '0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI') {
            expect(details?.suiEquivalentUi).toBeDefined();
            expect(new BigNumber(details!.suiEquivalentUi!).isGreaterThan(0)).toBe(true);
            console.log(`   SUI Equivalent: ${details?.suiEquivalentUi}`);
        }
        console.log("User LST Details after stake:", stringifyWithBigNumbers(details));
    });

    // New test case for stakeSuiForParaSui
    // This test assumes TARGET_LST_COIN_TYPE is set to ParaSUI or ParaSUI is discoverable
    // It will essentially repeat the generic stake but call the specific function.
    if (selectedLstCoinType === '0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI') {
        it('should allow user to stake SUI specifically for ParaSUI using dedicated function', async () => {
            const paraSuiStakeAmount = '0.005'; // Use a slightly different amount to differentiate
            console.log(`\n--- Test: Stake ${paraSuiStakeAmount} SUI specifically for ParaSUI ---`);
            
            // Fetch current ParaSUI balance before this specific stake
            const lstBalInfoBefore = await getUserTokenBalance(suiClient, senderAddress, selectedLstCoinType!);
            const initialParaSuiBalBN = new BigNumber(lstBalInfoBefore?.balance || 0);

            const result = await stakeSuiForParaSui(
                suiClient,
                walletAdapter,
                paraSuiStakeAmount,
                TEST_NETWORK // Pass the network
            );
            expect(result).toBeDefined();
            expect(result?.effects?.status?.status).toEqual('success');
            console.log(`Stake for ParaSUI successful! Digest: ${result?.digest}`);

            if (result?.digest && result?.effects?.status?.status === 'success') {
                await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
                console.log(`TX (stake ParaSUI specific) ${result.digest} processed.`);

                const currentLstBalInfo = await getUserTokenBalance(suiClient, senderAddress, selectedLstCoinType!);
                expect(currentLstBalInfo).toBeDefined();
                const currentParaSuiBalBN = new BigNumber(currentLstBalInfo!.balance);
                console.log(`Balance of ${selectedLstMetadata?.symbol} after ParaSUI specific stake: ${currentParaSuiBalBN.toFixed()}`);
                expect(currentParaSuiBalBN.isGreaterThan(initialParaSuiBalBN)).toBe(true);
                initialLstBalance = currentParaSuiBalBN.toFixed(); // Update global initial LST balance for next test (redeem)
            } else {
                throw new Error(`ParaSUI specific stake transaction failed or no digest: ${result?.effects?.status?.error}`);
            }
        });
    }

    it('should allow user to redeem some LST for SUI', async () => {
        const initialLstBalanceForRedeemBN = new BigNumber(initialLstBalance || '0');
        // Calculate amount to redeem based on LST decimals for the function call
        const amountToRedeemLST_BN = initialLstBalanceForRedeemBN.div(2);
        const amountToRedeemLST_str = amountToRedeemLST_BN.toFixed(selectedLstMetadata!.decimals);

        console.log(`\n--- Test: Redeem ${amountToRedeemLST_str} ${selectedLstMetadata?.symbol} for SUI ---`);
        
        expect(suiClient).toBeDefined();
        expect(selectedLstClient).toBeDefined();
        expect(walletAdapter).toBeDefined();
        expect(selectedLstMetadata).toBeDefined();
        
        const lstBalanceBeforeRedeemBN = new BigNumber(initialLstBalance || '0'); // Same as initialLstBalanceForRedeemBN
        if (lstBalanceBeforeRedeemBN.isLessThanOrEqualTo(0) || amountToRedeemLST_BN.isLessThanOrEqualTo(0)) {
            console.warn("SKIPPING REDEEM TEST: No LST balance to redeem or redeem amount is zero.");
            return; 
        }
        console.log(`Attempting to redeem ${amountToRedeemLST_str} ${selectedLstMetadata?.symbol}`);


        const result = await redeemSpringSuiLstForSui(
            suiClient,
            selectedLstClient!,
            walletAdapter,
            amountToRedeemLST_str // Pass the string formatted to LST decimals
        );
        expect(result).toBeDefined();
        expect(result?.effects?.status?.status).toEqual('success');
        console.log(`Redeem successful! Digest: ${result?.digest}`);

        if (result?.digest && result?.effects?.status?.status === 'success') {
            await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
            console.log(`TX (redeem) ${result.digest} processed.`);

            const currentLstBalInfo = await getUserTokenBalance(suiClient, senderAddress, selectedLstCoinType!);
            expect(currentLstBalInfo).toBeDefined();
            const currentLstBalBN = new BigNumber(currentLstBalInfo!.balance);
            console.log(`Balance of ${selectedLstMetadata?.symbol} after redeem: ${currentLstBalBN.toFixed()}`);
            // Check if balance decreased (allow for small tolerance if full redeem wasn't exact)
            expect(currentLstBalBN.isLessThan(lstBalanceBeforeRedeemBN)).toBe(true);
        } else {
            throw new Error(`Redeem transaction failed or no digest: ${result?.effects?.status?.error}`);
        }
    });
}); 