const qpdf = require('node-qpdf-wasm');
const { Form } = require('multiparty');
const fs = require('fs');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // 1. Setup CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const form = new Form();

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    try {
      const file = files.file[0];
      const password = fields.password ? fields.password[0] : "";
      
      // Read the uploaded file into a Buffer
      const inputBuffer = fs.readFileSync(file.path);

      // --- THE UNLOCK LOGIC ---
      // node-qpdf-wasm is optimized for Node.js environments like Vercel
      // It will remove owner restrictions automatically if password is not provided
      const outputBuffer = await qpdf.execute(inputBuffer, {
        args: [
          password ? `--password=${password}` : '',
          '--decrypt'
        ].filter(Boolean)
      });

      // Cleanup temp file
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

      // Send the unlocked file back
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
      return res.send(outputBuffer);

    } catch (error) {
      console.error("Unlock Error:", error);
      
      // If qpdf fails, it usually means the password was wrong
      return res.status(400).json({ 
        error: "Failed to unlock. If the file is protected by a password, please enter it. Error: " + error.message 
      });
    }
  });
}
