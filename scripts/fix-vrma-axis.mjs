#!/usr/bin/env node
/**
 * Fix Y↔Z axis swap in VRMA rotation quaternions.
 *
 * The SMPL-H export pipeline writes rotation quaternions with Y and Z
 * components swapped relative to the glTF/VRM coordinate convention.
 * This script reads each .vrma file, identifies rotation animation channels,
 * and swaps the Y and Z components of every quaternion in-place.
 *
 * Usage:
 *   node scripts/fix-vrma-axis.mjs [dir]
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
    // 'glTF'
    console.warn(`  skip (not GLB): ${filePath}`);
    return false;
  }

  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonData = JSON.parse(buf.slice(20, 20 + jsonChunkLen).toString("utf-8"));

  // Binary chunk
  const binStart = 20 + jsonChunkLen;
  const binOffset = binStart + 8; // skip chunk header (length + type)

  const accessors = jsonData.accessors || [];
  const bufferViews = jsonData.bufferViews || [];
  const animations = jsonData.animations || [];

  if (animations.length === 0) {
    console.warn(`  skip (no animations): ${filePath}`);
    return false;
  }

  // Collect all accessor indices used for rotation output
  const rotationAccessorIndices = new Set();
  for (const anim of animations) {
    for (const channel of anim.channels || []) {
      if (channel.target.path === "rotation") {
        const sampler = anim.samplers[channel.sampler];
        rotationAccessorIndices.add(sampler.output);
      }
    }
  }

  let swapCount = 0;

  for (const accIdx of rotationAccessorIndices) {
    const acc = accessors[accIdx];
    if (acc.componentType !== 5126 || acc.type !== "VEC4") continue;

    const bv = bufferViews[acc.bufferView];
    const baseOffset = binOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = bv.byteStride || 16; // 4 floats * 4 bytes

    for (let i = 0; i < acc.count; i++) {
      const offset = baseOffset + i * stride;
      // xyzw at offset+0, offset+4, offset+8, offset+12
      const y = buf.readFloatLE(offset + 4);
      const z = buf.readFloatLE(offset + 8);
      // Swap Y ↔ Z
      buf.writeFloatLE(z, offset + 4);
      buf.writeFloatLE(y, offset + 8);
      swapCount++;
    }
  }

  writeFileSync(filePath, buf);
  return swapCount;
}

// Process all .vrma files
const files = readdirSync(dir).filter((f) => f.endsWith(".vrma"));
console.log(`Processing ${files.length} VRMA files in ${dir}...`);

let totalFixed = 0;
for (const file of files) {
  const filePath = join(dir, file);
  const count = fixVrma(filePath);
  if (count) {
    console.log(`  ${file}: ${count} quaternions fixed`);
    totalFixed++;
  }
}

console.log(`\nDone. Fixed ${totalFixed}/${files.length} files.`);
