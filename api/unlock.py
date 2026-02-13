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
        
        # Aggressive Bypass Logic
        ghost_passwords = [None, "", "password", "123456", "1234", "0000"]
        if user_pass:
            ghost_passwords.insert(0, user_pass)

        pdf = None
        for attempt_pass in ghost_passwords:
            try:
                if attempt_pass is None:
                    pdf = pikepdf.open(io.BytesIO(input_data))
                else:
                    pdf = pikepdf.open(io.BytesIO(input_data), password=attempt_pass)
                break
            except:
                continue

        if pdf is None:
            # BRANDING REMOVED: Generic professional error message
            return jsonify({
                "error": "This file is strongly encrypted with a User Password. Please provide the Open Password manually to decrypt the content."
            }), 401

        output_buffer = io.BytesIO()
        # Strip all encryption and restrictions
        pdf.save(output_buffer, preserve_encryption=False, static_id=True)
        pdf.close()
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except Exception as e:
        return jsonify({"error": "An unexpected error occurred during processing."}), 500

if __name__ == "__main__":
    app.run()
