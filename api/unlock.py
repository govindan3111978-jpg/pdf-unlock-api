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
        
        # --- THE iLovePDF "GHOST BYPASS" LIST ---
        # These are common default passwords used by PDF creators and printers
        # that allow tools like iLovePDF to open files "instantly"
        ghost_passwords = [
            None, "", "password", "123456", "1234", "owner", 
            "admin", "0000", "user", "root", "pdf", "1111"
        ]
        
        # Add the user's provided password to the front of the list
        if user_pass:
            ghost_passwords.insert(0, user_pass)

        pdf = None
        for attempt_pass in ghost_passwords:
            try:
                if attempt_pass is None:
                    pdf = pikepdf.open(io.BytesIO(input_data))
                else:
                    pdf = pikepdf.open(io.BytesIO(input_data), password=attempt_pass)
                
                # If we get here, we successfully bypassed it!
                break
            except (pikepdf.PasswordError, Exception):
                continue

        if pdf is None:
            return jsonify({"error": "This file is strongly encrypted. iLovePDF likely uses a massive database of passwords for this. Please provide the Open Password manually."}), 401

        # Save as a clean, unencrypted file
        output_buffer = io.BytesIO()
        pdf.save(output_buffer, preserve_encryption=False)
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
