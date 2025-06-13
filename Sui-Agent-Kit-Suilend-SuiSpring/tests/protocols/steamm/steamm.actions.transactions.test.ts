import dotenv from 'dotenv';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiClient, CoinStruct, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'; // Import TransactionObjectArgument
import { SteammSDK, PoolInfo } from '@suilend/steamm-sdk';
import BigNumber from 'bignumber.js';

import { MvpWalletAdapter } from '../../../src/protocols/mystensui/mystenSui.actions';
import { getSuiClient } from '../../../src/protocols/mystensui/mystenSui.client';
import { getDefaultSteammSDK } from '../../../src/protocols/steamm/steamm.client';
import { executeSteammSwap } from '../../../src/protocols/steamm/steamm.actions';
import { SuiNetwork } from '../../../src/protocols/mystensui/mystenSui.config';

dotenv.config({ path: '.env' });

const TEST_NETWORK: Exclude<SuiNetwork, 'custom'> = 'mainnet';
const POOL_ID_SUI_USDC = '0xae12e94ad7dac17e923982b81e16ab97ad0436de37522b61fe66930968ad966b';
const SUI_COIN_TYPE = '0x2::sui::SUI';
const USDC_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const SUI_DECIMALS = 9;
const USDC_DECIMALS = 6;
const SWAP_AMOUNT_SUI = '0.01';

