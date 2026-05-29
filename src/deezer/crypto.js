import { createHash, createCipheriv, createDecipheriv } from "crypto";

const XOR_MASK = 0xab;

// "g4el58wc0zvf9na1" XOR 0xAB
const BF_SECRET = [
  0xcc, 0x9f, 0xce, 0xc7, 0x9e, 0x93, 0xdc, 0xc8, 0x9b, 0xd1, 0xdd, 0xcd, 0x92,
  0xc5, 0xca, 0x9a,
];

// "jo6aey6haid2Teih" XOR 0xAB
const AES_KEY = [
  0xc1, 0xc4, 0x9d, 0xca, 0xce, 0xd2, 0x9d, 0xc3, 0xca, 0xc2, 0xcf, 0x99, 0xff,
  0xce, 0xc2, 0xc3,
];

function deobfuscate(data) {
  const out = new Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = data[i] ^ XOR_MASK;
  }
  return out;
}

export function getBlowfishKey(trackId) {
  const secret = deobfuscate(BF_SECRET);
  const hash = createHash("md5").update(trackId).digest("hex");

  const key = [];
  for (let i = 0; i < 16; i++) {
    // XOR ASCII byte values of hex string characters with secret
    key.push(hash.charCodeAt(i) ^ hash.charCodeAt(i + 16) ^ secret[i]);
  }
  return key;
}

export function encryptDownloadUrl(
  md5Origin,
  qualityCode,
  trackId,
  mediaVersion,
) {
  const sep = "\u00A4"; // ¤

  const step1 = `${md5Origin}${sep}${qualityCode}${sep}${trackId}${sep}${mediaVersion}`;
  const step1Md5 = createHash("md5")
    .update(Buffer.from(step1, "latin1"))
    .digest("hex");

  const step2 = `${step1Md5}${sep}${step1}${sep}`;

  // Pad to next multiple of 16 with spaces (latin1 space = 0x20)
  const step2Len = step2.length;
  const paddedLen =
    step2Len % 16 === 0 ? step2Len : step2Len + (16 - (step2Len % 16));
  const step2Padded = step2.padEnd(paddedLen, " ");

  const aesKey = Buffer.from(deobfuscate(AES_KEY));

  // AES-128-ECB encryption (no padding, data already padded)
  const cipher = createCipheriv("aes-128-ecb", aesKey, null);
  cipher.setAutoPadding(false);

  const step2Buffer = Buffer.from(step2Padded, "latin1");
  const encrypted = Buffer.concat([cipher.update(step2Buffer), cipher.final()]);

  const result = encrypted.toString("hex");

  const cdn = md5Origin.charAt(0);
  if (!cdn) {
    throw new Error("Track unavailable (invalid MD5_ORIGIN)");
  }

  return `https://e-cdns-proxy-${cdn}.dzcdn.net/mobile/1/${result}`;
}

export function decryptBlowfishChunk(chunk, key) {
  const iv = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const keyBuffer = Buffer.from(key);

  const decipher = createDecipheriv("bf-cbc", keyBuffer, iv);
  decipher.setAutoPadding(false); // NoPadding

  const decrypted = Buffer.concat([decipher.update(chunk), decipher.final()]);

  return decrypted;
}
