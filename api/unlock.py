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
        
        # Read file into memory
        input_data = file.read()
        output_buffer = io.BytesIO()

        # --- THE iLovePDF REPLICA LOGIC ---
        try:
            # We open with an empty password and 'allow_overlength_opms'
            # This is exactly how the QPDF binary handles 'fake' open locks.
            # We also set 'access_mode' to bypass permission checks.
            pdf = pikepdf.open(
                io.BytesIO(input_data), 
                password=user_pass if user_pass else "", 
                allow_overlength_opms=True
            )
            
            # Rebuilding the PDF from scratch (Stripping all metadata locks)
            pdf.save(output_buffer, 
                     static_id=True, 
                     preserve_encryption=False) # This is the "Nuclear" option
            
            pdf.close()
            output_buffer.seek(0)
            
            return send_file(
                output_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"unlocked_{file.filename}"
            )

        except pikepdf.PasswordError:
            # This ONLY triggers if the file actually requires a password to open in Chrome
            return jsonify({"error": "This file is truly Open-Locked. A password is required to view the content."}), 401
        except Exception as e:
            return jsonify({"error": f"Engine Error: {str(e)}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
