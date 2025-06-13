// Contents of src/protocols/steamm/steamm.config.ts
// Values discovered from node_modules/@suilend/steamm-sdk/config/mainnet.js

// Define types for the Steamm SDKOptions structure based on mainnet.js
// These are simplified; the actual SDK might have more detailed or nested types.
// For the purpose of this config, we are capturing the structure as seen in mainnet.js.

export interface SteammSubConfig { 
  package_id: string;
  published_at: string;
  config?: { // Optional as steamm_script_config doesn't have a nested config
    registryId?: string;       // For STEAMM_CONFIG
    globalAdmin?: string;      // For STEAMM_CONFIG
    quoterSourcePkgs?: Record<string, string>; // For STEAMM_CONFIG
    lendingMarketId?: string;  // For SUILEND_CONFIG
    lendingMarketType?: string;// For SUILEND_CONFIG
    oracleRegistryId?: string; // For ORACLE_CONFIG
  };
}

export interface SteammSdkOptionsConfig {
  fullRpcUrl: string;
  suilend_config: SteammSubConfig;
  steamm_config: SteammSubConfig;
  steamm_script_config: SteammSubConfig;
  oracle_config: SteammSubConfig;
  senderAddress?: string;
}

// Mainnet Configuration from @suilend/steamm-sdk/config/mainnet.js
export const STEAMM_MAINNET_CONFIG: SteammSdkOptionsConfig = {
  fullRpcUrl: "https://fullnode.mainnet.sui.io:443",
  suilend_config: {
    package_id: "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf",
    published_at: "0x21f544aff826a48e6bd5364498454d8487c4a90f84995604cd5c947c06b596c3",
    config: {
      lendingMarketId: "0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1",
      lendingMarketType: "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL",
    },
  },
  steamm_config: {
    package_id: "0x4fb1cf45dffd6230305f1d269dd1816678cc8e3ba0b747a813a556921219f261",
    published_at: "0x90e18bdfa7206d5d19df0eed869203812b608e50d07e3a49b9e9044fdedac443",
    config: {
      registryId: "0x8584948e8c0a2809ec192ede7e030b0a32bd602e5ca6c91bde8dc35fb8b0068d",
      globalAdmin: "0xdd3d22dba6c38117615a51698136e9867191328a8ef1b065c342d0a887b9be4a",
      quoterSourcePkgs: {
        cpmm: "0x4fb1cf45dffd6230305f1d269dd1816678cc8e3ba0b747a813a556921219f261",
        omm: "0x67e4835cbe51818ce79af790f25ee7d8dfb03fc1556094ca5531cc399c687444",
        omm_v2: "0x90e18bdfa7206d5d19df0eed869203812b608e50d07e3a49b9e9044fdedac443",
      },
    },
  },
  steamm_script_config: {
    package_id: "0x13bfc09cfc1bd922d3aa53fcf7b2cd510727ee65068ce136e2ebd5f3b213fdd2",
    published_at: "0xe861377e806547370a7d219cb0f0eb7fa1d497607f2722352a47ed825b2a1db4",
    // No nested config for steamm_script_config in mainnet.js
  },
  oracle_config: {
    package_id: "0xe84b649199654d18c38e727212f5d8dacfc3cf78d60d0a7fc85fd589f280eb2b",
    published_at: "0xe84b649199654d18c38e727212f5d8dacfc3cf78d60d0a7fc85fd589f280eb2b",
    config: {
      oracleRegistryId: "0x919bba48fddc65e9885433e36ec24278cc80b56bf865f46e9352fa2852d701bc",
    },
  },
};

// Optionally, export BETA_CONFIG if needed, by reading and transcribing from beta.js
// export const STEAMM_BETA_CONFIG: SteammSdkOptionsConfig = { ... }; 