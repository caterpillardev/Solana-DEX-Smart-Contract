import { Pool, Route } from '@suilend/steamm-sdk'; // Assuming these types are exported
import { PoolInfo as SDKPoolInfo, BankInfo as SDKBankInfo, QuoterData as SDKQuoterData } from '@suilend/steamm-sdk/types';
// Import DepositQuote and SwapQuote correctly
import { DepositQuote as SDKDepositQuote, SwapQuote as SDKSwapQuote, RedeemQuote as SDKRedeemQuote } from '@suilend/steamm-sdk/base/pool/poolTypes';

// Enriched type for UI display of a STEAMM pool
export interface SteammPoolExtended {
  // Fields from PoolInfo
  poolId: string; 
  coinTypeA: string;
  coinTypeB: string;
  lpTokenType: string;
  quoterType: string;
  swapFeeBps: number;
  quoterData?: SDKQuoterData; // Use SDKQuoterData type
  
  // Added for UI
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  lpSymbol: string; 
  lpDecimals: number; 
  balanceAUi: string; 
  balanceBUi: string; 
  reserveA_ui?: string; 
  reserveB_ui?: string; 
  lpCoinBalanceUi?: string; 
  aprPercent?: string;  
  rawPoolInfo: SDKPoolInfo; // Store the original PoolInfo for reference
}

// For displaying swap route details
export interface SteammRouteInfo {
  route: Route; // The Route object from the SDK
  inputCoinType: string;
  outputCoinType: string;
  inputAmountUi: string;
  outputAmountUi: string;
  inputSymbol: string;
  outputSymbol: string;
  // Add other details like price impact, fees, intermediate hops if needed for UI
}

export interface UserLiquidityPositionInfo {
    poolId: string;
    poolType: string; // e.g. 'cpmm' or 'omm'
    coinTypeA: string;
    coinTypeB: string;
    symbolA: string;
    symbolB: string;
    lpCoinType: string;
    lpSymbol: string;
    lpDecimals: number;
    lpCoinBalanceUi: string;
    sharePercent?: string; // User's share of the pool
    pooledAmountAUi: string; // User's share of coin A
    pooledAmountBUi: string; // User's share of coin B
}

export interface SteammAddLiquidityQuoteResult {
  poolId: string;
  amountAInUi: string;
  amountBInUi: string;
  lpTokensOutUi: string;
  coinTypeA: string;
  coinTypeB: string;
  lpCoinType: string;
  rawQuote: SDKDepositQuote; 
}

export interface SteammRemoveLiquidityQuoteResult {
  poolId: string;
  amountAOutUi: string;
  amountBOutUi: string;
  lpTokensInUi: string; // Actual LP that will be burned
  coinTypeA: string;
  coinTypeB: string;
  lpCoinType: string;
  rawQuote: SDKRedeemQuote;
} 