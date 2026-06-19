/**
 * Anchor IDL for the WaffleFinance Solana HTLC program.
 *
 * This IDL describes the on-chain account layout and the three mutating
 * instructions exposed by the program:
 *
 *   create_order  — lock tokens and create an HTLCOrder PDA
 *   claim_order   — reveal the preimage and transfer tokens to beneficiary
 *   refund_order  — return tokens to sender after the timelock expires
 *
 * Account layout
 * ───────────────
 * Each order is stored in a PDA derived from [b"order", hashlock_bytes].
 * This makes the PDA deterministic from the hashlock alone, which lets the
 * coordinator and SDK compute the orderId (= PDA address) without a
 * network call.
 *
 * Versioning
 * ──────────
 * The `version` field in the IDL is a monotonically incrementing u8 stored
 * in the account discriminator padding. The SDK reads it and rejects
 * accounts whose version is newer than IDL_VERSION to fail loudly rather
 * than silently misparse fields.
 *
 * To upgrade: bump IDL_VERSION, extend `HtlcOrderFields`, and update
 * `deserialiseOrderAccount`. Old accounts are never mutated on-chain so
 * the deserialiser can continue to support v0 layouts by branching on the
 * `version` byte.
 */

// ── Discriminator ──────────────────────────────────────────────────────────
//
// Anchor prepends an 8-byte SHA-256 discriminator to every account.
// Precomputed as: sha256("account:HtlcOrder")[0..8]
// You can regenerate it with: anchor idl parse …
export const HTLC_ORDER_DISCRIMINATOR = Buffer.from([
  0x17, 0x4c, 0x3d, 0x91, 0x5f, 0xa8, 0x2b, 0xe1
]);

/** Bump this when the account layout changes. */
export const IDL_VERSION = 0;

// ── On-chain account layout ────────────────────────────────────────────────
//
// Byte offsets after the 8-byte discriminator:
//
// Offset  Size  Type        Field
// ──────  ────  ──────────  ───────────────────────────────────
//      0     1  u8          version
//      1    32  Pubkey      sender
//     33    32  Pubkey      beneficiary
//     65    32  Pubkey      refund_address
//     97    32  Pubkey      mint
//    129     8  u64         amount  (little-endian)
//    137     8  u64         safety_deposit  (little-endian)
//    145    32  [u8;32]     hashlock
//    177     8  i64         timelock  (Unix seconds, little-endian)
//    185     1  u8          status   (0=Active 1=Claimed 2=Refunded)
//    186    33  Option<[u8;32]>  preimage  (1-byte Some/None tag + 32 bytes)
//
// Total: 8 (discriminator) + 219 (fields) = 227 bytes

export const HTLC_ORDER_ACCOUNT_SIZE = 227;

// ── Status enum ────────────────────────────────────────────────────────────

export const OrderStatus = {
  Active: 0,
  Claimed: 1,
  Refunded: 2,
} as const;
export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus];

// ── Field offsets (relative to account data, after the 8-byte discriminator) ─

export const FIELD_OFFSET = {
  version: 0,
  sender: 1,
  beneficiary: 33,
  refundAddress: 65,
  mint: 97,
  amount: 129,
  safetyDeposit: 137,
  hashlock: 145,
  timelock: 177,
  status: 185,
  preimage: 186,  // 1-byte tag + 32-byte value
} as const;

// ── Instruction discriminators ─────────────────────────────────────────────
//
// Anchor instruction discriminators are sha256("global:<method_name>")[0..8].
// Precomputed values below; regenerate with: anchor idl parse …

/** sha256("global:create_order")[0..8] */
export const IX_CREATE_ORDER = Buffer.from([
  0x9f, 0x04, 0x18, 0xd1, 0x6a, 0x7e, 0x59, 0x3c
]);

/** sha256("global:claim_order")[0..8] */
export const IX_CLAIM_ORDER = Buffer.from([
  0x3c, 0xa0, 0x5f, 0xd2, 0x11, 0x8b, 0x4a, 0xef
]);

/** sha256("global:refund_order")[0..8] */
export const IX_REFUND_ORDER = Buffer.from([
  0x5e, 0x2d, 0x87, 0x3f, 0x44, 0xc1, 0x7b, 0x22
]);

// ── PDA seed constants ─────────────────────────────────────────────────────

/** Seed prefix for HTLCOrder PDAs: [b"order", hashlock_bytes]. */
export const ORDER_SEED = Buffer.from("order");
