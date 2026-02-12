const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

// --- THE CRITICAL FIX ---
// Polyfill the environment so 'new URL()' doesn't crash on Vercel
if (typeof global.location === 'undefined') {
    global.location = { href: pathToFileURL(process.cwd()).href + '/' };
}

const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');

export const config = {
  api: { bodyParser: false },
};

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

      // 1. Locate the WASM file
      const wasmPath = path.join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm');
      
      if (!fs.existsSync(wasmPath)) {
        throw new Error("WASM file missing at: " + wasmPath);
      }

      // 2. Convert path to a valid file:// URL with TRIPLE slashes
      // Example: file:///var/task/node_modules/...
      const wasmUrl = pathToFileURL(wasmPath).href;

      // 3. Initialize QPDF
      const qpdf = await createQpdf({
        locateFile: () => wasmUrl
      });

      // 4. Processing
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // iLovePDF Logic: --decrypt removes owner restrictions automatically
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
        return res.status(400).json({ error: "Failed to unlock. This file may have a strong user password." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
