import { SuiClient, CoinMetadata, SuiTransactionBlockResponse, CoinStruct, PaginatedCoins } from '@mysten/sui/client';
import { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUI_DECIMALS, SUI_TYPE_ARG } from '@mysten/sui/utils';
import { getSuiClient } from './mystenSui.client';
import BigNumber from 'bignumber.js';

// Define a generic wallet adapter type for MVP, actual dApp would use a specific library
export interface MvpWalletAdapter {
  address?: string;
  signAndExecuteTransactionBlock: (params: { transactionBlock: Transaction, options?: any }) => Promise<SuiTransactionBlockResponse>;
  // May include other methods like signMessage, connect, disconnect etc.
}
// Nova classe concreta que implementa MvpWalletAdapter
export class SimpleMvpWalletAdapter implements MvpWalletAdapter {
  public address: string;
  private keypair: Ed25519Keypair;
  private suiClient: SuiClient;

  constructor(keypair: Ed25519Keypair, suiClient: SuiClient) {
    this.keypair = keypair;
    this.address = keypair.getPublicKey().toSuiAddress();
    this.suiClient = suiClient;
  }

  async signAndExecuteTransactionBlock(
    { transactionBlock, options }: { transactionBlock: Transaction, options?: any }
  ): Promise<SuiTransactionBlockResponse> {
    // Garante que o sender está definido
    if (!transactionBlock.blockData.sender) {
        transactionBlock.setSender(this.address);
    }
    // Garante que o gás está configurado (básico por enquanto)
    // No servidor MCP, quem chama a action (o handler) é responsável por preparar a transação,
    // incluindo o gás, antes de retorná-la como 'PreparedTransactionOutput'.
    // O cliente MCP então assina e executa. Para este adapter interno usado no servidor
    // (se fosse executar diretamente), faria sentido configurar o gás aqui.
    // Mas como o plano é que os handlers PREPAREM e retornem TX serializada, 
    // a configuração de gás pelo MvpWalletAdapter no servidor pode não ser usada se o servidor só PREPARA.
    // Se o servidor fosse EXECUTAR, este adapter seria o ponto.
    // Por ora, manteremos uma lógica básica de gás aqui, caso seja usado para execução direta.
    if (!transactionBlock.blockData.gasConfig.budget && !transactionBlock.blockData.gasConfig.payment?.length) {
        console.log("[SimpleMvpWalletAdapter] Gas not set on transaction, attempting to set default gas...");
        try {
            const gasPrice = await this.suiClient.getReferenceGasPrice();
            if (gasPrice) transactionBlock.setGasPrice(gasPrice);
            // Definir um gasPayment é crucial. O cliente precisa ter coins SUI.
            // Esta é uma simplificação e pode falhar se não houver coins de gás adequados.
            const gasCoins = await this.suiClient.getCoins({ owner: this.address, coinType: SUI_TYPE_ARG, limit: 1 });
            if (gasCoins.data.length > 0) {
                transactionBlock.setGasPayment([{ objectId: gasCoins.data[0].coinObjectId, version: gasCoins.data[0].version, digest: gasCoins.data[0].digest }]);
            } else {
                console.warn(`[SimpleMvpWalletAdapter] No SUI gas coins found for address ${this.address}. Transaction might fail.`)
            }
            transactionBlock.setGasBudget(options?.gasBudget || 50_000_000); // Orçamento padrão
        } catch (e: any) {
            console.error("[SimpleMvpWalletAdapter] Error setting gas: ", e.message);
            // Prossegue, mas a transação pode falhar por falta de gás.
        }
    }
    
    return this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: transactionBlock,
      options: options || { showEffects: true, showObjectChanges: true }, // Ajuste para ser compatível
      requestType: 'WaitForLocalExecution'
    });
  }
}

// Função helper para criar o adapter a partir do mnemônico
export function createMvpWalletAdapterFromMnemonic(mnemonic: string, suiClient: SuiClient): SimpleMvpWalletAdapter {
    const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
    return new SimpleMvpWalletAdapter(keypair, suiClient);
}

