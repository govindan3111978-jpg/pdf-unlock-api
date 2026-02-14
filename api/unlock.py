import io
import json
from pypdf import PdfReader, PdfWriter
from http.server import BaseHTTPRequestHandler
import cgi

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # This part fixes the "Server connection failed" / CORS error
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            # Parse the uploaded file
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

            # Process PDF
            input_stream = io.BytesIO(file_data)
            reader = PdfReader(input_stream)

            if reader.is_encrypted:
                # Try empty password, then user password
                success = False
                try:
                    reader.decrypt("")
                    success = True
                except:
                    try:
                        reader.decrypt(password)
                        success = True
                    except:
                        pass
                
                if not success:
                    self.send_error_json(401, "Password Required")
                    return

            # Reconstruct PDF (iLovePDF Style)
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)

            output_stream = io.BytesIO()
            writer.write(output_stream)
            output_stream.seek(0)

            # Send the file
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
