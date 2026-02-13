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
        
        # Read the file into memory once
        input_data = file.read()
        
        # Common default passwords to try automatically
        ghost_passwords = [None, "", "password", "123456", "1234", "0000"]
        if user_pass:
            ghost_passwords.insert(0, user_pass)

        pdf = None
        last_error = "Unknown Error"

        for attempt_pass in ghost_passwords:
            try:
                # IMPORTANT: Create a fresh stream for every attempt
                # This fixes the "Unexpected Error" crash
                stream = io.BytesIO(input_data)
                
                if attempt_pass is None:
                    pdf = pikepdf.open(stream)
                else:
                    pdf = pikepdf.open(stream, password=attempt_pass)
                
                # If it opens, stop the loop
                break
            except pikepdf.PasswordError:
                last_error = "Password required"
                continue
            except Exception as e:
                last_error = str(e)
                continue

        if pdf is None:
            if "Password" in last_error or "password" in last_error:
                return jsonify({"error": "This file is protected by a strong User Password. Please provide the correct password to decrypt the content."}), 401
            else:
                return jsonify({"error": "The PDF file is corrupted or uses an unsupported encryption format."}), 400

        # Success: Save as a clean file
        output_buffer = io.BytesIO()
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
        # If the file is too big for Vercel (over 5MB), it might hit a timeout
        return jsonify({"error": "The server was unable to process this file. It might be too large or complex."}), 500

if __name__ == "__main__":
    app.run()
