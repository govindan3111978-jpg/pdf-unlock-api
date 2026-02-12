const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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

      // --- THE ULTIMATE FIX: MANUAL WASM LOADING ---
      // We manually find and read the .wasm file into a Buffer
      const wasmPath = path.resolve(process.cwd(), "node_modules/@jspawn/qpdf-wasm/qpdf.wasm");
      
      if (!fs.existsSync(wasmPath)) {
        return res.status(500).json({ error: "System file qpdf.wasm not found at " + wasmPath });
      }

      const wasmBuffer = fs.readFileSync(wasmPath);

      // We pass the binary data directly. This stops the library from trying 
      // to create a URL, which was causing the error you saw.
      const qpdf = await createQpdf({
        wasmBinary: wasmBuffer
      });
      // ----------------------------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // QPDF Instant Logic: --decrypt removes owner passwords (restrictions) 
      // without needing the password entered.
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Unlock failed. This file might have a strong User Password." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
