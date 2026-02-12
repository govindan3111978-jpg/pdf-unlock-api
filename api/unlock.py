from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import pikepdf
import io

app = Flask(__name__)
CORS(app)

@app.route('/api/unlock', methods=['POST'])
def unlock_pdf():
    try:
        # Check if file exists in request
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        password = request.form.get('password', '')

        # Read the uploaded PDF into memory
        input_data = file.read()
        
        try:
            # pikepdf logic: 
            # Opening the file with pikepdf automatically strips 
            # 'Owner' passwords and restrictions (printing, copying, etc.)
            if password.strip():
                pdf = pikepdf.open(io.BytesIO(input_data), password=password)
            else:
                # This is the "Instant Unlock" magic
                pdf = pikepdf.open(io.BytesIO(input_data))
        except pikepdf.PasswordError:
            return jsonify({"error": "This file is 'Open Locked'. Please enter the correct password."}), 401
        except Exception as e:
            return jsonify({"error": f"PDF Engine Error: {str(e)}"}), 400

        # Save the now-unrestricted PDF to a new buffer
        output_buffer = io.BytesIO()
        pdf.save(output_buffer)
        output_buffer.seek(0)

        # Send the file back to the browser
        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

# This is required for Vercel to recognize the Flask app
def handler(req, res):
    return app(req, res)
