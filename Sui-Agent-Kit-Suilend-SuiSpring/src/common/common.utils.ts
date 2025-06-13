import BigNumber from 'bignumber.js';

/**
 * Formats a raw token amount (BigInt or string) into a UI-friendly string with specified decimals.
 * @param rawAmount The raw amount as a BigInt string or BigNumber.
 * @param decimals The number of decimals for the token.
 * @param fixedDecimalPlaces The number of decimal places to show in the output string (optional).
 * @returns A string representation of the formatted amount.
 */
export function formatTokenAmount(
  rawAmount: string | BigNumber | bigint,
  decimals: number,
  fixedDecimalPlaces?: number
): string {
  if (rawAmount === null || rawAmount === undefined) return '0';
  const bnAmount = new BigNumber(rawAmount.toString());
  const formatted = bnAmount.shiftedBy(-decimals);
  return fixedDecimalPlaces !== undefined ? formatted.toFixed(fixedDecimalPlaces) : formatted.toString();
}

/**
 * Converts a UI-friendly string amount into a raw BigInt string for transactions.
 * @param uiAmount The UI amount as a string.
 * @param decimals The number of decimals for the token.
 * @returns A BigInt string representation of the raw amount.
 */
export function parseTokenAmount(
  uiAmount: string,
  decimals: number
): string {
  if (!uiAmount) return '0';
  const bnAmount = new BigNumber(uiAmount);
  return bnAmount.shiftedBy(decimals).integerValue(BigNumber.ROUND_FLOOR).toString();
}

/**
 * Shortens a Sui address or object ID for display.
 * @param address The full address or ID string.
 * @param startChars Number of characters to show at the start.
 * @param endChars Number of characters to show at the end.
 * @returns A shortened string (e.g., "0x123...abc").
 */
export function shortenAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return '';
  if (address.length <= startChars + endChars + 2) return address; // +2 for "0x"
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
}

// Add other common utility functions. 