import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  if (password.length < 10 || password.length > 512) throw new Error("Password must have between 10 and 512 characters");
  const salt = randomBytes(16);
  const derived = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] = encoded.split("$");
    if (algorithm !== "scrypt" || !rawCost || !rawBlockSize || !rawParallelization || !rawSalt || !rawHash) return false;
    const cost = Number(rawCost);
    const blockSize = Number(rawBlockSize);
    const parallelization = Number(rawParallelization);
    if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;
    const expected = Buffer.from(rawHash, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, Buffer.from(rawSalt, "base64url"), cost, blockSize, parallelization);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
