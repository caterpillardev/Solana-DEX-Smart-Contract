import * as anchor from '@coral-xyz/anchor';
import {
  PublicKey,
  Connection,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from '@solana/web3.js';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { getAssociatedTokenAccount } from './util';
import {
  ASK_BOOK_SEED,
  BID_BOOK_SEED,
  GLOBAL_AUTHORITY_SEED,
  MARKET_SEED,
  USER_MARKET_ORDER_SEED,
} from './constant';
import { HybridDex } from '../target/types/hybrid_dex';
import { serializeSide, Side } from './types';

export const createInitializeTx = async (
  admin: PublicKey,
  maxOrdersPerUser: number,
  maxOrdersPerBook: number,
  program: anchor.Program<HybridDex>
) => {
  console.log({
    maxOrdersPerUser,
    maxOrdersPerBook,
  });

  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );
  console.log('globalPool: ', globalPool.toBase58());

  const tx = await program.methods
    .initialize(
      new anchor.BN(maxOrdersPerUser),
      new anchor.BN(maxOrdersPerBook)
    )
    .accounts({
      admin,
      globalPool,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  return tx;
};

/**
 * Change admin of the program as old admin
 */
export const changeAdminTx = async (
  admin: PublicKey,
  newAdminAddr: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const tx = await program.methods
    .transferAdmin(newAdminAddr)
    .accounts({
      admin,
      globalPool,
    })
    .transaction();

  return tx;
};

/**
 * Change global config as admin
 */
export const createChangeConfigTx = async (
  admin: PublicKey,
  maxOrdersPerUser: number | undefined,
  maxOrdersPerBook: number | undefined,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const tx = await program.methods
    .changeConfig(
      maxOrdersPerUser ? new anchor.BN(maxOrdersPerUser) : null,
      maxOrdersPerBook ? new anchor.BN(maxOrdersPerBook) : null
    )
    .accounts({
      admin,
      globalPool,
    })
    .transaction();

  return tx;
};

/**
 * Create market
 */
export const createMarketTx = async (
  authority: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  name: string,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const { data } = await getGlobalState(program);

  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), data.marketSeqNum.toArrayLike(Buffer, 'le', 4)],
    program.programId
  );
  console.log(data.marketSeqNum.toNumber(), 'market: ', market.toBase58());

  const [bidsBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('bids book: ', bidsBook.toBase58());

  const [asksBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(ASK_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('asks book: ', asksBook.toBase58());

  const tx = new Transaction();

  const txId = await program.methods
    .createMarket(name)
    .accounts({
      authority,
      globalPool,
      market,
      baseMint,
      quoteMint,
      bidsBook,
      asksBook,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  tx.add(txId);

  return tx;
};

/**
 * Close market with market owner authority or global admin authority
 */
export const closeMarketTx = async (
  authority: PublicKey,
  market: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );
  const { data } = await getMarketState(market, program);
  console.log('market seed', data.seed);

  const [bidsBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('bids book: ', bidsBook.toBase58());

  const [asksBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(ASK_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('asks book: ', asksBook.toBase58());

  const tx = await program.methods
    .closeMarket(new anchor.BN(data.seed))
    .accounts({
      authority,
      globalPool,
      market,
      baseMint: data.baseMint,
      quoteMint: data.quoteMint,
      bidsBook,
      asksBook,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  return tx;
};

export const createOpenOrdersTx = async (
  user: PublicKey,
  market: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  const [userOpenOrders] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_MARKET_ORDER_SEED), market.toBuffer(), user.toBytes()],
    program.programId
  );

  const tx = new Transaction();

  const txId = await program.methods
    .createOpenOrders()
    .accounts({
      user,
      market,
      userOpenOrders,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  tx.add(txId);

  return tx;
};

/// TODO: complete ix args
export const placeOrderTx = async (
  maker: PublicKey,
  market: PublicKey,
  side: Side,
  price: number,
  quantity: number,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const { data } = await getMarketState(market, program);

  const [userOpenOrders] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_MARKET_ORDER_SEED), market.toBuffer(), maker.toBytes()],
    program.programId
  );

  const [bidsBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('bids book: ', bidsBook.toBase58());

  const [asksBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(ASK_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('asks book: ', asksBook.toBase58());

  const userBaseTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.baseMint
  );
  console.log('userBaseTokenAccount: ', userBaseTokenAccount.toBase58());
  const userQuoteTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.quoteMint
  );
  console.log('userQuoteTokenAccount: ', userQuoteTokenAccount.toBase58());

  const baseVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('baseVaultAccount: ', baseVaultAccount.toBase58());
  const quoteVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('quoteVaultAccount: ', quoteVaultAccount.toBase58());

  const tx = new Transaction();

  const txId = await program.methods
    .placeOrder(
      side,
      new anchor.BN(price),
      new anchor.BN(quantity)
    )
    .accounts({
      maker,
      globalPool,
      market,
      userOpenOrders,
      baseMint: data.baseMint,
      quoteMint: data.quoteMint,
      userBaseTokenAccount,
      userQuoteTokenAccount,
      baseVaultAccount,
      quoteVaultAccount,
      bidsBook,
      asksBook,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  tx.add(txId);

  return tx;
};

/// TODO: complete whole
export const cancelOrderTx = async (
  maker: PublicKey,
  market: PublicKey,
  side: Side,
  price: number,
  quantity: number,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const { data } = await getMarketState(market, program);

  const [userOpenOrders] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_MARKET_ORDER_SEED), market.toBuffer(), maker.toBytes()],
    program.programId
  );

  const [bidsBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('bids book: ', bidsBook.toBase58());

  const [asksBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(ASK_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('asks book: ', asksBook.toBase58());

  const userBaseTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.baseMint
  );
  console.log('userBaseTokenAccount: ', userBaseTokenAccount.toBase58());
  const userQuoteTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.quoteMint
  );
  console.log('userQuoteTokenAccount: ', userQuoteTokenAccount.toBase58());

  const baseVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('baseVaultAccount: ', baseVaultAccount.toBase58());
  const quoteVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('quoteVaultAccount: ', quoteVaultAccount.toBase58());

  const tx = new Transaction();

  const txId = await program.methods
    .placeOrder(
      side,
      new anchor.BN(price),
      new anchor.BN(quantity)
    )
    .accounts({
      maker,
      globalPool,
      market,
      userOpenOrders,
      baseMint: data.baseMint,
      quoteMint: data.quoteMint,
      userBaseTokenAccount,
      userQuoteTokenAccount,
      baseVaultAccount,
      quoteVaultAccount,
      bidsBook,
      asksBook,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  tx.add(txId);

  return tx;
};

/// TODO: complete whole ix
export const takeOrderTx = async (
  maker: PublicKey,
  market: PublicKey,
  side: Side,
  price: number,
  quantity: number,
  program: anchor.Program<HybridDex>
) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  const { data } = await getMarketState(market, program);

  const [userOpenOrders] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_MARKET_ORDER_SEED), market.toBuffer(), maker.toBytes()],
    program.programId
  );

  const [bidsBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(BID_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('bids book: ', bidsBook.toBase58());

  const [asksBook] = PublicKey.findProgramAddressSync(
    [Buffer.from(ASK_BOOK_SEED), market.toBuffer()],
    program.programId
  );
  console.log('asks book: ', asksBook.toBase58());

  const userBaseTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.baseMint
  );
  console.log('userBaseTokenAccount: ', userBaseTokenAccount.toBase58());
  const userQuoteTokenAccount = await getAssociatedTokenAccount(
    maker,
    data.quoteMint
  );
  console.log('userQuoteTokenAccount: ', userQuoteTokenAccount.toBase58());

  const baseVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('baseVaultAccount: ', baseVaultAccount.toBase58());
  const quoteVaultAccount = await getAssociatedTokenAccount(
    market,
    data.baseMint
  );
  console.log('quoteVaultAccount: ', quoteVaultAccount.toBase58());

  const tx = new Transaction();

  const txId = await program.methods
    .placeOrder(
      side,
      new anchor.BN(price),
      new anchor.BN(quantity)
    )
    .accounts({
      maker,
      globalPool,
      market,
      userOpenOrders,
      baseMint: data.baseMint,
      quoteMint: data.quoteMint,
      userBaseTokenAccount,
      userQuoteTokenAccount,
      baseVaultAccount,
      quoteVaultAccount,
      bidsBook,
      asksBook,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  tx.add(txId);

  return tx;
};

/**
 * Fetch global pool PDA data
 */
export const getGlobalState = async (program: anchor.Program<HybridDex>) => {
  const [globalPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_AUTHORITY_SEED)],
    program.programId
  );

  try {
    let globalPoolData = await program.account.globalPool.fetch(globalPool);

    return {
      key: globalPool,
      data: globalPoolData,
    };
  } catch (e) {
    console.error(e);

    return {
      key: globalPool,
      data: null,
    };
  }
};

/**
 * Fetch market PDA data
 */
export const getMarketState = async (
  market: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  try {
    let marketData = await program.account.market.fetch(market);

    return {
      key: market,
      data: marketData,
    };
  } catch (e) {
    console.error(e);

    return {
      key: market,
      data: null,
    };
  }
};

/**
 * Fetch user market orders PDA data
 */
//// TODO:
export const getUserMarketOrdersState = async (
  market: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  try {
    let marketData = await program.account.market.fetch(market);

    return {
      key: market,
      data: marketData,
    };
  } catch (e) {
    console.error(e);

    return {
      key: market,
      data: null,
    };
  }
};

/**
 * Fetch market order book PDA data
 */
//// TODO:
export const getMarketBookState = async (
  market: PublicKey,
  program: anchor.Program<HybridDex>
) => {
  try {
    let marketData = await program.account.market.fetch(market);

    return {
      key: market,
      data: marketData,
    };
  } catch (e) {
    console.error(e);

    return {
      key: market,
      data: null,
    };
  }
};
