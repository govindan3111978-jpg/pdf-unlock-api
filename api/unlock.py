from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
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
        
        # Read file into memory
        input_data = file.read()
        
        # --- THE TOTAL RECONSTRUCTION METHOD ---
        try:
            # 1. Open the source document
            src_doc = fitz.open(stream=input_data, filetype="pdf")
            
            # 2. If it's encrypted, try to bypass it
            if src_doc.is_encrypted:
                # Try empty password, then user password
                if not src_doc.authenticate("") and not src_doc.authenticate(user_pass):
                    # Only if BOTH fail do we report a password error
                    return jsonify({"error": "This file is truly Open-Locked. Please provide the password."}), 401
            
            # 3. Create a BRAND NEW document (the 'Clean' file)
            dest_doc = fitz.open()
            
            # 4. Copy every page from the source to the destination
            # This 'strips' all original security settings completely
            dest_doc.insert_pdf(src_doc)
            
            # 5. Save the new document to a buffer
            output_buffer = io.BytesIO()
            dest_doc.save(output_buffer)
            
            src_doc.close()
            dest_doc.close()
            
            output_buffer.seek(0)
            
            return send_file(
                output_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"unlocked_{file.filename}"
            )

        except Exception as e:
            # Fallback for very specific encryption types
            return jsonify({"error": f"Bypass failed: {str(e)}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
