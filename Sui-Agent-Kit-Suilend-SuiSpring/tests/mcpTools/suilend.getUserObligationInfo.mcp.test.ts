import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpTransport } from '@modelcontextprotocol/sdk/client/mcp.js';
import { registerMcpTools } from '../../src/mcp/server'; // Adjust path as needed
import { InternalSdkClientManager } from '../../src/mcp/internalSdkClientManager'; // Adjust path as needed
import { getUserObligationInfoSchema } from '../../src/mcp/zodSchemas/suilendSchemas'; // Adjust path as needed
import { SUI_MAINNET_VALIDATOR_ADDRESS, USER_ADDRESS_WITH_SUI_OBJECTS, USER_ADDRESS_WITHOUT_SUI_OBJECTS } from '../test.config';

describe('MCP Tool: suilend.getUserObligationInfo', () => {
    let server: McpServer;
    let transport: McpTransport;
    let clientManager: InternalSdkClientManager;

    beforeAll(async () => {
        server = new McpServer({
            name: 'TestDeFiGateway',
            version: '1.0.0',
            description: 'Test MCP Server for Suilend tools',
            tools: [],
        });

        clientManager = new InternalSdkClientManager();
        registerMcpTools(server, clientManager); // Register all tools

        // Mock transport for direct in-memory communication
        transport = {
            sendRequest: async (request) => {
                return server.processRequest(request);
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            setResponseHandler: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            close: () => {},
        };
    });

    it('should return obligationId and ownerCapId for a user with an existing obligation on mainnet', async () => {
        const userWithObligation = USER_ADDRESS_WITH_SUI_OBJECTS; // Assuming this user has a Suilend obligation

        const response = await transport.sendRequest({
            mcp_version: '1.0',
            tool_name: 'suilend.getUserObligationInfo',
            tool_inputs: {
                userAddress: userWithObligation,
                network: 'mainnet',
                // marketId is optional, defaults to main market
            },
        });

        expect(response.error).toBeUndefined();
        expect(response.tool_outputs).toBeDefined();
        expect(response.tool_outputs?.content[0].type).toBe('text');
        const result = JSON.parse(response.tool_outputs?.content[0].text || '{}');

        console.log('[Test Output - User with Obligation]:', JSON.stringify(result, null, 2));

        expect(result).toHaveProperty('obligationId');
        expect(result).toHaveProperty('ownerCapId');
        expect(result.obligationId).toMatch(/^0x[a-f0-9]{64}$/); // Basic format check
        expect(result.ownerCapId).toMatch(/^0x[a-f0-9]{64}$/); // Basic format check
    }, 30000); // Increased timeout for network calls

    it('should return null for obligationId and ownerCapId for a user without an obligation on mainnet', async () => {
        const userWithoutObligation = USER_ADDRESS_WITHOUT_SUI_OBJECTS; // A known address without a Suilend obligation

        const response = await transport.sendRequest({
            mcp_version: '1.0',
            tool_name: 'suilend.getUserObligationInfo',
            tool_inputs: {
                userAddress: userWithoutObligation,
                network: 'mainnet',
            },
        });

        expect(response.error).toBeUndefined();
        expect(response.tool_outputs).toBeDefined();
        const result = JSON.parse(response.tool_outputs?.content[0].text || '{}');

        console.log('[Test Output - User without Obligation]:', JSON.stringify(result, null, 2));

        expect(result.obligationId).toBeNull();
        expect(result.ownerCapId).toBeNull();
    }, 30000);

    // Add more tests: e.g., different networks if supported and make sense, specific market IDs if relevant
}); 