export async function getSuiBalance(
  suiClient: SuiClient,
  userAddress: string
): Promise<{ balance: number; rawBalance: string } | null> {
  if (!userAddress) {
    return null;
  }
  try {
    const balanceResponse = await suiClient.getBalance({
      owner: userAddress,
      coinType: SUI_TYPE_ARG, // Explicitly SUI
    });

    const rawBalance = balanceResponse.totalBalance;
    const balance = parseInt(rawBalance, 10) / Math.pow(10, SUI_DECIMALS);

    return { balance, rawBalance };
  } catch (error) {
    return null;
  }
}

export async function getTokenMeta(
  suiClient: SuiClient,
  coinType: string
): Promise<CoinMetadata | null> {
  if (!coinType) {
    return null;
  }
  try {
    const metadata = await suiClient.getCoinMetadata({ coinType });
    if (!metadata) {
      return null;
    }
    return metadata;
  } catch (error) {
    return null;
  }
}

export async function getUserTokenBalance(
  suiClient: SuiClient,
  userAddress: string,
  coinType: string
): Promise<{ balance: number; rawBalance: string; metadata: CoinMetadata } | null> {
  if (!userAddress || !coinType) {
    return null;
  }

  try {
    const metadata = await getTokenMeta(suiClient, coinType);
    if (!metadata) {
      return null;
    }

    const balanceResponse = await suiClient.getBalance({
      owner: userAddress,
      coinType: coinType,
    });

    const rawBalance = balanceResponse.totalBalance;
    const balance = parseInt(rawBalance, 10) / Math.pow(10, metadata.decimals);
    
    return { balance, rawBalance, metadata };

  } catch (error) {
    return null;
  }
}

// Helper function to find a suitable coin (simplified for MVP)
// Returns a CoinStruct if a single coin is found that can satisfy the amount (either exact or larger for splitting)
async function findSuitableCoinForTransfer(
  suiClient: SuiClient,
  owner: string,
  coinType: string,
  targetAmountRaw: bigint // Target amount in token's smallest unit
): Promise<CoinStruct | null> {
  let cursor: string | null | undefined = null;
  let bestCoin: CoinStruct | null = null;

  do {
    const coinsResponse: PaginatedCoins = await suiClient.getCoins({ owner, coinType, cursor });
    for (const coin of coinsResponse.data) {
      const coinBalanceRaw = BigInt(coin.balance);
      if (coinBalanceRaw === targetAmountRaw) {
        return coin; // Exact match found
      }
      if (coinBalanceRaw > targetAmountRaw) {
        if (!bestCoin || coinBalanceRaw < BigInt(bestCoin.balance)) {
          // Found a larger coin, prefer the smallest one that's still large enough
          bestCoin = coin;
        }
      }
    }
    cursor = coinsResponse.nextCursor;
  } while (cursor && !bestCoin); // Stop if exact match found or if bestCoin is already found (and we're looking for smallest larger)
                               // Or iterate all pages if a larger coin strategy is more complex.
  // For MVP, if no exact match, but we found a coin larger than target, we can use it for splitting.
  // If bestCoin is still null here, it means no single coin is sufficient.
  return bestCoin; 
}

