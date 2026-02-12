const createQpdf = require('@jspawn/qpdf-wasm');
const { Form } = require('multiparty');

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const form = new Form();

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const file = files.file[0];
      const password = fields.password ? fields.password[0] : "";
      
      const fs = require('fs');
      const inputBuffer = fs.readFileSync(file.path);

      // Initialize QPDF
      const qpdf = await createQpdf();
      
      // Write file to the virtual filesystem
      qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

      // Argument logic: QPDF handles "Owner passwords" automatically with --decrypt
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
        return res.status(400).json({ error: "Wrong password or internal error." });
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
}
