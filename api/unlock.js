// --- THE FIX: Disable global fetch to prevent the "fetch failed" error ---
const nativeFetch = global.fetch;
delete global.fetch; 

const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // Restore fetch for other potential internal Vercel needs after load
  global.fetch = nativeFetch;

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

      // Locate WASM file
      const wasmPath = path.join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm');
      if (!fs.existsSync(wasmPath)) throw new Error("WASM file not found");
      
      const wasmBinary = fs.readFileSync(wasmPath);

      // INITIALIZE QPDF WITH BINARY INJECTION
      // locateFile returning an empty string stops the 'fetch' attempt
      const qpdf = await createQpdf({
        wasmBinary: wasmBinary,
        locateFile: () => "" 
      });

      // Write to virtual filesystem
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // QPDF Arguments: --decrypt removes restrictions
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Clean up
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Failed to unlock. This file may require a password." });
      }
    } catch (error) {
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
