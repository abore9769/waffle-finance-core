import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
import { resolveEthereumRpcUrl } from "./ethereum-rpc-url.js";

dotenvConfig({ path: resolve(process.cwd(), ".env") });

const networkSchema = z.enum(["testnet", "mainnet"]);
export type Network = z.infer<typeof networkSchema>;

const configSchema = z.object({
  network: networkSchema.default("testnet"),
  port: z.coerce.number().int().positive().default(3001),
  databaseUrl: z.string().default("file:./wafflefinance.db"),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  corsOrigin: z.string().default("*"),
  pollIntervalMs: z.coerce.number().int().positive().default(15_000),
  /**
   * Optional 32-byte key used to encrypt preimages at rest with AES-256-GCM.
   * Accepted formats: 64-character hex string, or 44-character base64 string.
   *
   * When set, the coordinator encrypts every new preimage before persisting
   * it and decrypts on retrieval.  Existing plaintext rows are decrypted
   * transparently without re-encryption (see SecretService for details).
   *
   * When absent, preimages are stored as raw hex strings (legacy behaviour).
   *
   * Set via environment variable:  SECRET_STORAGE_KEY=<64-hex-chars>
   *
   * Key management:
   *   - Generate with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   *   - Store in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).
   *   - Back up alongside your database backup — lost key = unrecoverable preimages.
   *   - For key rotation: update the env var and run the re-encryption migration.
   */
  secretStorageKey: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  ethereum: z.object({
    rpcUrl: z.string().url(),
    chainId: z.number().int(),
    htlcEscrow: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? (v as `0x${string}`) : null)),
    resolverRegistry: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? (v as `0x${string}`) : null))
  }),
  soroban: z.object({
    rpcUrl: z.string().url(),
    horizonUrl: z.string().url(),
    networkPassphrase: z.string(),
    htlcContract: z.string().optional().transform((v) => v ?? null),
    resolverRegistry: z.string().optional().transform((v) => v ?? null)
  }),
  solana: z.object({
    rpcUrl: z.string().url(),
    programId: z.string().optional().transform((v) => v ?? "PLACEHOLDER"),
    commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed")
  })
});

export type CoordinatorConfig = z.infer<typeof configSchema>;

export function loadConfig(): CoordinatorConfig {
  const network = (process.env.NETWORK_MODE ?? "testnet") as Network;
  const isMainnet = network === "mainnet";

  const raw = {
    network,
    port: process.env.COORDINATOR_PORT ?? process.env.RELAYER_PORT ?? "3001",
    databaseUrl: process.env.DATABASE_URL ?? "file:./wafflefinance.db",
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    pollIntervalMs: process.env.COORDINATOR_POLL_INTERVAL_MS ?? "15000",
    secretStorageKey: process.env.SECRET_STORAGE_KEY,
    ethereum: {
      rpcUrl: resolveEthereumRpcUrl(isMainnet ? "mainnet" : "testnet"),
      chainId: isMainnet ? 1 : 11_155_111,
      htlcEscrow: process.env[isMainnet ? "ETH_HTLC_ESCROW_MAINNET" : "ETH_HTLC_ESCROW_TESTNET"] ?? "",
      resolverRegistry:
        process.env[isMainnet ? "ETH_RESOLVER_REGISTRY_MAINNET" : "ETH_RESOLVER_REGISTRY_TESTNET"] ?? ""
    },
    soroban: {
      rpcUrl: process.env.SOROBAN_RPC_URL ?? (isMainnet ? "https://mainnet.sorobanrpc.com" : "https://soroban-testnet.stellar.org"),
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? (isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"),
      networkPassphrase: isMainnet
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015",
      htlcContract: process.env[isMainnet ? "SOROBAN_HTLC_MAINNET" : "SOROBAN_HTLC_TESTNET"],
      resolverRegistry:
        process.env[isMainnet ? "SOROBAN_RESOLVER_REGISTRY_MAINNET" : "SOROBAN_RESOLVER_REGISTRY_TESTNET"]
    },
    solana: {
      rpcUrl: process.env.SOLANA_RPC_URL ?? (isMainnet ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com"),
      programId: process.env[isMainnet ? "SOLANA_HTLC_PROGRAM_MAINNET" : "SOLANA_HTLC_PROGRAM_TESTNET"] ?? "PLACEHOLDER",
      commitment: (process.env.SOLANA_COMMITMENT as "processed" | "confirmed" | "finalized") ?? "confirmed"
    }
  };

  return configSchema.parse(raw);
}
