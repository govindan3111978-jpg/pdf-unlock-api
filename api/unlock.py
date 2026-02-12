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
        user_provided_pass = request.form.get('password', '')

        # Read the file into memory
        input_data = file.read()
        file_stream = io.BytesIO(input_data)

        pdf = None
        
        # --- AGGRESSIVE UNLOCK LOGIC ---
        try:
            # 1. Try opening with NO password (strips Owner/Restriction locks)
            pdf = pikepdf.open(file_stream)
        except pikepdf.PasswordError:
            # 2. If that fails, try with the user-provided password
            if user_provided_pass.strip():
                try:
                    file_stream.seek(0)
                    pdf = pikepdf.open(file_stream, password=user_provided_pass)
                except pikepdf.PasswordError:
                    return jsonify({"error": "Incorrect password. This file is 'Open Locked'."}), 401
            else:
                # 3. If no password was provided and step 1 failed
                return jsonify({"error": "This file requires an 'Open Password' to view the content."}), 401
        except Exception as e:
            return jsonify({"error": f"Could not read PDF: {str(e)}"}), 400

        # Create the unlocked version
        output_buffer = io.BytesIO()
        
        # We save it without any encryption settings (this is what iLovePDF does)
        pdf.save(output_buffer)
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
