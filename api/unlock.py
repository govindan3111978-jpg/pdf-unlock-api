from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import pikepdf
import io
import os

app = Flask(__name__)
CORS(app) # This fixes the "Server Connection Error"

@app.route('/api/unlock', methods=['POST'])
def unlock_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    password = request.form.get('password', '')
    
    try:
        # Open the PDF
        # pikepdf uses the real QPDF engine. 
        # It strips owner restrictions (printing/editing) automatically.
        if password.strip():
            pdf = pikepdf.open(file, password=password)
        else:
            pdf = pikepdf.open(file)
            
        # Save to a memory buffer
        out = io.BytesIO()
        pdf.save(out)
        out.seek(0)
        
        return send_file(
            out,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except pikepdf.PasswordError:
        return jsonify({"error": "This file is password protected. Please enter the correct password."}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Required for Vercel
def handler(req, res):
    return app(req, res)