export async function transferFungibleToken(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  recipientAddress: string,
  amountTokenString: string,
  tokenCoinType: string,
  tokenDecimals: number,
  coinObjectId?: string // Added optional coinObjectId
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    console.warn("Wallet address not found.");
    return null;
  }
  if (!recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(recipientAddress)) {
    console.warn("Invalid recipient address.");
    return null;
  }
  
  let amountToken: number;
  try {
    amountToken = parseFloat(amountTokenString);
  } catch (e) {
    console.warn("Invalid amount string:", amountTokenString);
    return null;
  }

  if (isNaN(amountToken) || amountToken <= 0) {
    console.warn("Amount must be a positive number.");
    return null;
  }

  const targetAmountRaw = BigInt(new BigNumber(amountTokenString).shiftedBy(tokenDecimals).integerValue(BigNumber.ROUND_FLOOR).toString());

  if (targetAmountRaw <= 0n) {
      console.warn("Target amount in raw units must be positive.");
      return null;
  }

  const tx = new Transaction();
  try {
    tx.setSender(wallet.address);
    const gasPrice = await suiClient.getReferenceGasPrice();
    if (gasPrice === null || gasPrice === undefined) {
        console.warn("Failed to get reference gas price.");
        return null;
    }
    tx.setGasPrice(gasPrice);
    tx.setGasBudget(30000000); // Example budget, might need adjustment

    let coinToSendArg: TransactionArgument;

    if (coinObjectId) {
      // Logic if coinObjectId is provided
      console.warn(`Attempting to use provided coinObjectId: ${coinObjectId}`);
      const coinObject = await suiClient.getObject({ id: coinObjectId, options: { showContent: true } });
      if (!coinObject.data || !coinObject.data.content || coinObject.data.content.dataType !== 'moveObject') {
        console.warn(`Provided coinObjectId ${coinObjectId} not found or is not a valid coin object.`);
        return null;
      }
      // Assuming the object is a coin, its fields should include a 'balance'
      // The actual structure is coinObject.data.content.fields.balance (for 0.28.0+)
      // For older SDKs it might be different. Let's assume fields.balance for now.
      // We need to be careful with type assertion here.
      const balanceField = (coinObject.data.content.fields as any)?.balance;
      if (typeof balanceField === 'undefined') {
          console.warn(`Could not retrieve balance for coinObjectId ${coinObjectId}.`);
          return null;
      }
      const coinToUseBalanceRaw = BigInt(balanceField);

      if (coinToUseBalanceRaw < targetAmountRaw) {
        console.warn(`Provided coinObjectId ${coinObjectId} has insufficient balance (${coinToUseBalanceRaw}) for the required amount (${targetAmountRaw}).`);
        return null;
      } else if (coinToUseBalanceRaw === targetAmountRaw) {
        coinToSendArg = tx.object(coinObjectId);
      } else { // coinToUseBalanceRaw > targetAmountRaw
        const [splitCoin] = tx.splitCoins(tx.object(coinObjectId), [targetAmountRaw]);
        coinToSendArg = splitCoin;
      }
    } else {
      // Logic if coinObjectId is NOT provided - find and prepare coins
      console.warn(`Attempting to find suitable coins for ${tokenCoinType}.`);
      
      let allUserCoins: CoinStruct[] = [];
      let cursor: string | null | undefined = null;
      do {
        const coinsResponse: PaginatedCoins = await suiClient.getCoins({ owner: wallet.address, coinType: tokenCoinType, cursor });
        allUserCoins = allUserCoins.concat(coinsResponse.data);
        cursor = coinsResponse.nextCursor;
      } while (cursor);

      if (allUserCoins.length === 0) {
        console.warn(`No coins of type ${tokenCoinType} found for address ${wallet.address}.`);
        return null;
      }

      // Sort coins by balance, largest first, to try and use fewer objects
      allUserCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

      let selectedCoins: CoinStruct[] = [];
      let currentBalance = 0n;

      for (const coin of allUserCoins) {
        selectedCoins.push(coin);
        currentBalance += BigInt(coin.balance);
        if (currentBalance >= targetAmountRaw) {
          break;
        }
      }

      if (currentBalance < targetAmountRaw) {
        console.warn(`Insufficient total balance of ${tokenCoinType} for address ${wallet.address}. Required: ${targetAmountRaw}, Available: ${currentBalance}.`);
        return null;
      }

      if (selectedCoins.length === 1) {
        const singleCoin = selectedCoins[0];
        const singleCoinBalance = BigInt(singleCoin.balance);
        if (singleCoinBalance === targetAmountRaw) {
          coinToSendArg = tx.object(singleCoin.coinObjectId);
        } else { // singleCoinBalance > targetAmountRaw
          const [splitCoin] = tx.splitCoins(tx.object(singleCoin.coinObjectId), [targetAmountRaw]);
          coinToSendArg = splitCoin;
        }
      } else { // Multiple coins selected
        const coinArgs = selectedCoins.map(c => tx.object(c.coinObjectId));
        const primaryCoinArg = coinArgs[0];
        if (coinArgs.length > 1) {
          tx.mergeCoins(primaryCoinArg, coinArgs.slice(1));
        }
        // Now primaryCoinArg holds the merged balance.
        // If currentBalance (sum of selectedCoins) > targetAmountRaw, we need to split.
        // If currentBalance === targetAmountRaw, we can use primaryCoinArg directly.
        if (currentBalance === targetAmountRaw) {
          coinToSendArg = primaryCoinArg;
        } else { // currentBalance > targetAmountRaw
          const [splitCoin] = tx.splitCoins(primaryCoinArg, [targetAmountRaw]);
          coinToSendArg = splitCoin;
        }
      }
    }

    // Pass address string directly as recipient
    tx.transferObjects([coinToSendArg], recipientAddress);
    
    console.warn("Transaction block prepared for fungible token transfer. Signing and executing...");
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true, showBalanceChanges: true },
    });
    console.warn("Transaction executed. Result:", JSON.stringify(result.effects?.status, null, 2));

    if (result.effects?.status.status === 'success') {
      // Intentionally no log here
    } else {
      console.warn("Transaction failed:", result.effects?.status);
    }
    return result;

  } catch (error: any) {
    console.warn(`Error in transferFungibleToken: ${error.message}`, error.stack);
    return null;
  }
}

