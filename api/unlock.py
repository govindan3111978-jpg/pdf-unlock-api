import io
import json
import pikepdf
from http.server import BaseHTTPRequestHandler
import cgi

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Handle CORS to prevent "Server Connection Failed"
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            # 1. Parse the uploaded file
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )

            if 'file' not in form:
                self.send_error_json(400, "No file uploaded")
                return

            file_data = form['file'].file.read()
            password = form.getvalue('password', '')

            # 2. Open PDF with pikepdf (The QPDF Engine)
            # It automatically attempts to open with an empty password first
            input_stream = io.BytesIO(file_data)
            
            try:
                # If no password provided, it tries to strip owner restrictions
                if not password:
                    pdf = pikepdf.open(input_stream)
                else:
                    pdf = pikepdf.open(input_stream, password=password)
            except pikepdf.PasswordError:
                self.send_error_json(401, "Password Required")
                return
            except Exception as e:
                self.send_error_json(400, f"Engine Error: {str(e)}")
                return

            # 3. Save the PDF with NO encryption (iLovePDF Style)
            output_stream = io.BytesIO()
            # preserve_encryption=False is the magic command to unlock it forever
            pdf.save(output_stream, preserve_encryption=False, static_id=True)
            pdf.close()
            output_stream.seek(0)

            # 4. Send the file back
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', 'attachment; filename="unlocked.pdf"')
            self.end_headers()
            self.wfile.write(output_stream.read())

        except Exception as e:
            self.send_error_json(500, str(e))

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
