const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url'); // Required to fix the URL parsing error

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

      // --- THE ABSOLUTE FIX FOR "FAILED TO PARSE URL" ---
      // 1. Get the absolute path to the WASM file
      const wasmPath = path.resolve(process.cwd(), "node_modules/@jspawn/qpdf-wasm/qpdf.wasm");
      
      if (!fs.existsSync(wasmPath)) {
        return res.status(500).json({ error: "WASM file not found at " + wasmPath });
      }

      // 2. Convert the path to a proper file:// URL string
      // This changes "/var/task/..." into "file:///var/task/..."
      const wasmUrl = pathToFileURL(wasmPath).href;

      // 3. Read the binary data as an ArrayBuffer (better for WASM)
      const wasmBinary = fs.readFileSync(wasmPath);

      const qpdf = await createQpdf({
        wasmBinary: wasmBinary,
        locateFile: () => wasmUrl // Provides the valid URL the library is looking for
      });
      // --------------------------------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // QPDF Instant Logic: --decrypt removes owner passwords instantly
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Clean up temporary file to save Vercel disk space
        fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Unlock failed. The password may be required or incorrect." });
      }
    } catch (error) {
      console.error("Vercel Error:", error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
