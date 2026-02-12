from pypdf import PdfReader, PdfWriter
import io
from http.server import BaseHTTPRequestHandler
import cgi

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Handle CORS Preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            # Parse the multipart form data
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )

            if 'file' not in form:
                self.send_error_msg(400, "No file uploaded")
                return

            file_item = form['file']
            password = form.getvalue('password', '')

            # Read PDF from the uploaded file
            input_stream = io.BytesIO(file_item.file.read())
            reader = PdfReader(input_stream)

            # Attempt to decrypt if a password is provided
            if reader.is_encrypted:
                try:
                    reader.decrypt(password)
                except:
                    self.send_error_msg(401, "Invalid Password")
                    return

            # Create a new PDF (this strips all restrictions/owner passwords)
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)

            # Save to memory
            output_stream = io.BytesIO()
            writer.write(output_stream)
            output_stream.seek(0)

            # Send Response
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', f'attachment; filename="unlocked.pdf"')
            self.end_headers()
            self.wfile.write(output_stream.read())

        except Exception as e:
            self.send_error_msg(500, str(e))

    def send_error_msg(self, code, msg):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        import json
        self.wfile.write(json.dumps({"error": msg}).encode())
