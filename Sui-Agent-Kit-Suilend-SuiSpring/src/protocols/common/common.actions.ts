import { SuiNetwork } from '../mystensui/mystenSui.config';
import { TokenInfo, getTokenInfoBySymbol as getTokenInfoFromRegistry } from '../../common/tokenRegistry';
// Potencialmente, no futuro, poderíamos importar o SuiClient aqui se precisarmos buscar metadados on-chain
// import { SuiClient } from '@mysten/sui/client';

export interface CoinTypeInfoResult extends TokenInfo {} // Para clareza, mas é a mesma estrutura

/**
 * Retrieves the coin type and metadata for a given token symbol and network.
 * Currently uses a static registry.
 *
 * @param symbol The token symbol (e.g., "SUI", "USDC").
 * @param network The Sui network.
 * @returns CoinTypeInfoResult or null if not found.
 */
export async function getCoinTypeAndMetadataBySymbol(
  symbol: string,
  network: SuiNetwork
  // suiClient?: SuiClient // Opcional, para futuras buscas on-chain
): Promise<CoinTypeInfoResult | null> {
  const logPrefix = `[getCoinTypeAndMetadataBySymbol (${network})]`;

  const tokenInfo = getTokenInfoFromRegistry(symbol, network);

  if (tokenInfo) {
    console.log(`${logPrefix} Found token in registry for symbol "${symbol}":`, tokenInfo);
    // No futuro, poderíamos complementar com dados on-chain se `suiClient` for fornecido
    // e se o registro local for apenas parcial.
    // Ex: if (suiClient && !tokenInfo.decimals) { ... fetch on-chain ... }
    return tokenInfo;
  } else {
    console.log(`${logPrefix} Token symbol "${symbol}" not found in local registry for network "${network}".`);
    // Aqui poderíamos tentar uma busca on-chain se tivéssemos um mecanismo mais robusto
    // para descobrir coin types a partir de símbolos (o que é difícil sem um registry centralizado on-chain)
    // ou se o usuário fornecesse um suposto coin type para verificação.
    return null;
  }
} 