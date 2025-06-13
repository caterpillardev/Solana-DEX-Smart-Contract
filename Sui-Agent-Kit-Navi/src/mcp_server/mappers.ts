import { CoinInfo } from 'navi-sdk'; // Correct import for CoinInfo
import { Sui, NAVX, CETUS, WETH, USDT, WBTC, AUSD, nUSDC, wUSDC, ETH, vSui } from 'navi-sdk/dist/address';

// Define CoinInfo for HIPPO and UNI if not already in navi-sdk's address exports
const HIPPO_COIN_INFO: CoinInfo = {
    symbol: 'HIPPO',
    address: '0x8993129d72e733985f7f1a00396cbd055bad6f817fee36576ce483c8bbb8b87b',
    decimal: 9, // Common for HIPPO token
};

const UNI_COIN_INFO: CoinInfo = {
    symbol: 'UNI', // Using UNI_SUI to distinguish from potential Ethereum UNI
    address: '0xaf9e228fd0292e2a27b4859bc57a2f3a9faedb9341b6307c84fef163e44790cc::uni::UNI',
    decimal: 9,
};

const coinSymbolToInfoMap: Record<string, CoinInfo> = {
    SUI: Sui,
    USDC: wUSDC,
    WUSDC: wUSDC,
    NUSDC: nUSDC,
    USDT: USDT,
    WETH: WETH,
    ETH: ETH,
    CETUS: CETUS,
    NAVX: NAVX,
    WBTC: WBTC,
    AUSD: AUSD,
    VSUI: vSui,
    VSUI_STG: vSui,
    HIPPO: HIPPO_COIN_INFO,
    UNI: UNI_COIN_INFO,
    // Add other common symbols and map them to the correct CoinInfo exports
    // e.g., "BTC" might map to WBTC if that's the wrapped version used in Navi
};

/**
 * Converts an asset symbol string to its corresponding CoinInfo object.
 * Case-insensitive search.
 * @param assetSymbol The asset symbol (e.g., "SUI", "usdc").
 * @returns The CoinInfo object or undefined if not found.
 */
export function mapAssetSymbolToCoinInfo(assetSymbol: string): CoinInfo | undefined {
    return coinSymbolToInfoMap[assetSymbol.toUpperCase()];
}

/**
 * Converts a human-readable amount to the coin's smallest unit using its decimals.
 * @param amount The human-readable amount (e.g., 10.5).
 * @param coinInfo The CoinInfo object containing the decimal information.
 * @returns The amount in the smallest unit as a BigInt.
 */
export function amountToSmallestUnit(amount: number, coinInfo: CoinInfo): bigint {
    const amountStr = String(amount);
    const [integerPart, decimalPart = ''] = amountStr.split('.');

    let combinedStr = integerPart;
    if (coinInfo.decimal > 0) {
        combinedStr += decimalPart.padEnd(coinInfo.decimal, '0').substring(0, coinInfo.decimal);
    } else if (decimalPart.length > 0) {
        // Coin has 0 decimals, but user provided decimals or we can teach AI use tokenMetaData function on Mysten labs another REPO.
    }
    
    if (combinedStr.length > 1 && combinedStr.startsWith('0') && !combinedStr.startsWith('0.')) {
        combinedStr = combinedStr.replace(/^0+/, '');
        if (combinedStr === '') combinedStr = '0';
    }
    
    return BigInt(combinedStr);
}

/**
 * Converts an amount from its smallest unit to a human-readable float.
 * @param smallestUnitBalance The amount in the coin's smallest unit (string, number, or bigint).
 * @param coinInfo The CoinInfo object containing the decimal information.
 * @returns The human-readable amount as a number.
 */
export function smallestUnitToAmount(smallestUnitBalance: string | number | bigint, coinInfo: CoinInfo): number {
    const balance = BigInt(smallestUnitBalance);
    if (coinInfo.decimal === 0) {
        return Number(balance);
    }
    const factor = BigInt(10) ** BigInt(coinInfo.decimal);
    const integerPart = balance / factor;
    const fractionalPart = balance % factor;

    if (fractionalPart === BigInt(0)) {
        return Number(integerPart);
    }
    const fractionalString = fractionalPart.toString().padStart(coinInfo.decimal, '0');
    return parseFloat(`${integerPart}.${fractionalString}`);
} 