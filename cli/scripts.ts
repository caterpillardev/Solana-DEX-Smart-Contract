import { Program, Wallet, web3 } from '@coral-xyz/anchor';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { PROGRAM_ID, TARGET_TOKEN_DECIMAL } from '../lib-presale/constant';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from '@solana/web3.js';

import IDL from '../target/idl/hybrid_dex.json';
import {
  changeAdminTx,
  createBuyWithSolTx,
  createBuyWithUsdcTx,
  createBuyWithUsdtTx,
  createChangeConfigTx,
  createClaimTokenTx,
  createInitUserTx,
  createInitializeTx,
  createSweepVaultFundsTx,
  getGlobalKeys,
  getGlobalState,
  getUserState,
} from '../lib-presale/scripts';
import { HybridDex } from '../target/types/hybrid_dex';

let solConnection: Connection = null;
let program: Program<HybridDex> = null;
let provider: anchor.Provider = null;
let payer: NodeWallet = null;

// Address of the deployed program.
let programId = new anchor.web3.PublicKey(PROGRAM_ID);

/**
 * Set cluster, provider, program
 * If rpc != null use rpc, otherwise use cluster param
 * @param cluster - cluster ex. mainnet-beta, devnet ...
 * @param keypair - wallet keypair
 * @param rpc - rpc
 */
export const setClusterConfig = async (
  cluster: web3.Cluster,
  keypair: string,
  rpc?: string
) => {
  if (!rpc) {
    solConnection = new web3.Connection(web3.clusterApiUrl(cluster));
  } else {
    solConnection = new web3.Connection(rpc);
  }

  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypair, 'utf-8'))),
    { skipValidation: true }
  );
  const wallet = new NodeWallet(walletKeypair);

  // Configure the client to use the local cluster.
  const provider = new anchor.AnchorProvider(solConnection, wallet, {
    skipPreflight: false,
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);
  payer = wallet;

  console.log('Wallet Address: ', wallet.publicKey.toBase58());

  // Generate the program client from IDL.
  program = new anchor.Program(IDL as HybridDex, provider);
  console.log('ProgramId: ', program.programId.toBase58());
};

/**
 * Initialize global pool, vault
 */
export const initProject = async (
  minAmount: number,
  maxAmount: number,
  priceBySol: number,
  priceByUsdt: number,
  priceByUsdc: number,
  startDate: number,
  endDate: number
) => {
  try {
    const tx = new Transaction().add(
      await createInitializeTx(
        payer.publicKey,
        Math.floor(minAmount * TARGET_TOKEN_DECIMAL),
        Math.floor(maxAmount * TARGET_TOKEN_DECIMAL),
        Math.floor(priceBySol * LAMPORTS_PER_SOL),
        Math.floor(priceByUsdt * 10 ** 6), // USDT decimal is 6
        Math.floor(priceByUsdc * 10 ** 6), // USDC decimal is 6
        startDate,
        endDate,
        program
      )
    );
    const { blockhash } = await solConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;

    payer.signTransaction(tx);

    const txId = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
    });

    console.log('txHash: ', txId);
  } catch (e) {
    console.log(e);
  }
};

/**
 * Change admin of the program
 */
export const changeAdmin = async (newAdmin: string) => {
  let newAdminAddr = null;
  try {
    newAdminAddr = new PublicKey(newAdmin);
  } catch {
    newAdminAddr = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(newAdmin, 'utf-8'))),
      { skipValidation: true }
    ).publicKey;
  }

  const tx = await changeAdminTx(payer.publicKey, newAdminAddr, program);

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

/**
 * Change global config as admin
 */
