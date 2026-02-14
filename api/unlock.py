import io
import json
import pikepdf
from http.server import BaseHTTPRequestHandler
import cgi

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )

            if 'file' not in form:
                self.send_error_json(400, "No file uploaded")
                return

            file_data = form['file'].file.read()
            user_provided_pass = form.getvalue('password', '')

            input_stream = io.BytesIO(file_data)
            pdf = None
            
            # --- STABLE BYPASS LOGIC ---
            try:
                # Attempt 1: Standard Open (No password)
                pdf = pikepdf.open(input_stream)
            except pikepdf.PasswordError:
                # Attempt 2: Empty string password
                try:
                    input_stream.seek(0)
                    pdf = pikepdf.open(input_stream, password="")
                except pikepdf.PasswordError:
                    # Attempt 3: User Password
                    if user_provided_pass:
                        try:
                            input_stream.seek(0)
                            pdf = pikepdf.open(input_stream, password=user_provided_pass)
                        except pikepdf.PasswordError:
                            self.send_error_json(401, "Invalid password provided.")
                            return
                    else:
                        self.send_error_json(401, "Password Required")
                        return

            # --- THE STABLE SAVE ---
            output_buffer = io.BytesIO()
            # In the latest pikepdf, a simple .save() on a decrypted 
            # object automatically saves it as UNLOCKED.
            pdf.save(output_buffer)
            pdf.close()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', 'attachment; filename="unlocked.pdf"')
            self.end_headers()
            self.wfile.write(output_buffer.getvalue())

        except Exception as e:
            self.send_error_json(500, str(e))

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
