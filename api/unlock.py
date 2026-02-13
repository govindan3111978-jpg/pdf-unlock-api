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
        
        # Read the file into memory
        input_data = io.BytesIO(file.read())
        
        try:
            reader = pypdf.PdfReader(input_data)
            
            # If encrypted, try empty string first (iLovePDF logic)
            if reader.is_encrypted:
                # Try empty string bypass
                status = reader.decrypt("")
                
                # If that fails, try the user provided password
                if status == 0 and user_pass:
                    status = reader.decrypt(user_pass)
                
                # If it's still locked, then it's a REAL user password
                if status == 0:
                    return jsonify({"error": "This file is truly password protected. Please enter the Open Password."}), 401

            # --- THE RECONSTRUCTION MAGIC ---
            # Create a brand new PDF writer
            writer = pypdf.PdfWriter()
            
            # Copy pages one by one to a new document
            # This completely ignores and strips all original restrictions
            for page in reader.pages:
                writer.add_page(page)
            
            # Clean up metadata that might contain "Locked" flags
            writer.add_metadata({}) 

            # Save to buffer
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
            return jsonify({"error": f"Bypass failed: {str(e)}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