export const changeConfig = async (
  minAmount: number | undefined,
  maxAmount: number | undefined,
  priceBySol: number | undefined,
  priceByUsdt: number | undefined,
  priceByUsdc: number | undefined,
  startDate: number | undefined,
  endDate: number | undefined
) => {
  try {
    const tx = new Transaction().add(
      await createChangeConfigTx(
        payer.publicKey,
        Math.floor(minAmount * TARGET_TOKEN_DECIMAL),
        Math.floor(maxAmount * TARGET_TOKEN_DECIMAL),
        Math.floor(priceBySol * LAMPORTS_PER_SOL),
        Math.floor(priceByUsdt * 10 ** 6), // USDT decimal is 6
        Math.floor(priceByUsdc * 10 ** 6), // USDC decimal is 6
        startDate,
        endDate,
        program
      )
    );
    const { blockhash } = await solConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;

    payer.signTransaction(tx);

    const txId = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
    });

    console.log('txHash: ', txId);
  } catch (e) {
    console.log(e);
  }
};

/**
 * Sweep sol and usdt funds from vault as admin
 */
export const sweepVaultFunds = async () => {
  const tx = await createSweepVaultFundsTx(payer.publicKey, program);

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

/**
 * Initialize user pool
 */
export const initializeUserPool = async () => {
  try {
    const tx = await createInitUserTx(payer.publicKey, program);

    const txId = await provider.sendAndConfirm(tx, [], {
      commitment: 'confirmed',
    });

    console.log('txHash: ', txId);
  } catch (e) {
    console.log(e);
  }
};

export const buyWithSol = async (amount: number) => {
  const tx = await createBuyWithSolTx(
    payer.publicKey,
    Math.floor(amount * TARGET_TOKEN_DECIMAL),
    program,
    solConnection
  );

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

export const buyWithUsdt = async (amount: number) => {
  const tx = await createBuyWithUsdtTx(
    payer.publicKey,
    Math.floor(amount * TARGET_TOKEN_DECIMAL),
    program,
    solConnection
  );

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

export const buyWithUsdc = async (amount: number) => {
  const tx = await createBuyWithUsdcTx(
    payer.publicKey,
    Math.floor(amount * TARGET_TOKEN_DECIMAL),
    program,
    solConnection
  );

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

export const claimToken = async () => {
  const tx = await createClaimTokenTx(payer.publicKey, program, solConnection);

  const txId = await provider.sendAndConfirm(tx, [], {
    commitment: 'confirmed',
  });

  console.log('txHash: ', txId);
};

export const getUserInfo = async (user: PublicKey) => {
  const { data, key } = await getUserState(user, program);
  console.log('userPoolKey: ', key.toBase58());
  console.log({
    user: data.user.toBase58(),
    buyAmount: data.buyAmount.toNumber(),
    paidSol: data.paidSol.toNumber(),
    paidUsdt: data.paidUsdt.toNumber(),
    paidUsdc: data.paidUsdc.toNumber(),
    buyDate: data.buyDate.toNumber(),
    claimed: data.claimed,
  });
};

export const getGlobalInfo = async () => {
  const { data, key } = await getGlobalState(program);
  console.log('global pool: ', key.toBase58());

  const { targetTokenVault, solVault, usdcVault, usdtVault } =
    await getGlobalKeys(program);

  console.log(
    'target vault:',
    JSON.stringify(await solConnection.getTokenAccountBalance(targetTokenVault))
  );
  console.log(
    'sol vault:',
    (await solConnection.getBalance(solVault)) / LAMPORTS_PER_SOL
  );
  console.log(
    'usdt vault:',
    JSON.stringify(await solConnection.getTokenAccountBalance(usdtVault))
  );
  console.log(
    'usdc vault:',
    JSON.stringify(await solConnection.getTokenAccountBalance(usdcVault))
  );

  return {
    admin: data.admin.toBase58(),
    minAmount: data.minAmount.toNumber(),
    maxAmount: data.maxAmount.toNumber(),
    priceBySol: data.priceBySol.toNumber(),
    priceByUsdt: data.priceByUsdt.toNumber(),
    priceByUsdc: data.priceByUsdc.toNumber(),
    startDate: data.startDate.toNumber(),
    endDate: data.endDate.toNumber(),
  };
};
