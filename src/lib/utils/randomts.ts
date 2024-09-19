/**
 * Modifies a timestamp by replacing the specified number of bits with a random value.
 *
 * @param {number} timestamp - The original timestamp.
 * @param {number} [numBits=10] - The number of bits to replace with randomness.
 * @returns {number} - The modified timestamp.
 */
export function pseudoRandomTimestamp(
  timestamp: bigint,
  numBits: number = 11,
): bigint {
  const randomValue = BigInt(Math.floor(Math.random() * (1 << numBits)));
  const mask = BigInt(~((1 << numBits) - 1));
  const modifiedTimestamp = (timestamp & mask) | randomValue;
  return modifiedTimestamp;
}
