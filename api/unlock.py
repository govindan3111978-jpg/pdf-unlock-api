from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
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
        
        # Read the PDF into memory
        input_stream = io.BytesIO(file.read())
        
        try:
            reader = pypdf.PdfReader(input_stream)
            
            # --- THE REAL DECRYPTION LOGIC ---
            if reader.is_encrypted:
                # Try opening with an empty password (iLovePDF method)
                # If that fails, use the user's password
                try:
                    reader.decrypt(user_pass if user_pass else "")
                except:
                    return jsonify({"error": "Incorrect password. This file is view-locked."}), 401

            # Create a brand new PDF writer
            writer = pypdf.PdfWriter()
            
            # We copy pages and DECRYPT them in the process
            for page in reader.pages:
                writer.add_page(page)

            # Save the clean PDF to a buffer
            output_buffer = io.BytesIO()
            writer.write(output_buffer)
            output_buffer.seek(0)

            return send_file(
                output_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"unlocked_{file.filename}"
            )

        except Exception as e:
            return jsonify({"error": f"Process failed: {str(e)}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

# Required for Vercel
def handler(req, res):
    return app(req, res)
