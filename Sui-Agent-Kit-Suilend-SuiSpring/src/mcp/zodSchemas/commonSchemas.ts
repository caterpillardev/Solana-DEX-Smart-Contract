import { z } from 'zod';
import { SuiNetwork } from '../../protocols/mystensui/mystenSui.config'; // Verifique o caminho se necessário

// Definição do enum para SuiNetwork diretamente no Zod se não importado de outro lugar
// ou se quisermos ter um controle mais granular sobre os valores permitidos pela MCP tool.
const SuiNetworkEnum = z.enum(['mainnet', 'testnet', 'devnet', 'localnet']); // Removido 'custom' por enquanto, MCP geralmente opera em redes conhecidas

export const formatTokenAmountSchema = z.object({
    rawAmount: z.string().describe("The raw token amount as a string (e.g., from a contract call)."),
    decimals: z.number().int().min(0).describe("The number of decimal places the token uses."),
    fixedDecimalPlaces: z.number().int().min(0).optional().describe("Optional. The number of decimal places to show in the output string.")
}).describe("Formats a raw token amount (usually a large numeric string from a contract) into a human-readable format, considering the token's decimals. Useful for displaying balances or amounts clearly to the end-user (e.g., '123.45').");

export const parseTokenAmountSchema = z.object({
    uiAmount: z.string().describe("The UI formatted amount as a string."),
    decimals: z.number().int().min(0).describe("The number of decimal places the token uses.")
}).describe("Converts a user-facing formatted token amount (e.g., '123.45') back to its raw value representation (large numeric string), considering the token's decimals. Necessary for preparing amounts to be sent in contract transactions.");

export const shortenAddressSchema = z.object({
    address: z.string().describe("The full Sui address or object ID string."),
    startChars: z.number().int().min(1).optional().default(6).describe("Optional. Number of characters to show at the start. Defaults to 6."),
    endChars: z.number().int().min(1).optional().default(4).describe("Optional. Number of characters to show at the end. Defaults to 4.")
}).describe("Shortens a full Sui address or object ID for a more concise display (e.g., '0x123...abc'), useful in user interfaces. Allows configuration of how many characters to show at the start and end of the identifier.");

export const getCoinTypeBySymbolSchema = z.object({
  symbol: z.string().min(1, { message: "Symbol cannot be empty." }),
  network: SuiNetworkEnum.optional().default('mainnet'), // Default para mainnet se não especificado
}).describe("Gets the full `coinType` (e.g., '0x2::sui::SUI') and basic metadata (like decimals, official name, symbol, icon URL) for a token, given its market symbol (e.g., 'SUI') and network. **Important for translating a user-friendly symbol to the technical `coinType` identifier required in many other token operations.**"); 