export async function transferSui(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  recipientAddress: string,
  amountSuiString: string
): Promise<SuiTransactionBlockResponse | null> {
  const logPrefix = `[SDK ACTION][transferSui]`;
  console.warn(`${logPrefix} Attempting to transfer ${amountSuiString} SUI to ${recipientAddress}`);

  if (!wallet.address) {
    console.warn(`${logPrefix} Wallet address not found in the provided MvpWalletAdapter.`);
    return null;
  }
  if (!recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(recipientAddress)) {
    console.warn(`${logPrefix} Invalid recipient address: ${recipientAddress}`);
    return null;
  }
  if (wallet.address === recipientAddress) {
    console.warn(`${logPrefix} Sender and recipient address cannot be the same.`);
    return null;
  }

  let amountMistBn: BigNumber;
  try {
    amountMistBn = new BigNumber(amountSuiString).shiftedBy(SUI_DECIMALS);
    if (amountMistBn.lte(0)) {
      console.warn(`${logPrefix} Amount of SUI to transfer must be positive. Received: ${amountSuiString}`);
      return null;
    }
  } catch (error) {
    console.warn(`${logPrefix} Invalid amount string: ${amountSuiString}`, error);
    return null;
  }
  const amountMistString = amountMistBn.integerValue(BigNumber.ROUND_FLOOR).toString();
  console.warn(`${logPrefix} Calculated MIST amount for transaction: ${amountMistString}`);

  const tx = new Transaction();
  tx.setSender(wallet.address);

  try {
    // Create a coin of the exact amount to send
    const [coin] = tx.splitCoins(tx.gas, [BigInt(amountMistString)]);
    tx.transferObjects([coin], tx.pure.address(recipientAddress));
    console.warn(`${logPrefix} Transaction commands prepared.`);
  } catch (error: any) {
    console.warn(`${logPrefix} Error preparing transaction commands: ${error.message}`, error);
    return null;
  }

  try {
    const gasPrice = await suiClient.getReferenceGasPrice();
    if (gasPrice) {
      tx.setGasPrice(gasPrice);
      console.warn(`${logPrefix} Gas price set to: ${gasPrice}`);
    } else {
      console.warn(`${logPrefix} Could not fetch reference gas price.`);
    }
  } catch (e: any) {
    console.warn(`${logPrefix} Error fetching gas price: ${e.message}`);
  }
  tx.setGasBudget(30000000); // Standard gas budget for SUI transfer
  console.warn(`${logPrefix} Gas budget set to: 30000000`);

  try {
    console.warn(`${logPrefix} Signing and executing transaction block...`);
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    console.warn(`${logPrefix} Transaction executed. Digest: ${response?.digest}`);

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
        console.warn(`${logPrefix} SUI transfer successful. Digest: ${response.digest}`);
      } else {
        console.warn(`${logPrefix} SUI transfer failed. Status: ${response.effects.status.error}. Digest: ${response.digest}`);
        if (response.events && response.events.length > 0) {
          console.warn(`${logPrefix} Transaction events on failure: ${JSON.stringify(response.events, null, 2)}`);
        }
      }
    } else {
      console.warn(`${logPrefix} SUI transfer response or effects or status missing. Response: ${JSON.stringify(response)}`);
    }
    return response;
  } catch (error: any) {
    console.warn(`${logPrefix} Error signing/executing SUI transfer: ${error.message}`, error.stack);
    return null;
  }
}

