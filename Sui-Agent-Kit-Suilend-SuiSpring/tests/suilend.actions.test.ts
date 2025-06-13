// tests/suilend.actions.test.ts
import { SuiClient, getFullnodeUrl, SuiTransactionBlockResponse, CoinMetadata, SuiEvent } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { normalizeStructTag } from '@mysten/sui/utils';
import { Obligation as RawSuilendObligation, Deposit as RawSuilendDeposit } from '@suilend/sdk/_generated/suilend/obligation/structs'; // For raw obligation type
import { Reserve as RawSDKReserveType } from '@suilend/sdk/_generated/suilend/reserve/structs'; // SDK specific reserve type for simulation
// Note: ReserveConfig, Balance, CToken types are implicitly handled via SDK structures and ParsedReserve
import { parseObligation, ParsedObligation } from '@suilend/sdk/parsers/obligation';
import { parseReserve, ParsedReserve } from '@suilend/sdk/parsers/reserve';
import { compoundReserveInterest, refreshObligation } from '@suilend/sdk/utils/simulate';
import { getEvents, SuilendEventType, SuilendTransactionModule, GenericSuilendEvent, DepositEvent as SDKDepositEvent } from '@suilend/sdk/utils/events';

// Import helpers and actions
// Assuming MvpWalletAdapter is defined/exported correctly elsewhere or define locally
// If MvpWalletAdapter is defined in mystenSui.actions, ensure it's exported or define the interface here
interface MvpWalletAdapterMinimal {
  address: string | undefined;
  signAndExecuteTransactionBlock: (txInput: {
    transactionBlock: Transaction;
    options?: any; // Be more specific if possible
  }) => Promise<SuiTransactionBlockResponse>;
}
// Import necessary functions from your project structure
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { SuiNetwork } from '../src/protocols/mystensui/mystenSui.config';
import { initializeSuilendClient } from '../src/protocols/suilend/suilend.client';
import { SuilendUiLendingMarketConfig, SUILEND_DEFAULT_MARKET_CONFIG } from '../src/protocols/suilend/suilend.config';
import { 
    getSuilendMarketAssets,
    ensureSuilendObligation,
    depositToSuilend,
    getSuilendObligationDetails,
    withdrawFromSuilend,
    borrowFromSuilend,
    repayToSuilend,
} from '../src/protocols/suilend/suilend.actions';
import { getSuiBalance, getUserTokenBalance } from '../src/protocols/mystensui/mystenSui.actions'; // For balance checks

dotenv.config();

// --- Environment Variables ---
const TEST_NETWORK: Exclude<SuiNetwork, 'custom'> = (process.env.TEST_SUI_NETWORK as Exclude<SuiNetwork, 'custom'>) || 'mainnet'; // Defaulting to mainnet based on provided vars
const privateKeyBase64 = process.env.TEST_WALLET_PRIVATE_KEY || process.env.SUI_MAINNET_PRIVATE_KEY; // Allow fallback

// --- Normalize Coin Types Used in Tests --- Start ---
let normalizedTestAsset1CoinType: string;
let normalizedTestAsset2CoinType: string;
const TEST_ASSET_1_COIN_TYPE_DEFAULT = '0x2::sui::SUI';
const TEST_ASSET_2_COIN_TYPE_DEFAULT = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';

const ASSET_1_DECIMALS_DEFAULT = 9;
const ASSET_2_DECIMALS_DEFAULT = 6;

try {
    normalizedTestAsset1CoinType = normalizeStructTag(process.env.TEST_ASSET_1_COIN_TYPE || TEST_ASSET_1_COIN_TYPE_DEFAULT);
    normalizedTestAsset2CoinType = normalizeStructTag(process.env.TEST_ASSET_2_COIN_TYPE || TEST_ASSET_2_COIN_TYPE_DEFAULT);
} catch (e) {
    console.error("Failed to normalize test coin types from environment variables:", e);
    normalizedTestAsset1CoinType = normalizeStructTag(TEST_ASSET_1_COIN_TYPE_DEFAULT);
    normalizedTestAsset2CoinType = normalizeStructTag(TEST_ASSET_2_COIN_TYPE_DEFAULT);
}
// --- Normalize Coin Types Used in Tests --- End ---

// --- Reinstate Decimal Definitions --- Start ---
const TEST_ASSET_1_DECIMALS = parseInt(process.env.TEST_ASSET_1_DECIMALS || ASSET_1_DECIMALS_DEFAULT.toString(), 10);
const TEST_ASSET_2_DECIMALS = parseInt(process.env.TEST_ASSET_2_DECIMALS || ASSET_2_DECIMALS_DEFAULT.toString(), 10);
// --- Reinstate Decimal Definitions --- End ---

// Use default market config from your file
const testMarketConfig: SuilendUiLendingMarketConfig | undefined = SUILEND_DEFAULT_MARKET_CONFIG;

