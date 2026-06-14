export function sanitizeBigint(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  // THE FIX: Choose ONE of these depending on what your Relayer actually wants:

  // Option A (String - Most common standard Web3):
  if (typeof obj === 'bigint') return obj.toString();

  // Option B (Hex String - Required by strictly typed JSON-RPC nodes):
  // if (typeof obj === 'bigint') return `0x${obj.toString(16)}`; 

  // Option C (Raw Number - Only if your API specifically demands it, max 9 quadrillion):
  // if (typeof obj === 'bigint') return Number(obj); 

  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigint);
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeBigint(obj[key]);
    }
    return result;
  }

  return obj;
}