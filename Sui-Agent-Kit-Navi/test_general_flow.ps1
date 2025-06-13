# PowerShell Script for General Testing of Navi MCP Server

Write-Host "---------------------------------------------------------------------"
Write-Host "Starting Navi MCP Server - General Test Flow"
Write-Host "Ensure the MCP Server (e.g., npx ts-node src/index.ts or node dist/index.js) is RUNNING in another terminal."
Write-Host "Ensure your agent wallet has SUI for gas and for deposit/collateral tests."
Write-Host "Adjust asset symbols (e.g., USDC_SYMBOL) if your mappers.ts uses different keys for common assets."
Write-Host "---------------------------------------------------------------------"
Start-Sleep -Seconds 3

$McpInspectorBaseCommand = "npx @modelcontextprotocol/inspector --cli ts-node src/index.ts" # Adjust if you run compiled JS directly

# --- Configuration Variables ---
$SuiSymbol = "SUI"
$UsdcSymbol = "USDC"
$UsdtSymbol = "USDT"
$VSuiSymbol = "vSui"

$SuiDepositAmount = 0.05
$SuiBorrowAmount = 0.01
$SuiRepayAmount = 0.01
$SuiWithdrawAmount = 0.02

$SwapFromAsset = $SuiSymbol
$SwapToAssetUsdt = $UsdtSymbol
$SwapAmountInNumeric = 0.01
$MinAmountOutSwapUsdt = 0.009

$StakeSuiAmount = 1
$UnstakeVSuiAmount = 1

$ActionDelay = 5
$ShortDelay = 3
# =====================================================================
# SECTION 1: Basic Server & Agent Info
# =====================================================================
Write-Host "`n========== SECTION 1: Basic Server & Agent Info =========="

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 1.1: Pinging the server"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name mcp_navi-mcp-agent_ping --tool-arg random_string=test"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 1.2: Checking Initial Agent Portfolio"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 1.3: Checking Initial Agent Health Factor"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentHealthFactor"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 1.4: Getting Available Rewards (likely none initially)"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentAvailableRewards"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 1.5: Getting Agent Rewards History (likely empty initially)"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentRewardsHistory --tool-arg page=1 --tool-arg size=10"
Start-Sleep -Seconds $ShortDelay

# =====================================================================
# SECTION 2: Pool & Reserve Information
# =====================================================================
Write-Host "`n========== SECTION 2: Pool & Reserve Information =========="

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 2.1: Getting Info for {0} Pool" -f $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getPoolInfoBySymbol --tool-arg assetSymbol=$SuiSymbol"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 2.2: Getting Reserve Detail for {0}" -f $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getReserveDetail --tool-arg assetSymbol=$SuiSymbol"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 2.3: Getting All Pools Info"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAllPoolsInfo"
Start-Sleep -Seconds $ActionDelay # This can be a larger payload

# =====================================================================
# SECTION 3: Core Lending Pool Operations
# =====================================================================
Write-Host "`n========== SECTION 3: Core Lending Pool Operations =========="
Write-Host "`n---------------------------------------------------------------------"
Write-Host "NOTE: USDC borrow/repay tests are replaced with SUI tests due to wUSDC pool hitting its borrow cap on mainnet."
Write-Host "This prevents new wUSDC borrows. We are using SUI for these specific tests instead."
Write-Host "---------------------------------------------------------------------"

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.1: Depositing {0} {1} as Collateral" -f $SuiDepositAmount, $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_depositAsset --tool-arg assetSymbol=$SuiSymbol --tool-arg amount=$SuiDepositAmount"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 3.2: Checking Agent Portfolio after SUI Deposit"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 3.3: Checking Agent Health Factor after SUI Deposit"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentHealthFactor"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.4: Predicting Health Factor if we borrow {0} {1} more" -f $SuiBorrowAmount, $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentDynamicHealthFactor --tool-arg assetSymbol=$SuiSymbol --tool-arg borrowChangeAmount=$SuiBorrowAmount --tool-arg supplyChangeAmount=0 --tool-arg isIncrease=true"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.5: Borrowing {0} {1}" -f $SuiBorrowAmount, $SuiSymbol)
Write-Host "(This assumes sufficient collateral from the SUI deposit)"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_borrowAsset --tool-arg assetSymbol=$SuiSymbol --tool-arg amount=$SuiBorrowAmount --tool-arg updateOracle=true"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.6: Checking Agent Portfolio after Borrowing {0}" -f $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.7: Checking Agent Health Factor after Borrowing {0}" -f $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentHealthFactor"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.8: Repaying {0} {1}" -f $SuiRepayAmount, $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_repayDebt --tool-arg assetSymbol=$SuiSymbol --tool-arg amount=$SuiRepayAmount"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.9: Checking Agent Portfolio after Repaying {0}" -f $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 3.10: Withdrawing {0} {1}" -f $SuiWithdrawAmount, $SuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_withdrawAsset --tool-arg assetSymbol=$SuiSymbol --tool-arg amount=$SuiWithdrawAmount --tool-arg updateOracle=true"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 3.11: Checking Agent Portfolio after SUI Withdraw"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

