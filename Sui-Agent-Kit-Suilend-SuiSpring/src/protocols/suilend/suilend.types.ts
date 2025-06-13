import { Reserve } from '@suilend/sdk/_generated/suilend/reserve/structs'; // Corrected import and type
import BigNumber from 'bignumber.js';
import { ParsedReserve } from '@suilend/sdk/parsers/reserve';

// Enriched type for UI display, combining SDK data with app-specific formatting/metadata
// Assuming P is the pool type (string from LendingMarket<string>)
// and T (coin type) is implicitly handled or not needed for the base Reserve struct reference here.
export interface ReserveAssetDataExtended {
  reserveId: string; // was 'id'
  asset: {
    coinType: string;
    symbol: string;
    name: string;
    decimals: number;
    priceUsd: string; // was 'price'
    iconUrl?: string | null; // was 'iconUrl'
  };
  marketStats: {
    totalDepositedAsset: string; // was 'totalDepositedUi'
    totalDepositedUsd: string; // New: needs to be calculated: depositedAmount * price
    totalBorrowedAsset: string; // was 'totalBorrowedUi'
    totalBorrowedUsd: string; // New: needs to be calculated: borrowedAmount * price
    availableToBorrowAsset: string; // was 'availableAmountUi'
    availableToBorrowUsd: string; // New: needs to be calculated: availableAmount * price
    utilizationPercent: string; // was 'utilizationPercent', numeric string
    cTokenTotalSupply: string; // was 'ctokenSupplyUi'
    depositLimitAsset: string; // was 'depositLimit'
    borrowLimitAsset: string;  // was 'borrowLimit'
  };
  currentApys: {
    depositApyPercent: string; // was 'supplyApyPercent', numeric string
    borrowApyPercent: string;  // was 'borrowApyPercent', numeric string
  };
  config: {
    openLtvPercent: number;
    closeLtvPct: number; // Added from parsed.config
    maxCloseLtvPct: number; // Added from parsed.config
    borrowWeightBps: number; // Added from parsed.config (BigNumber to number)
    liquidationBonusBps: number; // Added from parsed.config
    borrowFeeBps: number; // Added from parsed.config
    spreadFeeBps: number; // Added from parsed.config
    protocolLiquidationFeeBps: number; // Added from parsed.config
    depositLimitUsd: string; // Added from parsed.config
    borrowLimitUsd: string; // Added from parsed.config
    isolated: boolean; // Added from parsed.config
  };
  activeRewards: {
    deposit: Array<{ rewardAssetSymbol: string; rewardAssetCoinType: string; rewardApyPercent?: string }>;
    borrow: Array<{ rewardAssetSymbol: string; rewardAssetCoinType: string; rewardApyPercent?: string }>;
  };
  cTokenInfo: {
    coinType: string; // Can be "N/A" or the cToken's actual coin type if available
    decimals: number; // From parsed.mintDecimals
    exchangeRateToAsset: string; // From parsed.cTokenExchangeRate
  };
  rawParsedData?: ParsedReserve; // Kept for debugging or deeper dives if necessary
}

// Represents a single collateral item in the obligation details
interface SuilendCollateralItem {
  coinType: string;
  symbol: string;
  decimals: number;
  depositedAmountUi: string; // Formatted UI string
  depositedValueUsd: string; // Formatted UI string
  depositedAmountBn: BigNumber; // Raw BigNumber amount (Adjusted for decimals)
}

// Represents a single borrow item in the obligation details
interface SuilendBorrowItem {
  coinType: string;
  symbol: string;
  decimals: number;
  borrowedAmountUi: string; // Formatted UI string
  borrowedValueUsd: string; // Formatted UI string
  borrowedAmountBn: BigNumber; // Raw BigNumber amount (Adjusted for decimals)
}

// Estrutura para SimplifiedUserReward
export interface SimplifiedUserReward {
  rewardSymbol: string;
  rewardIconUrl?: string | null;
  rewardMintDecimals: number;
  earnedAmount: string;
  rewardPrice: string;
  earnedAmountUsd: string;
}