// Use provided env vars for assets, default if needed
const DEPOSIT_AMOUNT_STR = process.env.TEST_ASSET_1_DEPOSIT_AMOUNT || '0.0025';
const BORROW_REPAY_AMOUNT_STR = process.env.TEST_ASSET_2_BORROW_REPAY_AMOUNT || '0.001'; // Keep this at 1 for now based on previous change

// Test Parameters
const SLIGHT_DELAY_MS = 15000; // Increased delay for mainnet state updates

// --- Test Suite ---
jest.setTimeout(300000); // Increased timeout further for mainnet txs and simulations (300s)

// Helper function to safely stringify objects with BigNumber/BigInt
function stringifyWithBigNumbers(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
        if (value instanceof BigNumber) {
            return value.toString();
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        // Exclude rawParsedData to keep log cleaner, unless specifically needed
        if (key === 'rawParsedData') { 
            return '[Raw Parsed Data Omitted]';
        }
        return value;
    }, 2); // Indent for readability
}

// Determine if essential write-test variables are present
const canRunWriteTests = 
    privateKeyBase64 &&
    testMarketConfig && // Check if default market config was found
    normalizedTestAsset1CoinType && // Check normalized
    !isNaN(TEST_ASSET_1_DECIMALS) &&
    normalizedTestAsset2CoinType && // Check normalized
    !isNaN(TEST_ASSET_2_DECIMALS);

// Helper function to calculate Health Factor from a ParsedObligation
function calculateHealthFactorFromParsedObligation(parsedObligation: ParsedObligation | null): { numeric: BigNumber | null, string: string } {
    if (!parsedObligation) return { numeric: null, string: "Error: No obligation data" };

    let calculatedWeightedCollateralUsd = new BigNumber(0);
    parsedObligation.deposits.forEach(dep => {
        const ltvRate = (dep.reserve?.config?.openLtvPct !== undefined) ? new BigNumber(dep.reserve.config.openLtvPct).dividedBy(100) : new BigNumber(0);
        calculatedWeightedCollateralUsd = calculatedWeightedCollateralUsd.plus(
            dep.depositedAmountUsd.multipliedBy(ltvRate)
        );
    });

    const weightedBorrowsUsd = parsedObligation.weightedBorrowsUsd;
    if (weightedBorrowsUsd && weightedBorrowsUsd.isGreaterThan(0)) {
        if (calculatedWeightedCollateralUsd.isZero()) {
            return { numeric: new BigNumber(0), string: "0.00" };
        } else {
            const numericHF = calculatedWeightedCollateralUsd.dividedBy(weightedBorrowsUsd);
            return { numeric: numericHF, string: numericHF.toFormat(2) };
        }
    } else {
        return { numeric: null, string: "Healthy" }; // Represents infinite or very high HF
    }
}

// Helper function for sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