# =====================================================================
# SECTION 4: Swap Operations (NAVI Aggregator)
# =====================================================================
Write-Host "`n========== SECTION 4: Swap Operations (NAVI Aggregator) =========="
Write-Host "`n---------------------------------------------------------------------"
Write-Host "NOTE: SUI -> USDC swap test is changed to SUI -> USDT due to potential issues with the Cetus DEX route for SUI -> wUSDC on mainnet."
Write-Host "---------------------------------------------------------------------"

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 4.1: Getting Swap Quote ({0} {1} to {2})" -f $SwapAmountInNumeric, $SwapFromAsset, $SwapToAssetUsdt)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getSwapQuote --tool-arg fromAssetSymbol=$SwapFromAsset --tool-arg toAssetSymbol=$SwapToAssetUsdt --tool-arg amountIn=$SwapAmountInNumeric"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 4.2: Executing Swap ({0} {1} to {2}, Min Out: {3})" -f $SwapAmountInNumeric, $SwapFromAsset, $SwapToAssetUsdt, $MinAmountOutSwapUsdt)
Write-Host "(Ensure agent has enough $SwapFromAsset for the swap)"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_executeSwap --tool-arg fromAssetSymbol=$SwapFromAsset --tool-arg toAssetSymbol=$SwapToAssetUsdt --tool-arg amountIn=$SwapAmountInNumeric --tool-arg minAmountOut=$MinAmountOutSwapUsdt"
Start-Sleep -Seconds $ActionDelay

# =====================================================================
# SECTION 5: Staking Operations (SUI to vSUI and vice-versa)
# =====================================================================
Write-Host "`n========== SECTION 5: Staking Operations (SUI to vSUI and vice-versa) =========="

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 5.1: Staking {0} {1} for {2}" -f $StakeSuiAmount, $SuiSymbol, $VSuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_stakeSuiForVSui --tool-arg amount=$StakeSuiAmount"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 5.2: Checking Agent Portfolio after Staking for vSUI"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host ("Step 5.3: Attempting to Unstake {0} {1} (This should fail as min is 1 if amount specified)" -f $UnstakeVSuiAmount, $VSuiSymbol)
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_unstakeVSuiForSui --tool-arg amount=$UnstakeVSuiAmount"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 5.4: Unstaking ALL vSUI (This is the step to monitor for the 'UnusedValueWithoutDrop' error)"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_unstakeVSuiForSui" # No amount, should unstake all
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 5.5: Checking Agent Portfolio after Unstaking vSUI attempts"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

# =====================================================================
# SECTION 6: Rewards
# =====================================================================
Write-Host "`n========== SECTION 6: Rewards =========="

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 6.1: Claiming All Agent Rewards"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_claimAllAgentRewards --tool-arg updateOracle=true"
Start-Sleep -Seconds $ActionDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Step 6.2: Checking Agent Portfolio after Claiming Rewards"
Write-Host "---------------------------------------------------------------------"
Invoke-Expression "$McpInspectorBaseCommand --method tools/call --tool-name navi_getAgentPortfolio"
Start-Sleep -Seconds $ShortDelay

Write-Host "`n---------------------------------------------------------------------"
Write-Host "Navi MCP Server - General Test Flow COMPLETED"
Write-Host "Review the output above for successes and failures."
Write-Host "---------------------------------------------------------------------" 