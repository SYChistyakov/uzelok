// Cleanup: removed unused compression/base encoders

// Raw JSON signaling encode/decode
async function encodeSignalingBundle(objectToEncode) {
    return JSON.stringify(objectToEncode);
}

async function decodeSignalingBundle(text) {
    return JSON.parse((text || "").trim());
}

// Byte helpers
async function bundleToBytes(bundle) {
    const json = JSON.stringify(bundle);
    return new TextEncoder().encode(json);
}

async function bytesToBundle(bytes) {
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
}

// --- LSB steganography helpers (use 1 LSB per RGB channel) ---
const LSB_MAGIC = [0x55, 0x5A, 0x53, 0x31]; // 'U','Z','S','1'

function ensureCapacityLSB(canvas, totalBitsNeeded) {
    const capacityBits = canvas.width * canvas.height * 3; // RGB channels only
    if (totalBitsNeeded > capacityBits) {
        throw new Error('Cover image too small for payload');
    }
}

function writeBitsToImageDataLSB(imageData, bits) {
    const data = imageData.data; // RGBA
    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < bits.length; i += 4) {
        // R
        if (bitIndex < bits.length) {
            data[i] = (data[i] & 0xFE) | (bits[bitIndex++] & 1);
        }
        // G
        if (bitIndex < bits.length) {
            data[i + 1] = (data[i + 1] & 0xFE) | (bits[bitIndex++] & 1);
        }
        // B
        if (bitIndex < bits.length) {
            data[i + 2] = (data[i + 2] & 0xFE) | (bits[bitIndex++] & 1);
        }
        // Alpha unchanged
    }
}

function readBitsFromImageDataLSB(imageData, bitsToRead) {
    const data = imageData.data;
    const bits = new Uint8Array(bitsToRead);
    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < bitsToRead; i += 4) {
        bits[bitIndex++] = data[i] & 1;       // R
        if (bitIndex >= bitsToRead) break;
        bits[bitIndex++] = data[i + 1] & 1;   // G
        if (bitIndex >= bitsToRead) break;
        bits[bitIndex++] = data[i + 2] & 1;   // B
    }
    return bits;
}

function bytesToBits(bytes) {
    const bits = new Uint8Array(bytes.length * 8);
    let k = 0;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        for (let bit = 0; bit < 8; bit++) {
            bits[k++] = (b >> bit) & 1; // little-endian bit order
        }
    }
    return bits;
}

function bitsToBytes(bits) {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
        const byteIndex = Math.floor(i / 8);
        const bitPos = i % 8;
        bytes[byteIndex] |= (bits[i] & 1) << bitPos;
    }
    return bytes;
}

function writeBytesToCanvasLSB(canvas, payloadBytes) {
    const header = new Uint8Array(8);
    header.set(LSB_MAGIC, 0);
    const len = payloadBytes.length >>> 0;
    header[4] = len & 0xFF;
    header[5] = (len >>> 8) & 0xFF;
    header[6] = (len >>> 16) & 0xFF;
    header[7] = (len >>> 24) & 0xFF;

    const totalBytes = new Uint8Array(header.length + payloadBytes.length);
    totalBytes.set(header, 0);
    totalBytes.set(payloadBytes, header.length);

    const totalBits = totalBytes.length * 8;
    ensureCapacityLSB(canvas, totalBits);

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bits = bytesToBits(totalBytes);
    writeBitsToImageDataLSB(imageData, bits);
    ctx.putImageData(imageData, 0, 0);
}

function readBytesFromCanvasLSB(canvas) {
    if (!canvas.width || !canvas.height) throw new Error('Canvas empty');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // First read header (8 bytes)
    const headerBits = readBitsFromImageDataLSB(imageData, 8 * 8);
    const headerBytes = bitsToBytes(headerBits);
    if (headerBytes[0] !== LSB_MAGIC[0] || headerBytes[1] !== LSB_MAGIC[1] || headerBytes[2] !== LSB_MAGIC[2] || headerBytes[3] !== LSB_MAGIC[3]) {
        throw new Error('Invalid stego header');
    }
    const len = (headerBytes[4]) | (headerBytes[5] << 8) | (headerBytes[6] << 16) | (headerBytes[7] << 24);
    if (len < 0) throw new Error('Invalid stego length');

    const totalBitsToRead = (8 + len) * 8;
    ensureCapacityLSB(canvas, totalBitsToRead);
    const allBits = readBitsFromImageDataLSB(imageData, totalBitsToRead);
    const allBytes = bitsToBytes(allBits);
    return allBytes.subarray(8);
}

