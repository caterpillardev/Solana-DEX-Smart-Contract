// Contents of src/protocols/springsui/springsui.config.ts
// Values discovered from node_modules/@suilend/springsui-sdk/client.js and client.d.ts

// This is the validator address Suilend delegates to for its LSTs (e.g., afSUI)
export const SUILEND_VALIDATOR_ADDRESS = "0xce8e537664ba5d1d5a6a857b17bd142097138706281882be6805e17065ecde89";

// The UpgradeCap ID used to fetch the latest package ID for the SpringSui protocol
export const SPRING_SUI_UPGRADE_CAP_ID = "0x4dc657b6c0fe896f4b94fee1ceac96312dde0a36b94e799caaec30deb53dcd67";

// The mainnet registry ID for SpringSui LSTs
export const SPRING_SUI_MAINNET_REGISTRY_ID = "0x577c5a3b474403aec4629a56bab97b95715d3e87867517650651014cbef23e18";

// Add ParaSui Mainnet Coin Type
export const PARA_SUI_MAINNET_COIN_TYPE = "0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI";

/**
 * Represents the core information needed to interact with a specific Liquid Staking Token (LST).
 * This would be typically fetched dynamically using functions like `fetchRegistryLiquidStakingInfoMap`
 * from the SDK, but we might hardcode a primary one for MVP for simplicity if known.
 */
export interface LiquidStakingTokenConfig {
  coinType: string; // e.g., "...::afsui::AFSUI"
  objectInfo: {
    id: string; // The LiquidStakingInfo object ID for this LST (Market ID)
    type: string; // The full struct type of the LiquidStakingInfo object for this LST
    weightHookId: string; // The ID of the associated WeightHook object
  };
  // Add other relevant static details if any, like a human-readable name
  name: string; 
}

// Placeholder for a primary LST, e.g., afSUI. 
// The actual values for id, type, weightHookId would be obtained by calling 
// fetchRegistryLiquidStakingInfoMap and selecting the entry for afSUI.
// For an MVP, if these are stable and known for mainnet, they could be hardcoded.
// For now, leaving it as a structure to be populated dynamically or later configured.
export const AFSUI_LST_CONFIG_PLACEHOLDER: LiquidStakingTokenConfig = {
  name: "afSUI",
  coinType: "0x2::token::TOKEN<0xc254924a1e4a70789935a783781678023580f0a83f194d3ac9068c5b6283c9d0::afsui::AFSUI>", // Example, needs verification
  objectInfo: {
    id: "", // To be filled from SDK discovery for afSUI
    type: "", // To be filled, e.g. PACKAGE_ID::liquid_staking::LiquidStakingInfo<COIN_TYPE>
    weightHookId: "", // To be filled
  }
}; 