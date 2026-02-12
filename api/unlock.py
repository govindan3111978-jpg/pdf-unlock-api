from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import fitz  # This is PyMuPDF
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
        
        # --- THE "FORCE-OPEN" STRATEGY ---
        try:
            # 1. Open the document from memory
            doc = fitz.open(stream=input_data, filetype="pdf")
            
            # 2. If it's encrypted, try to force it open with a blank password
            # (Many 'restricted' files actually use an empty string as the master key)
            if doc.is_encrypted:
                # Try empty string, then try the user provided password
                success = doc.authenticate("")
                if not success and user_pass:
                    success = doc.authenticate(user_pass)
                
                if not success:
                    return jsonify({"error": "This file is strictly 'Open Locked'. Please enter the correct password."}), 401
            
            # 3. RECONSTRUCTION: 
            # We save the file with NO encryption. This strips all permissions,
            # owner passwords, and viewing restrictions in one go.
            output_buffer = io.BytesIO()
            
            # This is the "iLovePDF" magic: Save with encryption=0
            doc.save(output_buffer, 
                     garbage=4, 
                     deflate=True, 
                     clean=True, 
                     encryption=fitz.PDF_ENCRYPT_NONE)
            
            doc.close()
            output_buffer.seek(0)
            
            return send_file(
                output_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"unlocked_{file.filename}"
            )

        except Exception as e:
            return jsonify({"error": f"PDF Engine failed to force open: {str(e)}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
