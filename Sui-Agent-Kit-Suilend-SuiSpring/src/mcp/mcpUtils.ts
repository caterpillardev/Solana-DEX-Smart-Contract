/**
 * Represents a resource item in MCP content, used for prepared transactions.
 */
// export interface McpResourceItem { // REMOVING this generic item
//     uri: string; 
//     text?: string; 
//     blob?: string; 
//     mimeType?: string; 
//     [key: string]: any;
// }

/**
 * Standard output structure for MCP tool execution content items.
 * Aligned with MCP SDK expectations.
 */
export type McpOutputContentItem = (
    {
        type: "text";
        text: string; // text is mandatory for type "text"
        details?: string;
    } | {
        type: "resource";
        // Discriminated union for resource types
        resource: 
            | { uri: string; text: string; mimeType?: string; [key: string]: any } // Textual resource
            | { uri: string; blob: string; mimeType: string; [key: string]: any }; // Blob resource
        text?: string; // Optional accompanying text/description for the resource item itself
        details?: string;
    }
) & { [key: string]: any; }; // Allows for additional top-level properties if needed


export interface McpToolOutput {
    content: McpOutputContentItem[];
    isError?: boolean; // MCP standard way to indicate an error
    [key: string]: any; // Allows for additional top-level properties if needed
}

/**
 * Output structure for MCP tools that prepare a transaction block.
 */
export interface PreparedTransactionOutput extends McpToolOutput {
    content: [
        {
            type: "resource";
            text?: string; // e.g., user-friendly message like "Transaction prepared for signing"
            resource: { // Directly define the blob resource structure
                uri: string; 
                blob: string; 
                mimeType: "application/vnd.sui.prepared-transaction+json"; // Specific mimeType
                [key: string]: any; // Allow other properties from txDetails
            };
            details?: string; 
        }
    ];
}

/**
 * JSON replacer function to convert BigNumber and bigint instances to strings.
 * This is useful for serializing objects that contain these types before sending them in API responses.
 * @param key The key being serialized.
 * @param value The value being serialized.
 * @returns The string representation of BigNumber/bigint, or the original value.
 */
export function bigNumberReplacer(key: any, value: any): any {
    // Import BigNumber here to avoid issues if this file is imported in contexts where BigNumber isn't globally available
    // For this project structure, assuming BigNumber is generally available or handled by bundler.
    // No, it's better to check its constructor name if BigNumber is not directly imported.
    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'BigNumber') {
        return value.toString();
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

/**
 * Creates a standard text output for MCP tools.
 * @param data The data to be stringified and included in the text output.
 * @param space Optional. For JSON.stringify, adds indentation, white space, and line break characters to the return-value JSON text.
 * @returns McpToolOutput object with the text content.
 */
export function createTextOutput(data: any, space?: number | string): McpToolOutput {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(data, bigNumberReplacer, space),
            },
        ],
        isError: false,
    };
}

/**
 * Creates a standard error output for MCP tools.
 * @param message The error message.
 * @param error Optional. The error object or additional details.
 * @returns McpToolOutput object with the error content.
 */
export function createErrorOutput(message: string, error?: any): McpToolOutput {
    let errorDetails = '';
    if (error) {
        if (error instanceof Error) {
            errorDetails = JSON.stringify({ 
                name: error.name,
                message: error.message, 
                stack: error.stack,
                // cause: error.cause, // Consider adding if TS version supports it well
            }, bigNumberReplacer, 2);
        } else if (typeof error === 'object') {
            errorDetails = JSON.stringify(error, bigNumberReplacer, 2);
        } else {
            errorDetails = String(error);
        }
    }
    return {
        content: [
            {
                type: "text", // Errors are conveyed as text content
                text: message,
                details: errorDetails || undefined,
            },
        ],
        isError: true, // Indicate that this output represents an error
    };
}

/**
 * Creates a standard prepared transaction output for MCP tools.
 * @param txDetails Object containing serializedTransactionBlock and other relevant info.
 * @returns PreparedTransactionOutput object.
 */
export function createPreparedTransactionOutput(
    txDetails: {
        status: "prepared";
        message: string;
        serializedTransactionBlock: string;
        requiredSender: string;
        chain: string;
        network: string;
        additionalInfo?: any; 
        [key: string]: any; 
    }
): PreparedTransactionOutput {
    // Generate a unique URI for this prepared transaction resource
    const resourceUri = `urn:tx:prepared:${txDetails.chain}:${txDetails.network}:${Date.now()}`;

    // Encode the serialized transaction block to Base64
    const blobContent = Buffer.from(txDetails.serializedTransactionBlock).toString('base64');

    return {
        content: [
            {
                type: "resource",
                text: txDetails.message, 
                resource: {
                    uri: resourceUri,
                    blob: blobContent, // Use Base64 encoded string
                    mimeType: "application/vnd.sui.prepared-transaction+json",
                    status: txDetails.status,
                    requiredSender: txDetails.requiredSender,
                    chain: txDetails.chain,
                    network: txDetails.network,
                    ...(txDetails.additionalInfo && { additionalInfo: txDetails.additionalInfo })
                },
                details: JSON.stringify({
                    status: txDetails.status,
                    requiredSender: txDetails.requiredSender,
                    chain: txDetails.chain,
                    network: txDetails.network,
                    ...(txDetails.additionalInfo && { additionalInfo: txDetails.additionalInfo })
                }, bigNumberReplacer, 2)
            },
        ],
        isError: false,
    };
} 