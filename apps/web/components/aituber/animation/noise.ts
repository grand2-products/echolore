function hash(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  x -= Math.floor(x);
  return x;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function noise1D(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i);
  const b = hash(i + 1);
  return (a + (b - a) * smoothstep(f)) * 2 - 1;
}

export function fbm1D(x: number, octaves = 3): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += noise1D(x * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.17;
  }
  return value;
}
