import { SUI_TYPE_ARG } from '@mysten/sui/utils';
import { findSteammSwapRoutes } from '../src/protocols/steamm/steamm.actions';
import { getDefaultSteammSDK } from '../src/protocols/steamm/steamm.client';
import { SteammSDK } from '@suilend/steamm-sdk';
import { SuiNetwork } from '../src/protocols/mystensui/mystenSui.config';
import { SuiClient } from '@mysten/sui/client';

// Increase timeout for network-dependent tests
jest.setTimeout(60000); // 60 seconds

describe('Steamm Actions - findSteammSwapRoutes', () => {
  const network: SuiNetwork = 'mainnet';
  const inputCoinType = SUI_TYPE_ARG;
  const outputCoinType = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
  let steammSdk: SteammSDK;
  let suiClient: SuiClient;

  beforeAll(async () => {
    try {
      console.log(`[Test Setup] Initializing SteammSDK for ${network}...`);
      steammSdk = getDefaultSteammSDK(network);
      // Perform a lightweight operation to ensure SDK is somewhat initialized, e.g., try to get banks or pools.
      // This might help surface initialization issues early.
      await steammSdk.getBanks();
      console.log(`[Test Setup] SteammSDK for ${network} initialized and getBanks() called.`);
    } catch (error) {
      console.error('[Test Setup] Failed to initialize SteammSDK:', error);
      // If SDK initialization fails, we might want to throw to stop tests for this suite.
      throw new Error(`SteammSDK initialization failed: ${(error as Error).message}`);
    }
  });

  it('should attempt to find swap routes for SUI to USDC on mainnet and log detailed output', async () => {
    console.log(`[Test Case] Attempting to find routes for ${inputCoinType} -> ${outputCoinType} on ${network}`);
    
    try {
      const routes = await findSteammSwapRoutes(steammSdk, inputCoinType, outputCoinType, network);
      
      console.log('[Test Case] findSteammSwapRoutes executed.');
      if (routes && routes.length > 0) {
        console.log(`[Test Case] Successfully found ${routes.length} routes:`);
        // console.log(JSON.stringify(routes, null, 2)); // Log raw routes if needed, can be very verbose
      } else {
        console.warn('[Test Case] No routes found. The function returned an empty array or null/undefined.');
      }
      // No strict assertion here, the main goal is to observe console logs from within the function.
      // However, we can assert that it doesn't throw an unexpected error.
      expect(routes).toBeDefined(); // Basic check that it returns something (even an empty array)
    } catch (error) {
      console.error('[Test Case] An error occurred while calling findSteammSwapRoutes:', error);
      // Fail the test if an error is thrown
      throw error;
    }
  });

  // Add more test cases if needed, e.g., for other coin pairs or error conditions.
}); 