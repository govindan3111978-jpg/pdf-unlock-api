// Environment Hack: Simulate a URL environment for the WASM loader
if (typeof global.location === 'undefined') {
    global.location = { href: 'http://localhost/' };
}

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

            // Locate the WASM file
            const wasmPath = path.join(process.cwd(), 'node_modules', '@jspawn', 'qpdf-wasm', 'qpdf.wasm');
            
            if (!fs.existsSync(wasmPath)) {
                throw new Error("Critical: qpdf.wasm not found at " + wasmPath);
            }

            // Read the binary data
            const wasmBinary = fs.readFileSync(wasmPath);

            // INITIALIZE QPDF
            // We pass the binary data AND a dummy locateFile function
            const qpdf = await createQpdf({
                wasmBinary: wasmBinary,
                locateFile: (path) => {
                    // This prevents the "Failed to parse URL" error
                    return 'http://localhost/' + path;
                }
            });

            // Write to virtual filesystem
            qpdf.FS.writeFile("input.pdf", new Uint8Array(inputBuffer));

            // Instant Unlock Logic: --decrypt
            const args = ["--decrypt", "input.pdf", "output.pdf"];
            
            // If the user provided a password, use it. 
            // If not, qpdf still tries to remove owner restrictions.
            if (password && password.trim() !== "") {
                args.unshift(`--password=${password}`);
            }

            const exitCode = qpdf.callMain(args);

            if (exitCode === 0) {
                const outputData = qpdf.FS.readFile("output.pdf");
                
                // Cleanup
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=unlocked_${file.originalFilename}`);
                return res.send(Buffer.from(outputData));
            } else {
                return res.status(400).json({ error: "Failed to unlock. This PDF likely has a strong 'Open Password' that was not provided." });
            }
        } catch (error) {
            console.error("Vercel Error:", error.message);
            return res.status(500).json({ error: "Server Error: " + error.message });
        }
    });
}
