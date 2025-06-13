import { z } from 'zod';
import {
    formatTokenAmountSchema,
    parseTokenAmountSchema,
    shortenAddressSchema
} from '../zodSchemas/commonSchemas';
import {
    formatTokenAmount as sdkFormatTokenAmount,
    parseTokenAmount as sdkParseTokenAmount,
    shortenAddress as sdkShortenAddress
} from '@/common/common.utils';
import { McpToolOutput } from '../mcpUtils';
import { getCoinTypeBySymbolSchema } from '../zodSchemas/commonSchemas';
import { CoinTypeInfoResult, getCoinTypeAndMetadataBySymbol } from '../../protocols/common/common.actions';
import { InternalSdkClientManager } from '../internalSdkClientManager';

export async function handleFormatTokenAmount(
    inputs: z.infer<typeof formatTokenAmountSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkFormatTokenAmount(inputs.rawAmount, inputs.decimals, inputs.fixedDecimalPlaces);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error formatting token amount: ${error.message}`);
    }
}

export async function handleParseTokenAmount(
    inputs: z.infer<typeof parseTokenAmountSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkParseTokenAmount(inputs.uiAmount, inputs.decimals);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error parsing token amount: ${error.message}`);
    }
}

export async function handleShortenAddress(
    inputs: z.infer<typeof shortenAddressSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkShortenAddress(inputs.address, inputs.startChars, inputs.endChars);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error shortening address: ${error.message}`);
    }
}

export interface McpToolResponse {
    content: Array<{ type: "text"; text: string; [key: string]: any; } | any>;
    [key: string]: any;
}

export async function handleGetCoinTypeBySymbol(
    params: z.infer<typeof getCoinTypeBySymbolSchema>,
    // clientManager: InternalSdkClientManager
): Promise<McpToolResponse> {
    const logPrefix = `[MCP][handleGetCoinTypeBySymbol]`;
    try {
        const result = await getCoinTypeAndMetadataBySymbol(
            params.symbol,
            params.network
        );

        if (!result) {
            throw new Error(`Token symbol "${params.symbol}" not found on network "${params.network}".`);
        }

        const { aliases, network, ...mcpResultData } = result;

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(mcpResultData, null, 2)
                }
            ],
            ...mcpResultData
        };

    } catch (error: any) {
        console.error(`${logPrefix} Error:`, error.message);
        throw error;
    }
} 