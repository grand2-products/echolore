#!/usr/bin/env node
/**
 * Fix Pelvis rest translation in VRMA files.
 *
 * The SMPL-H → FBX → VRMA pipeline writes the Pelvis node rest translation
 * as a bone-local offset (Y ≈ -0.19), but the animation translation channel
 * contains world-space values (Y ≈ 0.97). The @pixiv/three-vrm-animation
 * VRMAnimationLoaderPlugin reads the node's world position as restHipsPosition,
 * and createVRMAnimationClip scales all translation values by
 * (vrmHipsY / restHipsY). With restHipsY = -0.19, the scale becomes a large
 * negative number, causing the character to fly off screen.
 *
 * Fix: set the Pelvis node rest translation to the animation's first frame
 * values. This makes restHipsPosition match the actual source hips height,
 * so the scale ratio is correct and small deltas are preserved.
 *
 * Usage:
 *   node scripts/fix-vrma-hips.mjs [dir]
 *   (defaults to apps/web/public/motions)
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "apps/web/public/motions";

function fixVrma(filePath) {
  const buf = Buffer.from(readFileSync(filePath));

  // Parse GLB header
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    console.warn(`  skip (not GLB): ${filePath}`);
    return false;
  }

  const jsonChunkLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonChunkLen).toString("utf-8"));

  // Find the hips node via VRMC_vrm_animation extension
  const ext = json.extensions?.VRMC_vrm_animation;
  if (!ext) {
    console.warn(`  skip (no VRMC_vrm_animation): ${filePath}`);
    return false;
  }

  const hipsNodeIdx = ext.humanoid?.humanBones?.hips?.node;
  if (hipsNodeIdx == null) {
    console.warn(`  skip (no hips bone): ${filePath}`);
    return false;
  }

  const hipsNode = json.nodes[hipsNodeIdx];
  if (!hipsNode) {
    console.warn(`  skip (hips node missing): ${filePath}`);
    return false;
  }

  // Find the translation animation channel targeting the hips node
  const animations = json.animations || [];
  if (animations.length === 0) {
    console.warn(`  skip (no animations): ${filePath}`);
    return false;
  }

  const anim = animations[0];
  const translationChannel = anim.channels.find(
    (ch) => ch.target.node === hipsNodeIdx && ch.target.path === "translation"
  );
  if (!translationChannel) {
    console.warn(`  skip (no hips translation channel): ${filePath}`);
    return false;
  }

  // Read first frame of translation data from binary chunk
  const sampler = anim.samplers[translationChannel.sampler];
  const outputAcc = json.accessors[sampler.output];
  const bv = json.bufferViews[outputAcc.bufferView];

  const binChunkOffset = 20 + jsonChunkLen;
  const binDataOffset = binChunkOffset + 8; // skip chunk header
  const dataOffset = binDataOffset + (bv.byteOffset || 0) + (outputAcc.byteOffset || 0);

  const frame0X = buf.readFloatLE(dataOffset);
  const frame0Y = buf.readFloatLE(dataOffset + 4);
  const frame0Z = buf.readFloatLE(dataOffset + 8);

  const restT = hipsNode.translation || [0, 0, 0];

  // Check if already fixed (rest ~= frame0)
  const dy = Math.abs(restT[1] - frame0Y);
  if (dy < 0.01) {
    return false; // already correct
  }

  console.log(
    `  ${filePath}:\n` +
      `    rest  [${restT[0].toFixed(4)}, ${restT[1].toFixed(4)}, ${restT[2].toFixed(4)}]\n` +
      `    anim0 [${frame0X.toFixed(4)}, ${frame0Y.toFixed(4)}, ${frame0Z.toFixed(4)}]`
  );

  // Update the node's rest translation in the JSON chunk
  hipsNode.translation = [frame0X, frame0Y, frame0Z];

  // Re-serialize JSON and rebuild GLB
  const newJsonStr = JSON.stringify(json);
  // JSON chunk must be padded to 4-byte alignment with spaces (0x20)
  const paddedLen = (newJsonStr.length + 3) & ~3;
  const newJsonBuf = Buffer.alloc(paddedLen, 0x20);
  newJsonBuf.write(newJsonStr, "utf-8");

  // Binary chunk (unchanged)
  const binChunkLen = buf.readUInt32LE(binChunkOffset);
  const binChunkHeader = buf.slice(binChunkOffset, binChunkOffset + 8);
  const binChunkData = buf.slice(binDataOffset, binDataOffset + binChunkLen);

  // Build new GLB
  const totalLen = 12 + 8 + paddedLen + 8 + binChunkLen;
  const out = Buffer.alloc(totalLen);

  // GLB header
  out.writeUInt32LE(0x46546c67, 0); // magic
  out.writeUInt32LE(2, 4); // version
  out.writeUInt32LE(totalLen, 8); // total length

  // JSON chunk
  let offset = 12;
  out.writeUInt32LE(paddedLen, offset);
  out.writeUInt32LE(0x4e4f534a, offset + 4); // 'JSON'
  newJsonBuf.copy(out, offset + 8);
  offset += 8 + paddedLen;

  // BIN chunk
  binChunkHeader.copy(out, offset);
  binChunkData.copy(out, offset + 8);

  writeFileSync(filePath, out);
  return true;
}

// Process all .vrma files
const files = readdirSync(dir).filter((f) => f.endsWith(".vrma"));
console.log(`Processing ${files.length} VRMA files in ${dir}...`);

let totalFixed = 0;
for (const file of files) {
  const result = fixVrma(join(dir, file));
  if (result) totalFixed++;
}

console.log(`\nDone. Fixed ${totalFixed}/${files.length} files.`);