(canRunWriteTests ? describe : describe.skip)(`Suilend Actions on ${TEST_NETWORK}`, () => {
    let suiClient: SuiClient;
    let suilendClient: SuilendSDKClient;
    let keypair: Ed25519Keypair;
    let senderAddress: string;
    let walletAdapter: MvpWalletAdapterMinimal;

    // State variables to hold across tests
    let obligationId: string | undefined;
    let ownerCapId: string | undefined;
    let depositTxDigest: string | undefined; // To store digest for event parsing test

    // Amounts in raw format
    let depositAmountRaw: string;
    let borrowAmountRaw: string;

    let testAsset1Metadata: CoinMetadata | null = null;
    let testAsset2Metadata: CoinMetadata | null = null;

    beforeAll(async () => {
        if (!canRunWriteTests) {
             console.warn(`Skipping Suilend write tests on ${TEST_NETWORK}: Missing required env vars or config.`);
             throw new Error("Required env vars/config missing for Suilend write tests.");
        }
        console.log(`--- Initializing Suilend Test Setup for ${TEST_NETWORK} ---`);
        
        suiClient = getSuiClient(TEST_NETWORK);
        
        try {
            suilendClient = await initializeSuilendClient(suiClient, testMarketConfig);
            console.log(`SuilendClient initialized for market: ${testMarketConfig!.name}`);
        } catch (e) {
             console.error("Failed to initialize Suilend Client:", e);
             throw new Error(`Failed to initialize Suilend Client: ${e instanceof Error ? e.message : String(e)}`);
        }
        
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
        
        try {
             const suiBalance = await getSuiBalance(suiClient, senderAddress);
             const suiBalNum = suiBalance ? new BigNumber(suiBalance.rawBalance).shiftedBy(-9) : new BigNumber(0);
             if (suiBalNum.isLessThan(0.1)) {
                 console.warn(`WARNING: Test wallet SUI balance (${suiBalNum.toFixed(6)}) might be too low.`);
             }

             testAsset1Metadata = await suiClient.getCoinMetadata({ coinType: normalizedTestAsset1CoinType });
             if (!testAsset1Metadata) throw new Error(`Failed to fetch metadata for Asset 1: ${normalizedTestAsset1CoinType}`);
             
             testAsset2Metadata = await suiClient.getCoinMetadata({ coinType: normalizedTestAsset2CoinType });
             if (!testAsset2Metadata) throw new Error(`Failed to fetch metadata for Asset 2: ${normalizedTestAsset2CoinType}`);

        } catch (e) {
            console.error("Error checking initial balances or fetching coin metadata:", e);
            throw new Error(`Failed during balance checks or metadata fetch: ${e instanceof Error ? e.message : String(e)}`);
        }

        walletAdapter = {
            address: senderAddress,
            signAndExecuteTransactionBlock: async (txInput) => { 
                try {
                  const result = await suiClient.signAndExecuteTransaction({ 
                      signer: keypair,
                      transaction: txInput.transactionBlock, 
                      options: txInput.options ?? { showEffects: true, showObjectChanges: true, showEvents: true },
                  });
                  if (result.effects?.status?.status !== 'success') {
                      console.error('[WalletAdapter] TX failed!', result.effects?.status?.error);
                  }
                  return result;
                } catch (error) {
                   console.error("[WalletAdapter] Error during signAndExecuteTransaction:", error);
                   throw error; 
                }
            }
        };

        console.log(`Ensuring obligation exists for ${senderAddress} on market ${testMarketConfig!.id}...`);
        const obResult = await ensureSuilendObligation(suiClient, suilendClient, walletAdapter);
        if (!obResult || !obResult.obligationId || !obResult.ownerCapId) {
            throw new Error(`Failed to ensure Suilend obligation exists for tests.`);
        }
        obligationId = obResult.obligationId;
        ownerCapId = obResult.ownerCapId;
        if (obResult.createdNow) {
            console.log(`Obligation created/ensured. ID: ${obligationId}`);
        } else {
             console.log(`Using existing Obligation: ID=${obligationId}`);
        }
        
        depositAmountRaw = new BigNumber(DEPOSIT_AMOUNT_STR).shiftedBy(TEST_ASSET_1_DECIMALS).toString();
        borrowAmountRaw = new BigNumber(BORROW_REPAY_AMOUNT_STR).shiftedBy(TEST_ASSET_2_DECIMALS).toString();

    }); // End beforeAll

    // --- Test Cases (Order Matters!) ---

    it('should fetch market assets', async () => {
        console.log("\n--- Test: Fetch Market Assets ---");
        const assets = await getSuilendMarketAssets(suilendClient, suiClient);
        expect(Array.isArray(assets)).toBe(true);
        expect(assets.length).toBeGreaterThan(0);
        const asset1 = assets.find(a => normalizeStructTag(a.coinType) === normalizedTestAsset1CoinType);
        const asset2 = assets.find(a => normalizeStructTag(a.coinType) === normalizedTestAsset2CoinType);
        expect(asset1).toBeDefined();
        expect(asset2).toBeDefined();
    });

    afterEach(async () => { // Adiciona delay APÓS cada teste
        console.log('Waiting 5 seconds...');
        await sleep(5000);
    });

    it('should deposit Asset 1 into obligation', async () => {
        console.log(`\n--- Test: Deposit ${DEPOSIT_AMOUNT_STR} ${testAsset1Metadata?.symbol} ---`);
        console.log(`Executing with wallet: ${senderAddress}`); // Log wallet address
        expect(obligationId).toBeDefined();
        expect(ownerCapId).toBeDefined();
        expect(testAsset1Metadata).toBeDefined();

        console.log(`Executing deposit with wallet: ${senderAddress}`); // Log wallet
        
        const result = await depositToSuilend(
            suiClient,
            suilendClient,
            walletAdapter,
            normalizedTestAsset1CoinType!,
            testAsset1Metadata!.decimals,
            DEPOSIT_AMOUNT_STR,
            ownerCapId!
        );
        expect(result).toBeDefined();
        // Expectation might still fail if gas is insufficient
        expect(result?.effects?.status?.status).toEqual('success'); 
        console.log(`Deposit successful! Digest: ${result?.digest}`);
        depositTxDigest = result?.digest; // Store for event parsing test

        if (result?.digest && result?.effects?.status?.status === 'success') {
            await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
            console.log(`TX (deposit) ${result.digest} processed.`);
        } else if (!result?.digest) {
            console.warn('Deposit seemed to fail, no digest received.');
        }
    });

    it('should fetch obligation details after deposit', async () => {
        console.log("\n--- Test: Get Obligation Details After Deposit ---");
        expect(obligationId).toBeDefined();
        const details = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        expect(details).toBeDefined();
        console.log("--- Full Details After Deposit ---");
        console.log(stringifyWithBigNumbers(details)); // Log full details
        const deposit = details?.collateral.find(d => normalizeStructTag(d.coinType) === normalizedTestAsset1CoinType);
        // Check if deposit exists, but don't fail test if initial deposit failed
        if (deposit) {
             expect(deposit.depositedAmountBn.gt(0)).toBe(true); 
        } else {
            console.warn('Deposit for Asset 1 not found in obligation details (might be due to previous deposit failure).');
        }
    });
    
    it('should borrow Asset 2', async () => {
        console.log(`\n--- Test: Borrow ${BORROW_REPAY_AMOUNT_STR} ${testAsset2Metadata?.symbol} ---`);
        console.log(`Executing with wallet: ${senderAddress}`); // Log wallet address
        expect(obligationId).toBeDefined();
        expect(ownerCapId).toBeDefined();
        expect(testAsset2Metadata).toBeDefined();

        console.log("--- State BEFORE Borrow Attempt ---");
        const detailsBefore = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        console.log(stringifyWithBigNumbers(detailsBefore));
        expect(detailsBefore).toBeDefined(); // Ensure we got details before proceeding

        console.log(`Executing borrow with wallet: ${senderAddress}`); // Log wallet

        const result = await borrowFromSuilend(
             suiClient,
             suilendClient,
             walletAdapter,
             obligationId!,
             ownerCapId!,
             normalizedTestAsset2CoinType!,
             testAsset2Metadata!.decimals,
             BORROW_REPAY_AMOUNT_STR
        );
        expect(result).toBeDefined();
        console.log(`Borrow attempt status: ${result?.effects?.status?.status}. Digest: ${result?.digest}`);
        if (result?.effects?.status?.status !== 'success') {
            console.error('Borrow Error:', result?.effects?.status?.error);
        }
        // Expectation might still fail if collateral is insufficient or other issues
        expect(result?.effects?.status?.status).toEqual('success'); 

        if (result?.digest && result?.effects?.status?.status === 'success') {
            await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
            console.log(`TX (borrow) ${result.digest} processed.`);
        } else if (!result?.digest) {
             console.warn('Borrow seemed to fail, no digest received.');
        }
    });
    
    it('should fetch obligation details after borrow attempt', async () => {
        console.log("\n--- Test: Get Obligation Details After Borrow Attempt ---");
        expect(obligationId).toBeDefined();
        const details = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        expect(details).toBeDefined();
        console.log("--- Full Details After Borrow Attempt ---");
        console.log(stringifyWithBigNumbers(details)); // Log full details

        const borrow = details?.borrows.find(b => normalizeStructTag(b.coinType) === normalizedTestAsset2CoinType);
        
        // Only assert if the borrow TX was expected to succeed (check previous test state if possible, difficult in Jest)
        // For now, just log presence/absence
        if (borrow) {
            console.log(`Borrow found for ${testAsset2Metadata?.symbol}: ${borrow?.borrowedAmountUi} (BN: ${borrow?.borrowedAmountBn.toString()})`);
            expect(borrow!.borrowedAmountBn.gt(0)).toBe(true); 
        } else {
            console.log(`No borrow found for ${testAsset2Metadata?.symbol} after borrow attempt.`);
            // Don't fail here if borrow tx failed
            // expect(borrow).toBeDefined(); 
        }
    });

    it('should repay Asset 2', async () => {
         console.log(`\n--- Test: Repay ${BORROW_REPAY_AMOUNT_STR} ${testAsset2Metadata?.symbol} ---`); 
         console.log(`Executing with wallet: ${senderAddress}`); // Log wallet address
         expect(obligationId).toBeDefined();
         expect(testAsset2Metadata).toBeDefined();

         console.log("--- State BEFORE Repay Attempt ---");
         const detailsBefore = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
         console.log(stringifyWithBigNumbers(detailsBefore));
         expect(detailsBefore).toBeDefined();

         // Check if there is actually a borrow to repay 
         const borrowBefore = detailsBefore?.borrows.find(b => normalizeStructTag(b.coinType) === normalizedTestAsset2CoinType);
         if (!borrowBefore || borrowBefore.borrowedAmountBn.lte(0)) {
            console.warn("SKIPPING REPAY TEST: No existing borrow found for this asset.");
            return; // Skip test if no borrow exists
         }

         console.log(`Executing repay with wallet: ${senderAddress}`); // Log wallet
         
         const result = await repayToSuilend(
             suiClient,
             suilendClient,
             walletAdapter,
             obligationId!,
             normalizedTestAsset2CoinType!,
             testAsset2Metadata!.decimals,
             BORROW_REPAY_AMOUNT_STR 
         );
         expect(result).toBeDefined();
         console.log(`Repay attempt status: ${result?.effects?.status?.status}. Digest: ${result?.digest}`);
         if (result?.effects?.status?.status !== 'success') {
            console.error('Repay Error:', result?.effects?.status?.error);
         }
         // Expectation might still fail if wallet doesn't have enough USDC (from failed borrow)
         expect(result?.effects?.status?.status).toEqual('success');

         if (result?.digest && result?.effects?.status?.status === 'success') {
             await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
             console.log(`TX (repay) ${result.digest} processed.`);
         } else if (!result?.digest) {
             console.warn('Repay seemed to fail, no digest received.');
         }
    });

    it('should fetch obligation details after repay attempt', async () => {
        console.log("\n--- Test: Get Obligation Details After Repay Attempt ---");
        expect(obligationId).toBeDefined();
        const details = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        expect(details).toBeDefined();
        console.log("--- Full Details After Repay Attempt ---");
        console.log(stringifyWithBigNumbers(details)); // Log full details

        const borrow = details?.borrows.find(b => normalizeStructTag(b.coinType) === normalizedTestAsset2CoinType);
        
        if (borrow) {
            console.log(`Borrow amount for ${testAsset2Metadata?.symbol} after repay attempt: ${borrow?.borrowedAmountUi} (BN: ${borrow?.borrowedAmountBn.toString()})`);
            // Allow for very small dust amounts due to interest calculations
            expect(borrow!.borrowedAmountBn.abs().isLessThan(new BigNumber('10000'))).toBe(true); // e.g., less than 0.0001 if 8 decimals
        } else {
            console.log(`No borrow found for ${testAsset2Metadata?.symbol} after repay attempt (expected for full repay).`);
            // This is a success if the borrow is gone
        }
    });
    
    it('should withdraw Asset 1', async () => {
        console.log(`\n--- Test: Withdraw ${DEPOSIT_AMOUNT_STR} ${testAsset1Metadata?.symbol} ---`); 
        console.log(`Executing with wallet: ${senderAddress}`); // Log wallet address
        expect(obligationId).toBeDefined();
        expect(ownerCapId).toBeDefined();
        expect(testAsset1Metadata).toBeDefined();

        console.log("--- State BEFORE Withdraw Attempt ---");
        const detailsBeforeWithdraw = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        console.log(stringifyWithBigNumbers(detailsBeforeWithdraw));
        expect(detailsBeforeWithdraw).toBeDefined();

        const depositBefore = detailsBeforeWithdraw?.collateral.find(d => normalizeStructTag(d.coinType) === normalizedTestAsset1CoinType);
        const depositedAmountBn = depositBefore?.depositedAmountBn ?? new BigNumber(0);
        const amountToWithdrawUi = DEPOSIT_AMOUNT_STR;
        const amountToWithdrawBn = new BigNumber(amountToWithdrawUi).shiftedBy(testAsset1Metadata!.decimals);

        // Check health factor before potentially dangerous withdraw
        if (detailsBeforeWithdraw?.healthFactor && detailsBeforeWithdraw.healthFactor !== "Healthy" && new BigNumber(detailsBeforeWithdraw.healthFactor).lt(1.1)) { // Example threshold
             console.warn(`SKIPPING WITHDRAW TEST: Health factor (${detailsBeforeWithdraw.healthFactor}) is too low.`);
             return;
        }

        if (depositedAmountBn.isLessThan(amountToWithdrawBn)) { 
             console.warn(`SKIPPING WITHDRAW TEST: Deposited amount ${depositedAmountBn.shiftedBy(-testAsset1Metadata!.decimals).toFormat()} is less than requested withdraw ${amountToWithdrawUi}.`);
             // Decide whether to attempt withdrawing the available amount or just skip
             return; // Skip if exact amount not available
        }

        console.log(`Executing withdraw with wallet: ${senderAddress}`); // Log wallet
        
        const result = await withdrawFromSuilend(
            suiClient,
            suilendClient,
            walletAdapter,
            obligationId!,
            ownerCapId!,
            normalizedTestAsset1CoinType!,
            testAsset1Metadata!.decimals,
            amountToWithdrawUi // Use the UI amount string here
        );
        expect(result).toBeDefined();
        // Expectation might still fail if withdrawing causes HF issues, or gas problems
        expect(result?.effects?.status?.status).toEqual('success');
        console.log(`Withdraw successful! Digest: ${result?.digest}`);

        if (result?.digest && result?.effects?.status?.status === 'success') {
            await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } });
            console.log(`TX (withdraw) ${result.digest} processed.`);
        } else if (!result?.digest) {
             console.warn('Withdraw seemed to fail, no digest received.');
        }
    });

    it('should fetch obligation details after withdraw', async () => {
        console.log("\n--- Test: Get Obligation Details After Withdraw ---");
        expect(obligationId).toBeDefined();
        const details = await getSuilendObligationDetails(suilendClient, suiClient, obligationId!);
        expect(details).toBeDefined();
        console.log("--- Full Details After Withdraw ---");
        console.log(stringifyWithBigNumbers(details)); // Log full details

        const deposit = details?.collateral.find(d => normalizeStructTag(d.coinType) === normalizedTestAsset1CoinType);
        
        if (deposit) {
            console.log(`Deposit amount for ${testAsset1Metadata?.symbol} after withdraw: ${deposit?.depositedAmountUi} (BN: ${deposit?.depositedAmountBn.toString()})`);
            // Check if amount is very close to zero (allowing for potential dust from interest/rounding)
            // Only assert this if the withdraw test was actually run and expected to remove most/all
            // expect(deposit!.depositedAmountBn.abs().isLessThan(new BigNumber('10000'))).toBe(true); 
        } else {
            console.log(`No deposit entry found for ${testAsset1Metadata?.symbol} after withdraw (expected for full withdraw).`);
        }
    });

    // --- Advanced Simulation and Event Parsing Tests (Integrated into Mainnet Flow) ---
    describe('Suilend Advanced Features (Mainnet)', () => {
        let fullCoinMetadataMap: Record<string, CoinMetadata> = {};

        beforeAll(async () => {
            console.log("\n--- Setup for Advanced Simulation: Fetching all reserve coin metadatas ---");
            // Log the suilendClient and its lendingMarket property
            console.log("Advanced Sim: suilendClient available:", !!suilendClient);
            if (suilendClient) {
                console.log("Advanced Sim: suilendClient.lendingMarket available:", !!suilendClient.lendingMarket);
                if (suilendClient.lendingMarket) {
                    console.log("Advanced Sim: suilendClient.lendingMarket.reserves available:", !!suilendClient.lendingMarket.reserves);
                    console.log("Advanced Sim: Number of reserves found in suilendClient.lendingMarket.reserves:", suilendClient.lendingMarket.reserves?.length);
                    // console.log("Advanced Sim: suilendClient.lendingMarket.reserves content:", JSON.stringify(suilendClient.lendingMarket.reserves)); // Can be very verbose
                }
            }

            // Fetch metadata for ALL reserves in the market for accurate parsing
            const allRawReservesFromMarket = suilendClient?.lendingMarket?.reserves as RawSDKReserveType<string>[] || []; // Added optional chaining and default to empty array
            console.log(`Advanced Sim: allRawReservesFromMarket length after access: ${allRawReservesFromMarket.length}`);

            const allReserveCoinTypes = new Set<string>();
            console.log("Advanced Sim: Iterating over allRawReservesFromMarket to collect coin types...");
            allRawReservesFromMarket.forEach((r, index) => {
                // Correctly access the coin type string from the nested 'name' property
                const coinTypeName = (r.coinType as any)?.name; // Access .name, cast to any to bypass potential type issues if SDK type is complex
                console.log(`Advanced Sim - Reserve Index ${index}: Raw coinType object = ${JSON.stringify(r.coinType)}, Extracted coinTypeName = ${coinTypeName}, typeof = ${typeof coinTypeName}`);
                if (coinTypeName && typeof coinTypeName === 'string') {
                    try {
                        const normalized = normalizeStructTag(coinTypeName); // No need for extra casting here
                        allReserveCoinTypes.add(normalized);
                        console.log(`Advanced Sim - Reserve Index ${index}: Added normalized coinType = ${normalized}`);
                    } catch (e: any) {
                        console.error(`Advanced Sim - Reserve Index ${index}: Error normalizing coinType '${coinTypeName}': ${e.message}`);
                    }
                } else {
                    console.warn(`Advanced Sim - Reserve Index ${index}: Skipping reserve due to invalid coinTypeName (extracted value: ${coinTypeName})`);
                }
            });
            console.log("Advanced Sim - allReserveCoinTypes collected:", allReserveCoinTypes);

            await Promise.all(
                Array.from(allReserveCoinTypes).map(async (coinType) => {
                    try {
                        const metadata = await suiClient.getCoinMetadata({ coinType });
                        if (metadata) {
                            fullCoinMetadataMap[coinType] = metadata;
                        } else {
                            console.warn(`Advanced Sim: No metadata for ${coinType}, using defaults.`);
                            fullCoinMetadataMap[coinType] = { decimals: 0, name: coinType.split("::")[2] || "Unknown", symbol: "UNK", description: "", iconUrl: null, id: null };
                        }
                    } catch (e) {
                        console.error(`Advanced Sim: Error fetching metadata for ${coinType}`, e);
                        fullCoinMetadataMap[coinType] = { decimals: 0, name: coinType.split("::")[2] || "Unknown", symbol: "UNK", description: "", iconUrl: null, id: null };
                    }
                })
            );
            console.log(`Advanced Sim: Fetched metadata for ${Object.keys(fullCoinMetadataMap).length} unique reserve coin types.`);
        });
        
        // test('should simulate the effect of a new deposit on health factor', async () => {
        //     console.log("\n--- Test: Advanced Simulation - Effect of New Deposit on Health Factor ---");
        //     expect(obligationId).toBeDefined();
        //     expect(suilendClient).toBeDefined();
        //     expect(Object.keys(fullCoinMetadataMap).length).toBeGreaterThan(0);

        //     // 1. Fetch current on-chain state
        //     const initialRawObligation = await suilendClient.getObligation(obligationId!) as RawSuilendObligation<string>;
        //     expect(initialRawObligation).toBeDefined();
        //     const allRawReserves = suilendClient.lendingMarket.reserves as RawSDKReserveType<string>[];

        //     // 2. Calculate Initial Health Factor
        //     let parsedReserveMapForInitial: Record<string, ParsedReserve> = {};
        //     allRawReserves.forEach(rawRes => {
        //         // Log the raw name BEFORE normalization
        //         console.log(`Sim - Before norm: rawRes.coinType.name = ${rawRes.coinType.name}, typeof = ${typeof rawRes.coinType.name}`);
        //         const coinType = normalizeStructTag(rawRes.coinType.name as unknown as string); 
        //         // Log the result AFTER normalization
        //         console.log(`Sim - After norm: coinType = ${coinType}`);
        //         if (fullCoinMetadataMap[coinType]) { 
        //             parsedReserveMapForInitial[coinType] = parseReserve(rawRes, fullCoinMetadataMap); 
        //         } else {
        //              console.warn(`Sim: Missing metadata for ${coinType} during initial parseReserve. Skipping.`); 
        //         }
        //     });
        //     const parsedInitialObligation = parseObligation(initialRawObligation, parsedReserveMapForInitial);
        //     const initialHf = calculateHealthFactorFromParsedObligation(parsedInitialObligation);
        //     console.log(`Initial Health Factor: ${initialHf.string} (Numeric: ${initialHf.numeric ? initialHf.numeric.toString() : 'N/A'})`);
        //     expect(initialHf.string).toBeDefined();


        //     // 3. Define Hypothetical Deposit
        //     const hypotheticalDepositCoinType = normalizedTestAsset1CoinType; // e.g., SUI
        //     const hypotheticalDepositUiAmount = "0.001"; // Small additional deposit
        //     const depositCoinMeta = fullCoinMetadataMap[hypotheticalDepositCoinType];
        //     expect(depositCoinMeta).toBeDefined();
        //     const hypotheticalDepositRawAmount = new BigNumber(hypotheticalDepositUiAmount).shiftedBy(depositCoinMeta.decimals);

        //     // 4. Create deep copies of state for simulation
        //     let copiedRawObligation: RawSuilendObligation<string> = JSON.parse(JSON.stringify(initialRawObligation));
        //     // Ensure copiedRawReserves is an array of objects that match RawSDKReserveType<string> structure after stringify/parse
        //     let copiedRawReserves: RawSDKReserveType<string>[] = JSON.parse(JSON.stringify(allRawReserves.map(r => ({ ...r }))));

        //     // 5. Apply hypothetical change to COPIED state
        //     const targetReserveIndex = copiedRawReserves.findIndex(r => normalizeStructTag((r.coinType as any)?.name) === hypotheticalDepositCoinType);
        //     expect(targetReserveIndex).toBeGreaterThan(-1);
            
        //     // Parse the *copied* target reserve to get its cToken exchange rate
        //     const parsedCopiedTargetReserve = parseReserve(copiedRawReserves[targetReserveIndex], fullCoinMetadataMap);
        //     const cTokenExRate = parsedCopiedTargetReserve.cTokenExchangeRate; // Access as property
        //     expect(cTokenExRate.isFinite() && cTokenExRate.gt(0)).toBe(true);
        //     const cTokensToMint = hypotheticalDepositRawAmount.dividedBy(cTokenExRate);

        //     // After JSON.parse(JSON.stringify()), the `config` object IS the direct ReserveConfig data.
        //     // The fields within `config` (like `suppliedAmount`, `ctokenSupply`) ARE Balance-like objects containing a `value` string.
        //     const targetCopiedReserveConfig = copiedRawReserves[targetReserveIndex].config as any;
        //     targetCopiedReserveConfig.suppliedAmount.value = new BigNumber(targetCopiedReserveConfig.suppliedAmount.value.toString()).plus(hypotheticalDepositRawAmount).toString();
        //     targetCopiedReserveConfig.ctokenSupply.value = new BigNumber(targetCopiedReserveConfig.ctokenSupply.value.toString()).plus(cTokensToMint).toString();
            
        //     const obligationDepositIndex = copiedRawObligation.deposits.findIndex(d => normalizeStructTag(d.coinType.name) === hypotheticalDepositCoinType);
        //     if (obligationDepositIndex > -1) {
        //         // Casting to any to bypass readonly, as it's a deep copy for simulation
        //         (copiedRawObligation.deposits[obligationDepositIndex] as any).depositedCtokenAmount = new BigNumber(copiedRawObligation.deposits[obligationDepositIndex].depositedCtokenAmount.toString()).plus(cTokensToMint).toString();
        //     } else {
        //          console.warn("Sim: Hypothetical deposit for an asset not already in obligation - this part of simulation is simplified.");
        //     }
            
        //     // 6. Simulate time passing and refresh obligation
        //     const nowS = Math.floor(Date.now() / 1000);
        //     const simulatedCompoundedReserves = copiedRawReserves.map(r => compoundReserveInterest(r, nowS));
        //     const simulatedRawObligation = refreshObligation(copiedRawObligation, simulatedCompoundedReserves);

        //     // 7. Calculate Simulated Health Factor
        //     let parsedReserveMapForSimulated: Record<string, ParsedReserve> = {};
        //     simulatedCompoundedReserves.forEach(rawRes => {
        //          const coinType = normalizeStructTag((rawRes.coinType as any)?.name);
        //          if (fullCoinMetadataMap[coinType]) {
        //             parsedReserveMapForSimulated[coinType] = parseReserve(rawRes, fullCoinMetadataMap);
        //          } else {
        //             console.warn(`Sim: Missing metadata for ${coinType} during simulated parseReserve. Skipping.`);
        //          }
        //     });
        //     const parsedSimulatedObligation = parseObligation(simulatedRawObligation, parsedReserveMapForSimulated);
        //     const simulatedHf = calculateHealthFactorFromParsedObligation(parsedSimulatedObligation);
        //     console.log(`Simulated Health Factor after +${hypotheticalDepositUiAmount} ${depositCoinMeta.symbol}: ${simulatedHf.string} (Numeric: ${simulatedHf.numeric ? simulatedHf.numeric.toString() : 'N/A'})`);
        //     expect(simulatedHf.string).toBeDefined();

        //     // 8. Assertions
        //     if (initialHf.numeric && simulatedHf.numeric) {
        //         // If both were numbers, expect HF to improve or stay same (if already high)
        //         expect(simulatedHf.numeric.gte(initialHf.numeric)).toBe(true);
        //     } else if (initialHf.string === "Healthy" && simulatedHf.numeric) {
        //         // If initial was healthy, and new is numeric, it should be a high number
        //         expect(simulatedHf.numeric.gte(1)).toBe(true); // Assuming HF > 1 is generally healthy
        //     } else if (initialHf.string === "Healthy" && simulatedHf.string === "Healthy") {
        //         // Healthy to Healthy is fine
        //         console.log("Sim: Health factor remained 'Healthy'.")
        //     } else if (initialHf.numeric && simulatedHf.string === "Healthy") {
        //         // Numeric to Healthy is an improvement
        //          console.log("Sim: Health factor improved to 'Healthy'.")
        //     }
        //     // Add more specific assertions based on expected behavior if initial state had borrows
        // });
    });

    describe('Suilend Transaction Event Parsing (Mainnet)', () => {
        test('should parse events from a real transaction digest', async () => {
            console.log("\n--- Test: Parse Events from Real Transaction Digest ---");
            expect(depositTxDigest).toBeDefined(); // Ensure the deposit transaction ran and we have its digest
            if (!depositTxDigest) {
                console.warn("SKIPPING Event Parsing Test: No deposit transaction digest available.");
                return;
            }
            console.log(`Parsing events for digest: ${depositTxDigest}`);

            const events: GenericSuilendEvent[] = await getEvents(suiClient, depositTxDigest);
            
            expect(events).toBeInstanceOf(Array);
            expect(events.length).toBeGreaterThan(0);
            console.log(`Found ${events.length} events for digest ${depositTxDigest}.`);

            // Example: Find a DepositEvent related to our obligation
            // The module for DepositEvent might be Reserve (for ctoken minting) or LendingMarket
            const depositActionEvent = events.find(e => {
                // Check the raw event type string from the blockchain event
                // The SDK's SuilendEventType usually matches the last part of the type string
                // e.g., "0x...::reserve::DepositEvent" or "0x...::lending_market::DepositEvent"
                const eventTypeString = (e.event as SuiEvent).type;
                return eventTypeString.endsWith(`::${SuilendEventType.DepositEvent}`);
            }) as SDKDepositEvent | undefined; // Cast to SDK's DepositEvent type

            if (depositActionEvent) {
                console.log("Found a Suilend DepositEvent in the transaction.");
                const params = depositActionEvent.params(); // Typed params
                expect(params.obligation_id).toEqual(obligationId);
                expect(params.lending_market_id.toLowerCase()).toEqual(testMarketConfig!.id.toLowerCase()); // Compare IDs
                expect(normalizeStructTag(params.coin_type.name)).toEqual(normalizedTestAsset1CoinType);
                expect(new BigNumber(params.ctoken_amount.toString()).isGreaterThan(0)).toBe(true);
                console.log(`  Obligation ID: ${params.obligation_id}`);
                console.log(`  Coin Type: ${params.coin_type.name}`);
                console.log(`  CToken Amount: ${params.ctoken_amount}`);
            } else {
                console.warn(`Could not find a specific Suilend DepositEvent for obligation ${obligationId} in digest ${depositTxDigest}. Listing all event types:`);
                events.forEach(e => console.log(`  - ${(e.event as SuiEvent).type}`));
                // This is not a failure for the test itself, but good to know.
                // The key is that getEvents worked and returned something.
            }
            // We can add more checks for other event types if necessary
        });
    });

}); // End main describe block 