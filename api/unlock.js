const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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

      // --- THE ULTIMATE FIX FOR "FAILED TO PARSE URL" ---
      
      // 1. Get the absolute path
      const wasmPath = path.resolve(process.cwd(), 'node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
      
      // 2. Convert to file:/// protocol (This is what Node.js 18+ requires)
      const wasmFullUrl = pathToFileURL(wasmPath).href;

      // 3. Read the binary data (Loading it manually is safer)
      const wasmBinary = fs.readFileSync(wasmPath);

      // 4. Initialize with BOTH the binary and the correctly formatted URL
      const qpdf = await createQpdf({
        wasmBinary: wasmBinary,
        locateFile: () => wasmFullUrl
      });
      // --------------------------------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // Argument Logic: --decrypt removes owner passwords (restrictions)
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Cleanup temp file
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Incorrect password. This file requires an 'Open Password'." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
