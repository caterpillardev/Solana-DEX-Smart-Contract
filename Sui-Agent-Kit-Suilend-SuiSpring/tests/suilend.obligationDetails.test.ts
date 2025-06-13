import { SuiClient } from '@mysten/sui/client';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { getDefaultSuilendClient } from '../src/protocols/suilend/suilend.client';
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { getSuilendObligationDetails } from '../src/protocols/suilend/suilend.actions';
import BigNumber from 'bignumber.js';

// Helper to stringify with BigNumber/BigInt support
const bigNumberReplacer = (key: any, value: any) => {
  if (BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// --- Test Configuration ---
// Este é o ID da OBRIGAÇÃO obtido a partir do endereço da SUI_MAINNET_PRIVATE_KEY 
// que sabemos que TEM uma obrigação no mercado principal da Suilend.
const TEST_OBLIGATION_ID = "0xb4e3669b42cb303a7eace226ebd6e39a9f46113cbc87a29bed04da1a5dab65a5"; 
const TEST_NETWORK = 'mainnet'; // Hardcoded para mainnet, tipo explícito não crucial aqui
// const TEST_MARKET_ID = undefined; // Usar o mercado default (principal)

describe('Suilend getObligationDetails Tests', () => {
  let suiClient: SuiClient;
  let suilendSDKClient: SuilendSDKClient;

  beforeAll(async () => {
    console.log("--- Initializing Test Setup for getSuilendObligationDetails (mainnet) ---");
    suiClient = getSuiClient('mainnet');
    suilendSDKClient = await getDefaultSuilendClient('mainnet');
    if (!suilendSDKClient || !suilendSDKClient.lendingMarket) {
      throw new Error("Failed to initialize SuilendSDKClient or lendingMarket is not available.");
    }
    // Correctly access the market ID via suilendSDKClient.lendingMarket.id
    console.log("SuilendSDKClient initialized for market:", suilendSDKClient.lendingMarket.id);
  }, 30000); // Timeout aumentado para beforeAll

  test('should fetch and parse obligation details successfully for a valid obligation ID', async () => {
    // Removida a verificação do placeholder, pois agora temos um ID real.
    // if (TEST_OBLIGATION_ID === "0xseu_id_de_obrigacao_de_teste_valido_aqui") {
    //   console.warn("Skipping test: TEST_OBLIGATION_ID is a placeholder. Please provide a valid mainnet obligation ID.");
    //   expect(true).toBe(true); // Placeholder assertion to make test pass
    //   return;
    // }

    console.log(`Attempting to fetch details for Obligation ID: ${TEST_OBLIGATION_ID} on network: ${TEST_NETWORK}`);
    let obligationDetails;
    let errorOccurred: Error | null = null; // Type errorOccurred as Error | null
    let errorMessage = "An unknown error occurred";

    try {
      obligationDetails = await getSuilendObligationDetails(suilendSDKClient, suiClient, TEST_OBLIGATION_ID);
    } catch (e: unknown) { // Catch as unknown for type safety
      if (e instanceof Error) {
        errorOccurred = e;
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
        errorOccurred = new Error(e); 
      } else {
        // stringify if it's an object, or just convert to string for other primitives
        errorMessage = typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e);
        errorOccurred = new Error(errorMessage);
      }
      console.error("Error caught during getSuilendObligationDetails call in test:", errorMessage);
      // Optionally log stack if needed: if (errorOccurred && errorOccurred.stack) console.error(errorOccurred.stack);
    }

    if (errorOccurred) {
      console.log("--- Test Result: FAILED (Error Occurred) ---");
      console.log("Error Message:", errorMessage);
      // Throw the error to make Jest fail the test explicitly
      throw errorOccurred;
    } else if (obligationDetails) {
      console.log("--- Test Result: SUCCESS ---");
      console.log("Fetched Obligation Details:", JSON.stringify(obligationDetails, bigNumberReplacer, 2));
      expect(obligationDetails).toBeDefined();
      expect(obligationDetails.obligationId).toEqual(TEST_OBLIGATION_ID);
      // Add more specific assertions based on the expected structure of SuilendObligationDetails
      expect(obligationDetails.collateral).toBeInstanceOf(Array);
      expect(obligationDetails.borrows).toBeInstanceOf(Array);
      expect(typeof obligationDetails.totalDepositedValueUsd).toBe('string');
      expect(typeof obligationDetails.totalBorrowedValueUsd).toBe('string');
      expect(typeof obligationDetails.healthFactor).toBe('string'); // Check if healthFactor is present
    } else {
      console.log("--- Test Result: FAILED (No details returned and no error thrown) ---");
      // This case might indicate an issue where the function returns null without an error
      // which might be unexpected if an ID known to be valid is used.
      expect(obligationDetails).toBeDefined(); // This will fail the test
    }
  }, 60000); // Timeout aumentado para o teste individual
}); 