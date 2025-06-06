# Sui Agent Kit — Automated DeFi, DeFAI on Sui

[![Sui Overflow 2025 Submission - Infrastructure & Tooling Track](https://img.shields.io/badge/Sui_Overflow_2025-Infra_&_Tooling-blue?style=for-the-badge)](https://overflowportal.sui.io/)
<img src="/public/banner.png" />
### [Telegram](https://t.me/oxzepdev)
### [Twitter](https://x.com/0xzepdev)
**The Sui Agent Kit was born from a passion to simplify DeFi development on the Sui blockchain and to empower builders like you for the Sui Overflow 2025 Hackathon!**

We've created a Model Context Protocol (MCP) implementation that standardizes how AI agents interact with Sui DeFi protocols. Our toolkit provides ready-to-use MCP tools that allow any AI agent to perform complex DeFi operations on Sui with just one click. We've integrated Navi, SuiSpring, and Suilend protocols into a unified interface, but our goal is to expand this to all protocols in the Sui ecosystem. This eliminates the need for developers to learn multiple SDKs or write custom integration code for each protocol.

Our mission is to provide the foundational infrastructure that enables developers to rapidly prototype, build, and deploy sophisticated DeFi applications, automation scripts, and AI-powered agents on Sui, with a special focus on leveraging the deep liquidity and features of the Navi/Suilend Protocol.

[![Video](https://img.youtube.com/vi/mPq3Kvj14hU/maxresdefault.jpg)](https://www.youtube.com/watch?v=mPq3Kvj14hU)
## 🤖 What is MCP (Model Context Protocol)?
MCP is the bridge between AI and blockchain. It's a standardized communication protocol that allows AI agents to interact with external systems through simple "tool calls" - no complex coding required.
In simple terms: Instead of AI agents needing to learn dozens of different APIs and SDKs, MCP provides one universal language. For DeFi, this means an AI can say "deposit 100 USDC" and MCP handles all the blockchain complexity behind the scenes.

## 🏗️ What is the Sui Agent Kit Ecosystem?

The Sui Agent Kit Ecosystem consists of **two specialized Node.js server applications** built with TypeScript. Each acts as a bridge, translating simple MCP tool calls into direct interactions with specific DeFi protocols on the Sui network.

### 🌊 Choose Your Protocol Suite

<table>
<tr>
<td width="50%" align="center">

### **Navi Protocol Kit**
**🔗 [Repository Link](https://github.com/0xzepdev/Sui-AI-Agent-Kit-Navi)**

**Specialized for:**
- Navi Protocol lending & borrowing
- NAVI Aggregator swaps
- VoloSui (vSUI) liquid staking
- Advanced yield strategies

**Perfect for:** Yield farmers, arbitrage bots, portfolio managers

</td>
<td width="50%" align="center">

### **SuiLend + SuiSpring Kit**
**🔗 [Repository Link](https://github.com/0xzepdev/Sui-AI-Agent-Kit-SuiLend-SuiSpring)**

**Specialized for:**
- SuiLend lending markets
- SuiSpring liquid staking (LSTs)
- Core Sui operations
- Multi-protocol strategies

**Perfect for:** Comprehensive DeFi agents, LST optimizers, wallet automation

</td>
</tr>
</table>

## Unified Use Cases Across the Ecosystem

*   ** Automated Portfolio Rebalancer:** Cross-protocol agents that monitor health factors and automatically manage positions across Navi and SuiLend
*   ** Multi-Protocol Yield Farming:** Agents that identify the highest yields across Navi, SuiLend, and various LST providers, automatically moving funds
*   ** Unified DeFi Dashboard:** Web interfaces that aggregate data from both kits to provide comprehensive portfolio views
*   ** AI-Powered Financial Advisors:** Advanced agents that analyze opportunities across the entire Sui DeFi ecosystem
*   ** Cross-Protocol Arbitrage:** Sophisticated bots that exploit price differences between Navi and SuiLend markets

## Navi Protocol Kit - Deep Dive

### Core Architecture
```
navi-mcp-server/
├── src/
│   ├── mcp_server/
│   │   ├── server.ts           # MCP server implementation
│   │   └── mappers.ts          # Asset symbol/amount conversions
│   ├── core_navi/
│   │   └── navi_client.ts      # Navi SDK integration
│   ├── config.ts               # Environment configuration
│   └── index.ts                # Entry point
├── dist/                       # Compiled JavaScript
├── .env                        # Environment variables
└── package.json
```

### Key Features & Capabilities

**Portfolio Management:**
- `navi_getAgentPortfolio`: Retrieve current supply and borrow balances
- `navi_getAgentHealthFactor`: Check the agent's health factor
- `navi_getAgentDynamicHealthFactor`: Predict health factor after hypothetical changes

**Lending Pool Interactions:**
- `navi_depositAsset`: Deposit SUI, USDC, USDT, etc., as collateral
- `navi_withdrawAsset`: Withdraw deposited assets
- `navi_borrowAsset`: Borrow assets against collateral
- `navi_repayDebt`: Repay borrowed amounts

**Token Swaps (via NAVI Aggregator):**
- `navi_getSwapQuote`: Get quotes for asset swaps
- `navi_executeSwap`: Execute token swaps

**Liquid Staking (vSUI):**
- `navi_stakeSuiForVSui`: Stake SUI to receive vSUI (VoloSui)
- `navi_unstakeVSuiForSui`: Unstake vSUI to receive SUI back

**Rewards Management:**
- `navi_getAgentAvailableRewards`: Check for unclaimed rewards
- `navi_claimAllAgentRewards`: Claim all available rewards
- `navi_getAgentRewardsHistory`: View history of claimed rewards

**Market Data:**
- `navi_getPoolInfoBySymbol`: Get details for specific asset pools
- `navi_getAllPoolsInfo`: Get details for all available asset pools
- `navi_getReserveDetail`: Get in-depth reserve information

### Prerequisites & Setup

1. **Node.js and npm:** Recent version required
2. **Sui Wallet:** Mnemonic or private key with SUI for gas fees
3. **Clone Repository:**
   ```bash
   git clone https://github.com/0xzepdev/Sui-Agent-Kit-Navi/
   cd Sui-Agent-Kit-Navi/navi-mcp-server
   ```

4. **Configure Environment:**
   ```env
   # .env file
   SUI_RPC_URL=https://fullnode.mainnet.sui.io:443
   NAVI_AGENT_MNEMONIC="your twelve or twenty-four word mnemonic phrase here"
   # OR
   NAVI_AGENT_PRIVATE_KEY="your_base64_encoded_private_key_bytes_here"
   ```

5. **Build & Run:**
   ```bash
   npm install
   npm run build
   node dist/index.js
   ```

## SuiLend + SuiSpring Kit - Deep Dive

### Core Architecture
```
sui-agent-kit-suispring-suilend/
├── src/
│   ├── mcp/
│   │   ├── server.ts                    # MCP server orchestration
│   │   ├── internalSdkClientManager.ts  # SDK client management
│   │   ├── zodSchemas/                  # Input validation schemas
│   │   └── toolHandlers/                # Protocol-specific handlers
│   ├── protocols/
│   │   ├── suilend/                     # SuiLend integration
│   │   ├── suispring/                   # SuiSpring integration
│   │   └── mystensui/                   # Core Sui operations
│   ├── common/                          # Shared utilities
│   └── main.ts                          # Entry point
├── dist/                                # Compiled JavaScript
├── .env                                 # Environment variables
└── package.json
```

### 🔥 Key Features & Capabilities

**MystenSui (Core Sui Functionality):**
- `mystenSui_getSuiBalance`: Fetch SUI balance for the agent wallet
- `mystenSui_getTokenMetadata`: Retrieve detailed token metadata
- `mystenSui_getUserTokenBalance`: Get specific token balances
- `mystenSui_transferSui`: Execute SUI transfers
- `mystenSui_transferSuiToMany`: Batch SUI transfers
- `mystenSui_transferFungTokensToMany`: Batch token transfers
- `mystenSui_getUserRecentTxs`: Fetch recent transaction history

**SuiSpring (Liquid Staking):**
- `springSui_discoverLstPools`: Discover available LST pools
- `springSui_getLstSuiExchangeRate`: Get LST to SUI exchange rates
- `springSui_getUserLstDetails`: Fetch user LST position details
- `springSui_getSpringSuiPoolApys`: Get APYs for LST pools
- `springSui_stakeSuiForSpringSuiLst`: Stake SUI for generic LSTs
- `springSui_stakeSuiForParaSui`: Specifically stake for ParaSUI
- `springSui_redeemSpringSuiLstForSui`: Redeem LSTs back to SUI

**Suilend (Lending & Borrowing):**
- `suilend_getSuilendMarketAssets`: List supported assets and metrics
- `suilend_ensureSuilendObligation`: Create/check loan accounts
- `suilend_getUserObligationInfo`: Get obligation IDs for operations
- `suilend_depositToSuilend`: Deposit assets as collateral
- `suilend_getObligationDetails`: Comprehensive obligation reports
- `suilend_withdrawFromSuilend`: Withdraw collateral
- `suilend_borrowFromSuilend`: Borrow against collateral
- `suilend_repayToSuilend`: Repay borrowed assets
- `suilend_getObligationHistory`: Fetch transaction history

**Common Utilities:**
- `common_formatTokenAmount`: Convert raw amounts to readable strings
- `common_parseTokenAmount`: Convert readable strings to raw amounts
- `common_shortenAddress`: Shorten addresses for display
- `common_getCoinTypeBySymbol`: Get coin types from symbols

### Prerequisites & Setup

1. **Node.js:** Version 18.x or later recommended
2. **Sui Wallet:** Private key in Bech32 format (starting with `suiprivkey1...`)
3. **Clone Repository:**
   ```bash
   git clone https://github.com/0xzepdev/Sui-AI- Agent-Kit-SuiLend-SuiSpring
   cd Sui-Agent-Kit-SuiLend-SuiSpring
   ```

4. **Configure Environment:**
   ```env
   # .env file
   SUI_MAINNET_PRIVATE_KEY="suiprivkey1yourlongprivatekeystringgoeshere..."
   # Optional: SUI_RPC_URL="https://fullnode.mainnet.sui.io:443"
   ```

5. **Build & Run:**
   ```bash
   npm install
   npm run build
   npm start
   # OR for development: npm run dev
   ```

## 🔧 MCP Client Configuration

Both kits use the Model Context Protocol (MCP) for communication. Configure your MCP client with an `mcp.json` file:

### For Navi Protocol Kit:
```json
{
  "mcpServers": {
    "navi-mcp-agent": {
      "command": "node",
      "args": [
        "YOUR_ABSOLUTE_PATH_TO/Sui-Agent-Kit-Navi/navi-mcp-server/dist/index.js"
      ],
      "cwd": "YOUR_ABSOLUTE_PATH_TO/Sui-Agent-Kit-Navi/navi-mcp-server",
      "env": {
        "SUI_RPC_URL": "https://fullnode.mainnet.sui.io:443",
        "NAVI_AGENT_MNEMONIC": "your optional mnemonic override"
      }
    }
  }
}
```

### For SuiLend + SuiSpring Kit:
```json
{
  "mcpServers": {
    "sui-agent-kit": {
      "command": "node",
      "args": [
        "YOUR_ABSOLUTE_PATH_TO/sui-agent-kit-suispring-suilend/dist/main.js"
      ],
      "cwd": "YOUR_ABSOLUTE_PATH_TO/sui-agent-kit-suispring-suilend",
      "env": {
        "SUI_MAINNET_PRIVATE_KEY": "suiprivkey1..."
      }
    }
  }
}
```

## 🧪 Testing & Interaction Examples

Use the MCP Inspector CLI to test your setup:

### Navi Protocol Kit Examples:
```bash
# Check portfolio
npx @modelcontextprotocol/inspector --cli ts-node src/index.ts --method tools/call --tool-name navi_getAgentPortfolio

# Deposit 0.1 SUI
npx @modelcontextprotocol/inspector --cli ts-node src/index.ts --method tools/call --tool-name navi_depositAsset --tool-arg assetSymbol=SUI --tool-arg amount=0.1

# Get swap quote
npx @modelcontextprotocol/inspector --cli ts-node src/index.ts --method tools/call --tool-name navi_getSwapQuote --tool-arg fromAssetSymbol=SUI --tool-arg toAssetSymbol=USDC --tool-arg amountIn=1.0
```

### SuiLend + SuiSpring Kit Examples:
```bash
# Get SUI balance
mcp-inspector --server sui-agent-kit --method tools/call --tool-name mystenSui_getSuiBalance --tool-arg network=mainnet

# Stake SUI for ParaSUI
mcp-inspector --server sui-agent-kit --method tools/call --tool-name springSui_stakeSuiForParaSui --tool-arg amountSuiToStake=0.05 --tool-arg network=mainnet

# Get Suilend market info
mcp-inspector --server sui-agent-kit --method tools/call --tool-name suilend_getSuilendMarketAssets --tool-arg network=mainnet
```

## 👥 Meet the Team

---

## Project Status & Roadmap

### **Current Status (Sui Overflow 2025 MVP)**

**Navi Protocol Kit:**
- Complete MCP server implementation
- Full Navi SDK integration
- All core lending/borrowing operations
- NAVI Aggregator swap functionality
- VoloSui liquid staking
- Comprehensive portfolio management
- Rewards system integration

**SuiLend + SuiSpring Kit:**
- Robust MCP server with Zod validation
- Complete SuiLend integration
- Full SuiSpring LST support
- Core Sui operations
- Advanced SDK client management
- Comprehensive testing framework
- Steamm DEX integration (planned but disabled for MVP)

### -**Future Roadmap**

**Immediate Post-Hackathon:**
- **Cross-Kit Integration**: Enable agents to operate across both protocols simultaneously
- **Steamm DEX Integration**: Complete robust DEX functionality in the SuiLend kit
- **Enhanced Testing**: Comprehensive unit and integration test coverage
- **Documentation Expansion**: In-depth guides and tutorials

**Long-term Vision:**
- **AI Agent Showcases**: Pre-built intelligent agents demonstrating advanced strategies
- **Enterprise Security**: Multi-sig and permission-based execution frameworks
- **Real-time Events**: On-chain event streaming for reactive decision-making
- **Community Ecosystem**: Plugin architecture for community-contributed protocol integrations
- **Strategy Marketplace**: Sharable and monetizable DeFi strategies


1. **Choose Your Kit**: Pick the Navi kit or SuiLend+SuiSpring kit based on your interests
2. **Fork the Repository**: Create your own fork of the relevant repository
3. **Create Feature Branches**: Work on focused improvements
4. **Submit Pull Requests**: Detailed PRs with clear descriptions
5. **Join the Discussion**: Engage with the community through issues and discussions

## License

Both kits in the Sui Agent Kit Ecosystem are released under the MIT License, encouraging open collaboration and innovation in the Sui DeFi space.

