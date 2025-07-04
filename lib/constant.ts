import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

export const GLOBAL_AUTHORITY_SEED = 'global-authority';
export const MARKET_SEED = 'market';
export const USER_MARKET_ORDER_SEED = 'user-market-book';
export const BID_BOOK_SEED = 'bid-book';
export const ASK_BOOK_SEED = 'ask-book';

export const PROGRAM_ID = new PublicKey(
  '6z1NX1CodyGPbJ8sAVirasDsYgw1xSnkyjyprSnMfvRy'
);

export const BASE_TOKEN_MINT = new PublicKey(
  'D92kVhCWKwBVG5H2tapXnrdRdAEwNcG2sXM8kjtiqMtM'
);

export const BASE_TOKEN_DECIMAL = 1_000_000_000;

export const WSOL_MINT = NATIVE_MINT;
