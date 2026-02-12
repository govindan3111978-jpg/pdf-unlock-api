from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import pikepdf
import pypdf
import io

app = Flask(__name__)
CORS(app)

@app.route('/api/unlock', methods=['POST'])
def unlock_pdf():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        user_pass = request.form.get('password', '').strip()
        
        input_data = file.read()
        output_buffer = io.BytesIO()

        # --- ATTEMPT 1: PIKEPDF (PRO ENGINE) ---
        try:
            # Try with no password AND explicit empty password
            # Professional tools try "" because many restricted files use it as a default
            pdf = pikepdf.open(io.BytesIO(input_data), password=user_pass if user_pass else "")
            pdf.save(output_buffer)
            pdf.close()
            return serve_pdf(output_buffer, file.filename)
        except (pikepdf.PasswordError, Exception):
            pass # Move to next attempt

        # --- ATTEMPT 2: PYPDF (LENIENT ENGINE) ---
        # pypdf is often more 'lazy' and can sometimes bypass 
        # encryption headers that C++ libraries (like pikepdf) find too strict.
        try:
            reader = pypdf.PdfReader(io.BytesIO(input_data))
            if reader.is_encrypted:
                reader.decrypt(user_pass if user_pass else "")
            
            writer = pypdf.PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            
            writer.write(output_buffer)
            return serve_pdf(output_buffer, file.filename)
        except Exception:
            pass # Move to final check

        # --- FINAL CHECK: IF TRULY LOCKED ---
        if not user_pass:
            return jsonify({"error": "This file is strictly 'Open Locked'. Please enter the password to view the content."}), 401
        else:
            return jsonify({"error": "Incorrect password. The file could not be decrypted."}), 401

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

def serve_pdf(buffer, filename):
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"unlocked_{filename}"
    )

if __name__ == "__main__":
    app.run()
