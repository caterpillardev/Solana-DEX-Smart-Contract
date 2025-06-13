import { SuiNetwork } from '../protocols/mystensui/mystenSui.config'; // Assumindo que SuiNetwork pode ser importado

export interface TokenInfo {
  coinType: string;
  decimals: number;
  symbol: string; // O símbolo principal/comum
  name: string;
  iconUrl?: string;
  aliases?: string[]; // Outros símbolos/aliases pelos quais pode ser conhecido
  network: SuiNetwork;
}

// Poderíamos ter um array por rede, ou uma estrutura mais complexa se necessário.
// Por simplicidade, um array único com a rede como propriedade.

const tokenRegistry: TokenInfo[] = [
  // Mainnet
  {
    coinType: '0x2::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
    name: 'Sui',
    network: 'mainnet',
    iconUrl: 'https://raw.githubusercontent.com/MystenLabs/sui/main/apps/wallet/src/ui/assets/images/sui-token.png', // Exemplo
  },
  {
    coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin (Wrapped by Wormhole)',
    network: 'mainnet',
    aliases: ['USDCet'],
    iconUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' // Exemplo
  },
  {
    coinType: '0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI',
    decimals: 9,
    symbol: 'paraSUI',
    name: 'ParaSui',
    network: 'mainnet',
  },
  // Testnet (exemplos, podem precisar de atualização)
  {
    coinType: '0x2::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
    name: 'Sui',
    network: 'testnet',
  },
  // Adicionar mais tokens conforme necessário
];

export function getTokenInfoBySymbol(symbol: string, network: SuiNetwork): TokenInfo | undefined {
  const searchTerm = symbol.toLowerCase();
  return tokenRegistry.find(
    (token) =>
      token.network === network &&
      (token.symbol.toLowerCase() === searchTerm ||
        (token.aliases && token.aliases.some(alias => alias.toLowerCase() === searchTerm)))
  );
}

export function getTokenInfoByCoinType(coinType: string, network: SuiNetwork): TokenInfo | undefined {
  return tokenRegistry.find(
    (token) => token.network === network && token.coinType === coinType
  );
}