// Estrutura para ObligationPosition (para depósitos e empréstimos)
export interface ObligationPosition {
  coinType: string;
  symbol: string;
  iconUrl?: string | null;
  amount: string;
  amountUsd: string;
  price: string;
  mintDecimals: number;
  ctokenAmount?: string; // Apenas para depósitos
  reserveOpenLtvPct: number;
  reserveDepositAprPercent: string;
  reserveBorrowAprPercent: string;
  rewards: SimplifiedUserReward[];
}

// Represents the detailed view of a user's Suilend obligation
export interface SuilendObligationDetails {
  id: string; // ID da Obrigação
  depositedAmountUsd: string; // Valor total dos depósitos em USD
  borrowedAmountUsd: string; // Valor total dos empréstimos em USD
  netValueUsd: string; // Valor líquido da obrigação em USD
  borrowLimitUsd: string; // Limite total de empréstimo em USD
  unhealthyBorrowValueUsd: string; // Valor de empréstimo em USD que tornaria a obrigação liquidável
  healthFactor: string; // Calculado: borrowLimitUsd / borrowedAmountUsd
  depositPositionCount: number;
  borrowPositionCount: number;
  deposits: ObligationPosition[];
  borrows: ObligationPosition[];
}

// --- Nova Interface para Identificadores de Obrigação do Usuário ---
export interface UserSuilendObligationIdentifiers {
  obligationId: string;
  ownerCapId: string;
}

// --- Tipos para Histórico de Obrigação ---
// Baseado em node_modules/@suilend/sdk/utils/obligation.d.ts

export type NonLiquidationHistoryEvent = {
    reserveId: string;
    quantity: number; // SDK usa number, pode ser BigNumber dependendo do uso
    action: string;
    timestampMs: number;
    digest: string;
};

export type LiquidationHistoryEvent = {
    repayReserveId: string;
    repayQuantity: number; // SDK usa number
    withdrawReserveId: string;
    withdrawQuantity: number; // SDK usa number
    action: "Liquidation";
    timestampMs: number;
    digest: string;
};

export type FormattedObligationHistory = NonLiquidationHistoryEvent | LiquidationHistoryEvent;

export interface ObligationHistoryPage {
  cursor: string | null | undefined;
  history: FormattedObligationHistory[];
} 

// Defined a comprehensive set of interfaces for Suilend market asset data.

export interface SuilendAssetInfo {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: string;
  iconUrl?: string | null;
}

export interface SuilendMarketStats {
  totalDepositedAsset: string;
  totalDepositedUsd: string;
  totalBorrowedAsset: string;
  totalBorrowedUsd: string;
  availableToBorrowAsset: string;
  availableToBorrowUsd: string;
  utilizationPercent: string;
  cTokenTotalSupply: string;
  depositLimitAsset: string;
  borrowLimitAsset: string;
}

export interface SuilendCurrentApys {
  depositApyPercent: string;
  borrowApyPercent: string;
}

export interface SuilendConfig {
  openLtvPercent: number;
  closeLtvPct: number;
  maxCloseLtvPct: number;
  borrowWeightBps: string;
  liquidationBonusBps: number;
  borrowFeeBps: number;
  spreadFeeBps: number;
  protocolLiquidationFeeBps: number;
  depositLimitUsd: string;
  borrowLimitUsd: string;
  isolated: boolean;
}

export interface SuilendRewardInfo {
  rewardAssetSymbol: string;
  rewardAssetCoinType: string;
  rewardApyPercent: string;
}

export interface SuilendActiveRewards {
  deposit: SuilendRewardInfo[];
  borrow: SuilendRewardInfo[];
}

export interface SuilendCTokenInfo {
  coinType: string; // Geralmente "N/A"
  decimals: number;
  exchangeRateToAsset: string;
}

// Estrutura para rawParsedData.config.interestRate
export interface RawInterestRatePoint {
  id: string;
  utilPercent: BigNumber;
  aprPercent: BigNumber;
}