export async function getUserRecentTransactions(
  suiClient: SuiClient,
  userAddress: string,
  limit: number = 10
): Promise<SuiTransactionBlockResponse[]> {
  if (!userAddress) {
    return [];
  }

  try {
    const response = await suiClient.queryTransactionBlocks({
      filter: { FromAddress: userAddress },
      options: { 
        showEffects: true, // Include effects to see status
        showInput: false, // Typically not needed for a simple history list
        showEvents: false, // Optional, can be large
        showObjectChanges: false, // Optional, can be large
        showBalanceChanges: false, // Optional
      },
      limit,
      order: 'descending', // Get newest first
    });

    // Ensure it's an array before returning, or handle cases where response.data might not be.
    return Array.isArray(response.data) ? response.data : [];

  } catch (error) {
    return []; // Return empty array on error
  }
}

export async function transferSuiToMany(
  suiClient: SuiClient, // Needed for gas price reference if not set on TX by wallet
  wallet: MvpWalletAdapter,
  transfers: Array<{ recipientAddress: string; amount: string }>
): Promise<SuiTransactionBlockResponse | null> {
  const logPrefix = `[SDK ACTION][transferSuiToMany]`;
  console.warn(`${logPrefix} Attempting to transfer SUI to multiple recipients.`);

  if (!wallet.address) {
    console.warn(`${logPrefix} Wallet address not found in the provided MvpWalletAdapter.`);
    return null;
  }

  if (!transfers || transfers.length === 0) {
    console.warn(`${logPrefix} Transfers array is empty or undefined.`);
    return null;
  }

  const tx = new Transaction();
  tx.setSender(wallet.address); // Sender is the active wallet

  for (const transfer of transfers) {
    if (!transfer.recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(transfer.recipientAddress)) {
      console.warn(`${logPrefix} Invalid recipient address in transfers array: ${transfer.recipientAddress}`);
      return null; // Or handle individual errors differently, e.g., skip this transfer
    }
    if (wallet.address === transfer.recipientAddress) {
      console.warn(`${logPrefix} Sender and recipient address cannot be the same for one of the transfers: ${transfer.recipientAddress}`);
      return null; // Or handle individual errors
    }

    let amountMistBn: BigNumber;
    try {
      amountMistBn = new BigNumber(transfer.amount).shiftedBy(SUI_DECIMALS);
      if (amountMistBn.lte(0)) {
        console.warn(`${logPrefix} Amount for recipient ${transfer.recipientAddress} must be positive. Received: ${transfer.amount}`);
        return null; // Or handle individual errors
      }
    } catch (error) {
      console.warn(`${logPrefix} Invalid amount string for recipient ${transfer.recipientAddress}: ${transfer.amount}`, error);
      return null; // Or handle individual errors
    }
    const amountMistString = amountMistBn.integerValue(BigNumber.ROUND_FLOOR).toString();
    console.warn(`${logPrefix} For recipient ${transfer.recipientAddress}, calculated MIST amount: ${amountMistString}`);

    try {
      const [coin] = tx.splitCoins(tx.gas, [BigInt(amountMistString)]);
      tx.transferObjects([coin], tx.pure.address(transfer.recipientAddress));
    } catch (error: any) {
      console.warn(`${logPrefix} Error preparing PTB commands for recipient ${transfer.recipientAddress}: ${error.message}`, error);
      return null;
    }
  }
  console.warn(`${logPrefix} All PTB commands prepared for ${transfers.length} recipients.`);

  // Gas configuration: SimpleMvpWalletAdapter will attempt to set gas if not already set.
  // For more complex scenarios or specific gas strategies, set gas price/budget/payment here.
  // Example (optional, as SimpleMvpWalletAdapter has a fallback):
  try {
    const gasPrice = await suiClient.getReferenceGasPrice();
    if (gasPrice) {
      tx.setGasPrice(gasPrice);
      console.warn(`${logPrefix} Gas price set to: ${gasPrice}`);
    }
    tx.setGasBudget(50000000 * transfers.length); // Budget scales roughly with number of operations
    console.warn(`${logPrefix} Gas budget set to: ${50000000 * transfers.length}`);
  } catch (e: any) {
    console.warn(`${logPrefix} Error setting gas price/budget: ${e.message}. Relying on wallet adapter default gas handling.`);
  }

  try {
    console.warn(`${logPrefix} Signing and executing transaction block...`);
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    console.warn(`${logPrefix} Transaction executed. Digest: ${response?.digest}`);

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
        console.warn(`${logPrefix} Multi-transfer SUI successful. Digest: ${response.digest}`);
      } else {
        console.warn(`${logPrefix} Multi-transfer SUI failed. Status: ${response.effects.status.error}. Digest: ${response.digest}`);
        if (response.events && response.events.length > 0) {
          console.warn(`${logPrefix} Transaction events on failure: ${JSON.stringify(response.events, null, 2)}`);
        }
      }
    } else {
      console.warn(`${logPrefix} Multi-transfer SUI response or effects or status missing. Response: ${JSON.stringify(response)}`);
    }
    return response;
  } catch (error: any) {
    console.warn(`${logPrefix} Error signing/executing multi-transfer SUI: ${error.message}`, error.stack);
    return null;
  }
}

