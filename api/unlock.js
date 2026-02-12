const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // 1. Setup CORS
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

      // --- THE ULTIMATE FIX: BYPASS FS.OPEN ---
      
      // Find the WASM file using a path that works in Vercel's build
      const wasmPath = path.join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm');
      
      if (!fs.existsSync(wasmPath)) {
        throw new Error("Missing qpdf.wasm at " + wasmPath);
      }

      // Read the file into a standard Node Buffer
      const wasmBuffer = fs.readFileSync(wasmPath);

      // Initialize QPDF
      // We pass the wasmBinary directly. 
      // IMPORTANT: We set locateFile to return null to prevent the engine from searching for files.
      const qpdf = await createQpdf({
        wasmBinary: wasmBuffer,
        locateFile: () => '' 
      });

      // Write the uploaded PDF to the virtual filesystem
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // Argument Logic: --decrypt removes owner passwords (restrictions) instantly
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      // Execute QPDF
      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Clean up temp file
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Incorrect password. This file requires a user password to open." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