describe('Steamm Transactional Actions (Isolated Swap Test)', () => {
  jest.setTimeout(180000);

  let suiClient: SuiClient;
  let steammSdk: SteammSDK;
  let walletAdapter: MvpWalletAdapter;
  let userAddress: string;
  let keypair: Ed25519Keypair;
  let poolInfoSuiUsdc: PoolInfo | undefined;

  beforeAll(async () => {
    const privateKeyBech32 = process.env.SUI_MAINNET_PRIVATE_KEY;
    if (!privateKeyBech32 || !privateKeyBech32.startsWith('suiprivkey1')) {
      throw new Error('SUI_MAINNET_PRIVATE_KEY environment variable not set or invalid.');
    }
    try {
      const decodedKey = decodeSuiPrivateKey(privateKeyBech32);
      if (decodedKey.schema !== 'ED25519') throw new Error('Private key is not ED25519');
      keypair = Ed25519Keypair.fromSecretKey(decodedKey.secretKey);
    } catch (e: any) {
      throw new Error(`Failed to create keypair: ${e.message}`);
    }
    userAddress = keypair.getPublicKey().toSuiAddress();
    console.log(`[Swap Test Setup] Using address: ${userAddress} for network: ${TEST_NETWORK}`);

    suiClient = getSuiClient(TEST_NETWORK);
    steammSdk = getDefaultSteammSDK(TEST_NETWORK, userAddress);
    if (!suiClient) throw new Error("suiClient failed to init.");
    if (!steammSdk) throw new Error("steammSdk failed to init.");
    console.log("[Swap Test Setup] Clients initialized.");

    walletAdapter = {
      address: userAddress,
      signAndExecuteTransactionBlock: async (params: { transactionBlock: Transaction, options?: any }) => {
        const { transactionBlock, options } = params;
        if (!transactionBlock.blockData.sender) transactionBlock.setSender(userAddress);
        if (!transactionBlock.blockData.gasConfig.budget) transactionBlock.setGasBudget(30000000);
        
        // Explicitly set gas payment to ensure it's not conflicting
        // Attempt to find a SUI coin for gas payment that is NOT the primary gas coin if tx.gas is used as input
        const gasCoins = await suiClient.getCoins({owner: userAddress, coinType: SUI_COIN_TYPE, limit: 50});
        let gasPaymentCoinId: string | undefined;

        // Try to find a small SUI coin for gas, distinct from what might be split from tx.gas
        // This logic might need to be more robust in a real scenario
        for (const coin of gasCoins.data) {
            if (BigInt(coin.balance) > BigInt(20000000)) { // Arbitrary threshold for a usable gas coin
                gasPaymentCoinId = coin.coinObjectId;
                break;
            }
        }
        if (!gasPaymentCoinId && gasCoins.data.length > 0) {
            gasPaymentCoinId = gasCoins.data[0].coinObjectId; // Fallback to the first SUI coin
        }
        
        if (gasPaymentCoinId) {
            console.log(`[Swap Test WalletAdapter] Setting gas payment to: ${gasPaymentCoinId}`);
            const gasObject = await suiClient.getObject({ id: gasPaymentCoinId, options: { /* Opções mínimas, ou deixe default que inclui version/digest se data existir */ } });
            if (gasObject.data && gasObject.data.version && gasObject.data.digest) {
                transactionBlock.setGasPayment([{ objectId: gasPaymentCoinId, version: gasObject.data.version, digest: gasObject.data.digest }]);
            } else {
                console.warn(`[Swap Test WalletAdapter] Could not get version/digest for gas coin ${gasPaymentCoinId}. Proceeding without explicit gas payment object details.`);
                // Fallback ou erro, dependendo da criticidade. Para o teste, pode-se tentar sem especificar version/digest explicitamente,
                // ou lançar um erro se for crucial.
                // Por ora, vamos tentar sem para ver se o SDK lida com isso ou se o problema do tx.gas persiste.
            }
        } else {
            console.warn("[Swap Test WalletAdapter] Could not find a distinct SUI coin for gas payment. Relying on tx.gas which might conflict if also used as input.");
        }


        const builtTx = await transactionBlock.build({ client: suiClient, onlyTransactionKind: false });
        const { bytes, signature } = await keypair.signTransaction(builtTx);
        return suiClient.executeTransactionBlock({
          transactionBlock: bytes,
          signature: signature,
          options: options || { showEffects: true, showObjectChanges: true, showEvents: true, showBalanceChanges: true },
          requestType: 'WaitForLocalExecution',
        });
      },
    };

    console.log('[Swap Test Setup] Warming Steamm SDK caches...');
    await steammSdk.getPools(); // Warm up pools
    await steammSdk.getBanks(); // Warm up banks
    console.log('[Swap Test Setup] Steamm SDK caches warmed.');

    const allPools = await steammSdk.getPools();
    poolInfoSuiUsdc = allPools.find(p => p.poolId === POOL_ID_SUI_USDC);
    if (!poolInfoSuiUsdc) {
      throw new Error(`Pool SUI/USDC com ID ${POOL_ID_SUI_USDC} não encontrado.`);
    }
    console.log(`[Swap Test Setup] Using PoolInfo SUI/USDC: ${JSON.stringify(poolInfoSuiUsdc, null, 2)}`);
    console.log('[Swap Test Setup] Completed beforeAll.');
  }, 180000);

  test('should execute Steamm swap (SUI to USDC) successfully', async () => {
    if (!poolInfoSuiUsdc) throw new Error('Test PoolInfo for SUI/USDC not available.');

    const tx = new Transaction();
    // Sender is set by walletAdapter if not present, or by executeSteammSwap
    // Gas budget is set by walletAdapter
    // Gas payment is explicitly handled in walletAdapter now

    console.log(`[Test: executeSteammSwap] SUI INPUT will be tx.gas, Amount: ${SWAP_AMOUNT_SUI}`);
    
    const result = await executeSteammSwap(
      suiClient,
      steammSdk,
      walletAdapter,
      poolInfoSuiUsdc!.poolId,
      SUI_COIN_TYPE,
      SUI_DECIMALS,
      tx.gas, // Using tx.gas as SUI input. WalletAdapter attempts to use a *different* coin for actual gas payment.
      USDC_COIN_TYPE,
      USDC_DECIMALS,
      SWAP_AMOUNT_SUI,
      undefined, // minAmountOutString
      tx
    );

    console.log('[Test: executeSteammSwap] Result:', JSON.stringify(result, null, 2));
    expect(result).toBeTruthy();
    // It's important to check result.effects before accessing nested properties
    if (!result || !result.effects) {
        throw new Error("Transaction result or effects are undefined for SUI/USDC swap");
    }
    expect(result.effects?.status?.status).toBe('success');
    expect(result.digest).toEqual(expect.any(String));
    console.log(`[Test: executeSteammSwap] Swap successful. Digest: ${result.digest}`);

    const balanceChange = result.balanceChanges?.find(bc => bc.coinType === USDC_COIN_TYPE && bc.owner && typeof bc.owner === 'object' && 'AddressOwner' in bc.owner && bc.owner.AddressOwner === userAddress);
    expect(balanceChange).toBeDefined();
    if (!balanceChange) throw new Error("USDC Balance change not found in swap results");
    expect(new BigNumber(balanceChange!.amount).gt(0)).toBe(true);
    console.log(`[Test SWAP] Received USDC amount (from balanceChanges): ${balanceChange!.amount}`);
  }, 180000);
});