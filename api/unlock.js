import createQpdf from '@jspawn/qpdf-wasm';
import { Form } from 'multiparty';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

      // --- NEW ESM PATH LOGIC ---
      // This is the modern way to find files in ESM mode on Vercel
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const wasmPath = path.join(__dirname, '../node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
      
      // Initialize QPDF using the absolute file URL
      // In ESM mode, this "just works" without URL parsing errors
      const qpdf = await createQpdf({
        locateFile: () => wasmPath
      });
      // --------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // Argument Logic
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
        return res.status(400).json({ error: "Unlock failed. Incorrect password or invalid PDF." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
