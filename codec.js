async function textToQR(text, canvasId) {
    const compressed = compressText(text);
    const chunks = splitIntoThree(compressed);

    const qrs = await Promise.all(chunks.map(t => makeQRCanvas(t)));
    const [r, g, b] = qrs;
    const w = r.width, h = r.height;

    const out = document.getElementById(canvasId);
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    const outImg = ctx.createImageData(w, h);

    const rD = r.getContext('2d').getImageData(0, 0, w, h).data;
    const gD = g.getContext('2d').getImageData(0, 0, w, h).data;
    const bD = b.getContext('2d').getImageData(0, 0, w, h).data;

    for (let i = 0; i < outImg.data.length; i += 4) {
        outImg.data[i]   = (rD[i] < 128) ? 0 : 255;
        outImg.data[i+1] = (gD[i] < 128) ? 0 : 255;
        outImg.data[i+2] = (bD[i] < 128) ? 0 : 255;
        outImg.data[i+3] = 255;
    }

    ctx.putImageData(outImg, 0, 0);
}
  
  // --- Decode: demultiplex → join → decompress ---
async function QRtoText(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = canvas;
    const src = ctx.getImageData(0, 0, w, h).data;
  
    const decodedParts = [];
    for (let c = 0; c < 3; c++) {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < src.length; i += 4) {
        const val = src[i + c];
        img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
  
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      off.getContext("2d").putImageData(img, 0, 0);
  
      const data = off.getContext("2d").getImageData(0, 0, w, h);
      const res = jsQR(data.data, w, h);
      decodedParts.push(res ? res.data : "");
    }
  
    const base64 = decodedParts.join("");
    return decompressText(base64);
  }
  
  // --- Helper: evenly split text into 3 parts ---
  function splitIntoThree(str) {
    const len = Math.ceil(str.length / 3);
    return [str.slice(0, len), str.slice(len, 2 * len), str.slice(2 * len)];
  }
  
  function compressText(str) {
    const utf8 = new TextEncoder().encode(str);
    const compressed = pako.deflate(utf8);
    return btoa(String.fromCharCode(...compressed)); // base64 encode for QR
  }
  
  function decompressText(base64) {
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const inflated = pako.inflate(binary);
    return new TextDecoder().decode(inflated);
  }

  // --- Helper: create QR from text ---
  function makeQRCanvas(text) {
    return new Promise((resolve, reject) => {
      const c = document.createElement("canvas");
  
      QRCode.toCanvas(
        c,
        text || " ",
        {
          margin: 1,
          scale: 4,
          errorCorrectionLevel: "H", // ensure mid fault tolerance
          color: { dark: "#000000", light: "#ffffff" },
        },
        (err) => {
          if (err) {
            console.error("QR generation failed:", err);
            reject(err);
            return;
          }
  
          // verify it actually drew something
          const ctx = c.getContext("2d");
          const imgData = ctx.getImageData(0, 0, c.width, c.height);
          const hasContent = imgData.data.some((v, i) => (i % 4 === 3 ? false : v < 250));
  
          if (!hasContent) {
            console.warn("⚠️ QR canvas appears blank for text:", text.slice(0, 50));
          }
  
          resolve(c);
        }
      );
    });
  }
  
  