export async function transferFungTokensToMany(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  tokenCoinType: string,
  tokenDecimals: number,
  transfers: Array<{ recipientAddress: string; amount: string }>
): Promise<SuiTransactionBlockResponse | null> {
  const logPrefix = `[SDK ACTION][transferFungTokensToMany][${tokenCoinType}]`;
  console.warn(`${logPrefix} Attempting to transfer token to multiple recipients.`);

  if (!wallet.address) {
    console.warn(`${logPrefix} Wallet address not found.`);
    return null;
  }
  if (!transfers || transfers.length === 0) {
    console.warn(`${logPrefix} Transfers array is empty.`);
    return null;
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);

  // 1. Calculate total amount to transfer in atomic units
  let totalAmountToSendAtomic = BigInt(0);
  const individualAmountsAtomic: BigInt[] = [];

  for (const transfer of transfers) {
    if (!transfer.recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(transfer.recipientAddress) || wallet.address === transfer.recipientAddress) {
      console.warn(`${logPrefix} Invalid or self-transfer recipient address: ${transfer.recipientAddress}`);
      return null;
    }
    try {
      const amountAtomic = BigInt(new BigNumber(transfer.amount).shiftedBy(tokenDecimals).integerValue(BigNumber.ROUND_FLOOR).toString());
      if (amountAtomic <= 0n) {
        console.warn(`${logPrefix} Amount for ${transfer.recipientAddress} must be positive. Got: ${transfer.amount}`);
        return null;
      }
      individualAmountsAtomic.push(amountAtomic);
      totalAmountToSendAtomic += amountAtomic;
    } catch (error) {
      console.warn(`${logPrefix} Invalid amount for ${transfer.recipientAddress}: ${transfer.amount}`, error);
      return null;
    }
  }
  console.warn(`${logPrefix} Total atomic amount to send: ${totalAmountToSendAtomic}`);

  // 2. Fetch all coins of the specified tokenCoinType for the sender
  let allOwnedTokenCoins: CoinStruct[] = [];
  let cursor: string | null | undefined = null;
  try {
    do {
      const page: PaginatedCoins = await suiClient.getCoins({ owner: wallet.address, coinType: tokenCoinType, cursor });
      allOwnedTokenCoins = allOwnedTokenCoins.concat(page.data);
      cursor = page.nextCursor;
    } while (cursor);
  } catch (error) {
    console.warn(`${logPrefix} Error fetching coins for type ${tokenCoinType}:`, error);
    return null;
  }

  if (allOwnedTokenCoins.length === 0) {
    console.warn(`${logPrefix} No coins of type ${tokenCoinType} found for address ${wallet.address}.`);
    return null;
  }

  // 3. Coin selection and merging logic
  allOwnedTokenCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance))); // Sort largest first

  let paymentCoinArg: TransactionArgument;
  const coinsToMerge: string[] = [];
  let currentAccumulatedBalance = BigInt(0);

  for (const coin of allOwnedTokenCoins) {
    coinsToMerge.push(coin.coinObjectId);
    currentAccumulatedBalance += BigInt(coin.balance);
    if (currentAccumulatedBalance >= totalAmountToSendAtomic) {
      break;
    }
  }

  if (currentAccumulatedBalance < totalAmountToSendAtomic) {
    console.warn(`${logPrefix} Insufficient total balance of ${tokenCoinType}. Required: ${totalAmountToSendAtomic}, Available: ${currentAccumulatedBalance}.`);
    return null;
  }

  // Construct the payment coin argument
  if (coinsToMerge.length === 0) { // Should not happen if previous check passed
      console.warn(`${logPrefix} No coins selected for merging, though balance seemed sufficient. This is unexpected.`);
      return null;
  }

  const primaryCoinId = coinsToMerge[0];
  paymentCoinArg = tx.object(primaryCoinId);

  if (coinsToMerge.length > 1) {
    const sourceCoinArgs = coinsToMerge.slice(1).map(id => tx.object(id));
    tx.mergeCoins(paymentCoinArg, sourceCoinArgs);
    console.warn(`${logPrefix} Merged ${coinsToMerge.length} coins into ${primaryCoinId}.`);
  }

  // 4. Split coins from the paymentCoinArg and transfer to each recipient
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    const amountAtomic = individualAmountsAtomic[i];
    try {
      const [splitCoin] = tx.splitCoins(paymentCoinArg, [tx.pure.u64(amountAtomic.toString())]);
      tx.transferObjects([splitCoin], tx.pure.address(transfer.recipientAddress));
      console.warn(`${logPrefix} Prepared transfer of ${amountAtomic} to ${transfer.recipientAddress}`);
    } catch (error: any) {
      console.warn(`${logPrefix} Error preparing PTB commands for recipient ${transfer.recipientAddress} during split/transfer: ${error.message}`, error);
      return null;
    }
  }

  // Gas configuration is handled by SimpleMvpWalletAdapter if not explicitly set here
  // For this multi-operation, we might want to set a higher budget explicitly.
  try {
    const gasPrice = await suiClient.getReferenceGasPrice();
    if (gasPrice) tx.setGasPrice(gasPrice);
    // Estimate budget: base + per transfer operations (split + transfer)
    tx.setGasBudget(50000000 + (transfers.length * 20000000)); 
    console.warn(`${logPrefix} Gas budget set to: ${tx.blockData.gasConfig.budget}`);
  } catch (e: any) {
    console.warn(`${logPrefix} Error setting gas price/budget: ${e.message}. Wallet adapter will use defaults.`);
  }

  // 5. Sign and execute
  try {
    console.warn(`${logPrefix} Signing and executing transaction block for ${transfers.length} recipients...`);
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    console.warn(`${logPrefix} Transaction executed. Digest: ${response?.digest}`);

    if (response?.effects?.status?.status === 'success') {
      console.warn(`${logPrefix} Multi-transfer of ${tokenCoinType} successful. Digest: ${response.digest}`);
    } else {
      console.warn(`${logPrefix} Multi-transfer of ${tokenCoinType} failed. Status: ${response?.effects?.status?.error}. Digest: ${response?.digest}`);
    }
    return response;
  } catch (error: any) {
    console.warn(`${logPrefix} Error signing/executing multi-transfer of ${tokenCoinType}: ${error.message}`, error.stack);
    return null;
  }
} 