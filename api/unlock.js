const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
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

      // --- THE FINAL FIX: MANUAL BINARY INJECTION ---
      // We resolve the path relative to the current task
      const wasmPath = path.join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm');
      
      if (!fs.existsSync(wasmPath)) {
        throw new Error("WASM file missing from deployment. Check vercel.json.");
      }

      // Read the file as a Buffer
      const wasmBuffer = fs.readFileSync(wasmPath);

      // Initialize QPDF by passing the binary directly.
      // We also set locateFile to return an empty string to stop it from trying to 'open' any paths.
      const qpdf = await createQpdf({
        wasmBinary: wasmBuffer,
        locateFile: () => "" 
      });
      // ----------------------------------------------

      // Virtual File System Operations
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

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
        return res.status(400).json({ error: "Unlock failed. Password might be required." });
      }
    } catch (error) {
      console.error("Critical Error:", error.message);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
