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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const form = new Form();

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const file = files.file[0];
      const password = fields.password ? fields.password[0] : "";
      const inputBuffer = fs.readFileSync(file.path);

      // --- FIX FOR WASM PATH ERROR ---
      // We resolve the absolute path and add file:// protocol to satisfy the internal URL parser
      const wasmPath = path.join(process.cwd(), 'node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
      
      const qpdf = await createQpdf({
        locateFile: () => `file://${wasmPath}`
      });
      // -------------------------------

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
        return res.status(400).json({ error: "Incorrect password or corrupted file." });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server Error: " + error.message });
    }
  });
}
