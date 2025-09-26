// uniqid-sdk/uniqid-sdk.server.js
// ✅ Server-side UNIQ-ID verification SDK
// ✅ EXACTLY mirrors handlers.js hashing
// ✅ Computes root/leaf, checks on-chain rootToId, validates entered UNIQ-ID

import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import validator from "validator";
import keccak256 from "keccak256";
import { buildPoseidon } from "circomlibjs";

// ethers v5 compatible
const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

// --- ESM __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Blockchain Config ---
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY";
const CONTRACT_ADDR = process.env.CONTRACT_ADDR || "0xYOUR_CONTRACT_ADDR";
const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const CONTRACT_ABI = ["function rootToId(bytes32) view returns (uint256)"];
const contract = new ethers.Contract(CONTRACT_ADDR, CONTRACT_ABI, provider);

// --- Poseidon instance ---
const poseidon = await buildPoseidon();
const F = poseidon.F;

// --- Helpers ---
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

// keccak256(utf8) -> BigInt
function keccakBig(input) {
  const buf = Buffer.from(String(input || ""), "utf8");
  const k = keccak256(buf);
  return BigInt("0x" + k.toString("hex"));
}

// Poseidon(keccak(utf8)) -> hex
function poseidonHashHexFromUtf8(input) {
  const big = keccakBig(input);
  const out = poseidon([big]);
  return "0x" + F.toString(out, 16);
}

// Poseidon(fieldA, fieldB) -> 32-byte padded hex
function poseidonHashHexFromFieldHex(hexA, hexB) {
  const a = BigInt(hexA);
  const b = BigInt(hexB);
  const out = poseidon([a, b]);
  let outHex = F.toString(out, 16);
  while (outHex.length < 64) outHex = "0" + outHex;
  return "0x" + outHex;
}

// Pad to bytes32
function to0xPadded32(hexStr) {
  let s = String(hexStr || "").replace(/^0x/, "");
  while (s.length < 64) s = "0" + s;
  return "0x" + s.toLowerCase();
}

// --- Main SDK Functions ---

/**
 * computeLeaf(email, deKey)
 * - hashes email and paraphrase just like handlers.js
 * - returns { emailHashHex, paraHashHex, leafHex, leafBytes32 }
 */
export async function computeLeaf(email, deKey) {
  const normEmail = normalizeEmail(email);
  if (!validator.isEmail(normEmail)) throw new Error("Invalid email");
  if (!deKey) throw new Error("Missing deKey");

  console.log("🔑 Hashing email and paraphrase...");
  const emailHashHex = poseidonHashHexFromUtf8(normEmail);
  const paraHashHex = poseidonHashHexFromUtf8(deKey);

  console.log("⚡ Combining Poseidon fields to produce leaf...");
  const leafHex = poseidonHashHexFromFieldHex(emailHashHex, paraHashHex);
  const leafBytes32 = to0xPadded32(leafHex);

  return { emailHashHex, paraHashHex, leafHex, leafBytes32 };
}

/**
 * checkOnChain(email, deKey, enteredId)
 * - Computes leaf & checks contract.rootToId(leafBytes32)
 * - If enteredId is provided, ensures it matches the on-chain assigned ID
 */
export async function checkOnChain(email, deKey, enteredId) {
  console.log("🔍 Starting verification process...");
  const { emailHashHex, paraHashHex, leafHex, leafBytes32 } = await computeLeaf(email, deKey);

  console.log("🌐 Querying contract.rootToId for:", leafBytes32);
  const idBn = await contract.rootToId(leafBytes32);
  const idStr = idBn && typeof idBn.toString === "function" ? idBn.toString() : String(idBn);
  const idNum = Number(idStr);

  if (!idNum || idNum === 0) {
    console.log("❌ Root not found on blockchain.");
    return { success: false, reason: "Root does not exist on-chain", emailHashHex, paraHashHex, leafHex, leafBytes32 };
  }

  console.log("✅ Root exists. On-chain assigned ID:", idNum);
  const uniqString = `UNIQ-${String(idNum).padStart(6, "0")}`;

  if (enteredId) {
    if (String(enteredId).trim() !== String(idNum) && String(enteredId).trim() !== uniqString) {
      console.log("❌ Entered ID does not match on-chain ID.");
      return { success: false, reason: "Entered ID does not match on-chain assigned ID", emailHashHex, paraHashHex, leafHex, leafBytes32, onChainId: idNum };
    }
    console.log("🎯 Entered ID matches on-chain ID!");
  }

  // Save to local DB
  const dbPath = path.join(__dirname, "..", "uniqid_users.json");
  const record = {
    uniq_id: uniqString,
    id_number: idNum,
    timestamp: new Date().toISOString()
  };
  let db = [];
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  }
  db.push(record);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`💾 Saved verified user to ${dbPath}`);

  return {
    success: true,
    emailHashHex,
    paraHashHex,
    leafHex,
    leafBytes32,
    uniqId: idNum,
    uniqString
  };
}

/**
 * verifyProcess(email, deKey, enteredId)
 * - High-level function showing full verification steps
 */
export async function verifyProcess(email, deKey, enteredId) {
  console.log("🚀 Starting UNIQ-ID verification");
  try {
    const result = await checkOnChain(email, deKey, enteredId);
    if (result.success) {
      console.log("🎉 Verification Success!");
      console.log(`✅ Email: ${email}`);
      console.log(`✅ UNIQ-ID: ${result.uniqString}`);
    } else {
      console.log("⚠️ Verification Failed:", result.reason);
    }
    return result;
  } catch (err) {
    console.error("❌ Verification Error:", err);
    throw err;
  }
}

export default {
  computeLeaf,
  checkOnChain,
  verifyProcess
};
