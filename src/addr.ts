/*
  The following is based on https://github.com/yggdrasil-network/yggdrasil-go/blob/develop/src/address/address.go, which is licensed LGPL3. Full credit to them for the idea and original algorithm
 */

export function pubKeyToIpv6(publicKey: Uint8Array) {
  const keySize = 32;
  if (publicKey.length !== keySize) {
    return null;
  }

  const buf = new Uint8Array(keySize);
  for (let i = 0; i < keySize; i++) {
    buf[i] = buf[i] = publicKey[i] ^ 0xff;
  }

  const prefix = [0x02];
  const ones = getLeadingOnes(buf);
  const nodeId = getTruncatedNodeID(buf);

  const addr = new Uint8Array(prefix.length + 1 + nodeId.length);
  addr.set(prefix, 0);
  addr[prefix.length] = ones;
  addr.set(nodeId, prefix.length + 1);

  const result = [];
  for (let i = 0; i < 8; i++) {
    const num1 = addr[i * 2].toString(16).padStart(2, "0");
    const num2 = addr[i * 2 + 1].toString(16).padStart(2, "0");
    result.push(`${num1}${num2}`);
  }
  return result.join(":");
}

function getLeadingOnes(buf: Uint8Array) {
  let done = false;
  let ones = 0;
  for (let i = 0; i < buf.length * 8; i++) {
    const bit = (buf[i >>> 3] & (0x80 >> (i & 7))) >> (7 - (i & 7));
    if (!done && bit !== 0) {
      ones++;
    } else if (!done && bit === 0) {
      done = true;
    }
  }
  return ones;
}

function getTruncatedNodeID(buf: Uint8Array) {
  const result = [];
  let done = false;
  let bits = 0;
  let nBits = 0;
  for (let i = 0; i < buf.length * 8; i++) {
    const bit = (buf[i >>> 3] & (0x80 >> (i & 7))) >> (7 - (i & 7));
    if (!done && bit !== 0) {
      continue;
    }

    if (!done && bit === 0) {
      done = true;
      continue;
    }

    bits = (bits << 1) | bit;
    nBits++;
    if (nBits === 8) {
      nBits = 0;
      result.push(bits);
    }
  }
  return result;
}
