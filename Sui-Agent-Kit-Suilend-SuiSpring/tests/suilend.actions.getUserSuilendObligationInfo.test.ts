import { SuiClient } from '@mysten/sui/client';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import dotenv from 'dotenv';

import { getDefaultSuilendClient } from '../src/protocols/suilend/suilend.client';
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { getUserSuilendObligationInfo } from '../src/protocols/suilend/suilend.actions';
import { UserSuilendObligationIdentifiers } from '../src/protocols/suilend/suilend.types';

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

// --- Test Configuration ---
const USER_ADDRESS_WITHOUT_OBLIGATION = "0x0d4d35e99909bb5a976968621b1face17f0670973a5ab4ab281cbdc0ba47e044";
let USER_ADDRESS_FROM_KEYPAIR: string | undefined;

// Chave privada para obter um endereço que PODE ter uma obrigação
const privateKeyBase64 = process.env.SUI_MAINNET_PRIVATE_KEY;

describe('getUserSuilendObligationInfo tests (mainnet)', () => {
    let suiClient: SuiClient;
    let suilendSDKClient: SuilendSDKClient;
    let keypair: Ed25519Keypair | undefined;

    beforeAll(async () => {
        console.log("--- Initializing Test Setup for getUserSuilendObligationInfo (mainnet) ---");
        try {
            suiClient = getSuiClient('mainnet');
            suilendSDKClient = await getDefaultSuilendClient('mainnet');
            if (!suilendSDKClient || !suilendSDKClient.lendingMarket) {
                throw new Error("SuilendSDKClient or lendingMarket could not be initialized for mainnet.");
            }
            console.log(`SuilendSDKClient initialized for market: ${suilendSDKClient.lendingMarket.id}`);

            if (privateKeyBase64) {
                try {
                    const { schema, secretKey } = decodeSuiPrivateKey(privateKeyBase64);
                    if (schema !== 'ED25519') {
                        console.warn('Private key schema is not ED25519, cannot derive address for obligation test.');
                    } else {
                        keypair = Ed25519Keypair.fromSecretKey(secretKey);
                        USER_ADDRESS_FROM_KEYPAIR = keypair.getPublicKey().toSuiAddress();
                        console.log(`Derived address from SUI_MAINNET_PRIVATE_KEY for testing: ${USER_ADDRESS_FROM_KEYPAIR}`);
                    }
                } catch (error: any) {
                    console.warn(`Could not decode SUI_MAINNET_PRIVATE_KEY: ${error.message}. Test for address with obligation might be skipped or use a hardcoded placeholder if available.`);
                }
            } else {
                console.warn("SUI_MAINNET_PRIVATE_KEY not found in .env. Test for address with obligation will likely be skipped unless a hardcoded placeholder is valid.");
            }

        } catch (error) {
            console.error("Failed to initialize Suilend clients for test:", error);
            throw error;
        }
    });

    test('should return null for a user address without an obligation', async () => {
        console.log(`Testing with address (no obligation): ${USER_ADDRESS_WITHOUT_OBLIGATION}`);
        const result = await getUserSuilendObligationInfo(suiClient, suilendSDKClient, USER_ADDRESS_WITHOUT_OBLIGATION);
        expect(result).toBeNull();
    }, 30000);

    test('should return obligationId and ownerCapId for the keypair address if it has an obligation', async () => {
        if (!USER_ADDRESS_FROM_KEYPAIR) {
            console.warn("Skipping test: USER_ADDRESS_FROM_KEYPAIR could not be derived (SUI_MAINNET_PRIVATE_KEY issue or not ED25519).");
            expect(true).toBe(true); // Placeholder
            return;
        }
        
        console.log(`Testing with derived address (potentially with obligation): ${USER_ADDRESS_FROM_KEYPAIR}`);
        const result = await getUserSuilendObligationInfo(suiClient, suilendSDKClient, USER_ADDRESS_FROM_KEYPAIR);
        
        // Este teste AGORA ESPERA que a conta da SUI_MAINNET_PRIVATE_KEY TENHA uma obrigação.
        // Se não tiver, este teste falhará, o que é o comportamento esperado se a premissa não for atendida.
        if (result === null) {
            console.warn(`Account ${USER_ADDRESS_FROM_KEYPAIR} (from SUI_MAINNET_PRIVATE_KEY) does NOT have an active Suilend obligation on mainnet market ${suilendSDKClient.lendingMarket.id}. Test will fail as expected if an obligation was presupposed.`);
        }

        expect(result).not.toBeNull();
        expect(result).toHaveProperty('obligationId');
        expect(result).toHaveProperty('ownerCapId');
        expect(typeof result?.obligationId).toBe('string');
        expect(result?.obligationId).not.toBe('');
        expect(typeof result?.ownerCapId).toBe('string');
        expect(result?.ownerCapId).not.toBe('');
        
        console.log("Received Obligation Info for derived address:", result);
    }, 30000);
}); 