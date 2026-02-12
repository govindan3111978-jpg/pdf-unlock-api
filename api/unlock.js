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

      // --- NEW RELIABLE PATH RESOLUTION ---
      // Try two common paths used by Vercel
      const path1 = path.join(process.cwd(), 'node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
      const path2 = path.join(__dirname, '../node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
      
      let wasmPath = fs.existsSync(path1) ? path1 : path2;

      if (!fs.existsSync(wasmPath)) {
        throw new Error(`WASM file not found. Checked: ${path1} and ${path2}`);
      }

      // Initialize QPDF without the "file://" prefix
      const qpdf = await createQpdf({
        locateFile: () => wasmPath
      });
      // -------------------------------------

      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

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
        return res.status(400).json({ error: "Unlock failed. The password might be incorrect." });
      }
    } catch (error) {
      console.error("Worker Error:", error.message);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
