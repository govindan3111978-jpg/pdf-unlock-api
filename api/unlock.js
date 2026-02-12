const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const fetch = require('node-fetch');

export const config = {
  api: { bodyParser: false },
};

// Cache the engine in memory so we don't download it every single time
let cachedWasmBinary = null;

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const form = new Form();

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const file = files.file[0];
      const password = fields.password ? fields.password[0] : "";
      const inputBuffer = fs.readFileSync(file.path);

      // --- THE CLOUD-LOADER FIX ---
      if (!cachedWasmBinary) {
        // We download the engine from a reliable CDN
        const response = await fetch('https://unpkg.com/@jspawn/qpdf-wasm@0.0.2/qpdf.wasm');
        if (!response.ok) throw new Error("Failed to download PDF engine from CDN");
        const arrayBuffer = await response.arrayBuffer();
        cachedWasmBinary = Buffer.from(arrayBuffer);
      }

      // Initialize QPDF using the downloaded binary
      const qpdf = await createQpdf({
        wasmBinary: cachedWasmBinary,
        locateFile: () => "" // Prevents the library from looking for local files
      });
      // ----------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // Instant Unlock Logic
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Cleanup temp upload
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Unlock failed. Password may be required for this file." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