// Estrutura para rawParsedData.config
export interface RawReserveConfig {
  $typeName: string;
  openLtvPct: number;
  closeLtvPct: number;
  maxCloseLtvPct: number;
  borrowWeightBps: BigNumber;
  depositLimit: BigNumber;
  borrowLimit: BigNumber;
  liquidationBonusBps: number;
  maxLiquidationBonusBps: number;
  depositLimitUsd: BigNumber;
  borrowLimitUsd: BigNumber;
  borrowFeeBps: number;
  spreadFeeBps: number;
  protocolLiquidationFeeBps: number;
  isolated: boolean;
  openAttributedBorrowLimitUsd: number;
  closeAttributedBorrowLimitUsd: number;
  interestRate: RawInterestRatePoint[];
}

// Estrutura para rawParsedData.depositsPoolRewardManager.poolRewards[] e borrows
export interface RawPoolReward {
  $typeName: string;
  id: string;
  poolRewardManagerId: string;
  coinType: string;
  startTimeMs: number;
  endTimeMs: number;
  totalRewards: BigNumber;
  allocatedRewards: BigNumber;
  cumulativeRewardsPerShare: BigNumber;
  numUserRewardManagers: bigint;
  rewardIndex: number;
  symbol: string;
  mintDecimals: number;
}

// Estrutura para rawParsedData.depositsPoolRewardManager e borrows
export interface RawPoolRewardManager {
  $typeName: string;
  id: string;
  totalShares: bigint;
  poolRewards: RawPoolReward[];
  lastUpdateTimeMs: bigint;
}

// Estrutura para rawParsedData.token
export interface RawTokenInfo {
  decimals: number;
  description: string;
  iconUrl?: string | null;
  id?: string | null;
  name: string;
  symbol: string;
  coinType: string;
}

// Estrutura principal para rawParsedData
export interface SuilendRawParsedData {
  config: RawReserveConfig;
  $typeName: string;
  id: string;
  arrayIndex: bigint;
  coinType: string;
  mintDecimals: number;

  priceIdentifier: string;
  price: BigNumber;
  smoothedPrice: BigNumber;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  priceLastUpdateTimestampS: bigint;

  availableAmount: BigNumber;
  ctokenSupply: BigNumber;
  borrowedAmount: BigNumber;
  depositedAmount: BigNumber;
  cumulativeBorrowRate: BigNumber;
  interestLastUpdateTimestampS: bigint;
  unclaimedSpreadFees: BigNumber;
  attributedBorrowValue: BigNumber;

  depositsPoolRewardManager: RawPoolRewardManager;
  borrowsPoolRewardManager: RawPoolRewardManager;
  
  availableAmountUsd: BigNumber;
  borrowedAmountUsd: BigNumber;
  depositedAmountUsd: BigNumber;

  cTokenExchangeRate: BigNumber;
  borrowAprPercent: BigNumber;
  depositAprPercent: BigNumber;
  utilizationPercent: BigNumber;
  
  token: RawTokenInfo;
  
  symbol: string;
  name: string;
  /** @deprecated since version 1.1.19. Use \`token.iconUrl\` instead. */
  iconUrl?: string | null;
  /** @deprecated since version 1.1.19. Use \`token.description\` instead. */
  description: string;
  /** @deprecated since version 1.0.3. Use \`depositedAmount\` instead. */
  totalDeposits: BigNumber;
}

// Estrutura "Large" final para cada asset do mercado
export interface SuilendMarketAssetLarge {
  reserveId: string;
  asset: SuilendAssetInfo;
  marketStats: SuilendMarketStats;
  currentApys: SuilendCurrentApys;
  config: SuilendConfig;
  // activeRewards: SuilendActiveRewards; // Comentado conforme decisão de não exibir rewards detalhados por ora
  cTokenInfo: SuilendCTokenInfo;
  rawParsedData?: SuilendRawParsedData; // Mantido opcional para o formato 'large'
} 