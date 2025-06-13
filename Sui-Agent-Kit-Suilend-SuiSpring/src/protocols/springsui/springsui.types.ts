// Contents of src/protocols/springsui/springsui.types.ts

// You can define UI-specific or enriched types related to SpringSui LSTs here.
// For example, if you combine SDK data with APY calculations or user balance info.

export interface SpringSuiUserLSTInfo {
  lstCoinType: string;
  lstSymbol: string;
  lstBalanceUi: string;
  suiEquivalentUi?: string; // If redemption rate is applied
  apyPercent?: string;      // If fetched or calculated
  // underlying LiquidStakingObjectInfo from SDK can also be included
} 