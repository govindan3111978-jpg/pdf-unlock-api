import createQpdf from '@jspawn/qpdf-wasm';
import { Form } from 'multiparty';
import fs from 'fs';
import axios from 'axios';

export const config = {
  api: { bodyParser: false },
};

// This variable stays in the server's RAM to make the tool fast
let wasmEngineBuffer = null;

export default async function handler(req, res) {
  // 1. CORS Headers
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

      // --- STEP 1: DOWNLOAD ENGINE TO RAM ---
      if (!wasmEngineBuffer) {
        const response = await axios.get('https://unpkg.com/@jspawn/qpdf-wasm@0.0.2/qpdf.wasm', {
          responseType: 'arraybuffer'
        });
        wasmEngineBuffer = Buffer.from(response.data);
      }

      // --- STEP 2: INITIALIZE WITHOUT FILE SYSTEM ---
      const qpdf = await createQpdf({
        wasmBinary: wasmEngineBuffer,
        // This prevents the "Failed to parse URL" and "ENOENT" errors
        locateFile: () => "" 
      });

      // --- STEP 3: UNLOCK LOGIC ---
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // --decrypt removes owner restrictions automatically
      const args = ["--decrypt", "input.pdf", "output.pdf"];
      if (password && password.trim() !== "") {
        args.unshift(`--password=${password}`);
      }

      const exitCode = qpdf.callMain(args);

      if (exitCode === 0) {
        const outputData = qpdf.FS.readFile("output.pdf");
        
        // Clean up temp file
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
        return res.send(Buffer.from(outputData));
      } else {
        return res.status(400).json({ error: "Unlock failed. Password required for this file." });
      }
    } catch (error) {
      console.error("Vercel Error:", error.message);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
