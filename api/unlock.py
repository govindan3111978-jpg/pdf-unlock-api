from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import pikepdf
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
        pdf = None
        
        # --- THE MASTER BYPASS LOOP ---
        # We try these passwords in order:
        # 1. No password (None)
        # 2. Empty string ("")
        # 3. The password provided by the user
        passwords_to_try = [None, "", user_pass]
        
        for p in passwords_to_try:
            try:
                if p is None:
                    pdf = pikepdf.open(io.BytesIO(input_data))
                else:
                    pdf = pikepdf.open(io.BytesIO(input_data), password=p)
                
                # If we reached here, the PDF is open!
                break 
            except pikepdf.PasswordError:
                continue
            except Exception:
                continue

        if pdf is None:
            return jsonify({
                "error": "This file is strictly 'Open Locked'. Please enter the password to view the content."
            }), 401

        # SUCCESS: Save a completely unencrypted copy
        output_buffer = io.BytesIO()
        
        # iLovePDF Logic: Save with NO encryption metadata
        pdf.save(output_buffer, 
                 static_id=True, 
                 encryption=False)
        
        pdf.close()
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
