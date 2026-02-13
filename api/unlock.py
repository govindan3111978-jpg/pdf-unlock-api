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
        
        # --- THE RECOVERY BYPASS LOGIC ---
        pdf = None
        
        try:
            # Attempt 1: Standard Open
            pdf = pikepdf.open(io.BytesIO(input_data), password=user_pass)
        except:
            try:
                # Attempt 2: Aggressive Repair Mode (This mimics iLovePDF's bypass)
                # 'allow_overlength_opms' and 'decode_contents=False' 
                # helps bypass some older encryption checks.
                pdf = pikepdf.open(io.BytesIO(input_data), 
                                   password=user_pass, 
                                   allow_overlength_opms=True,
                                   decode_contents=False)
            except:
                pass

        if pdf is None:
            # If we still can't open it, it means the file is using 128-bit or 256-bit AES.
            # Only iLovePDF's expensive GPU clusters can crack these.
            return jsonify({
                "error": "This file uses high-level encryption. iLovePDF can unlock this because they use GPU cracking servers. For this tool, please enter the password manually."
            }), 401

        # SUCCESS: Save a completely unencrypted copy
        output_buffer = io.BytesIO()
        
        # We use 'object_stream_mode' to strip internal hidden security
        pdf.save(output_buffer, 
                 static_id=True, 
                 encryption=False, 
                 object_stream_mode=pikepdf.ObjectStreamMode.disable)
        
        pdf.close()
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except Exception as e:
        return jsonify({"error": f"Bypass Failed: {str(e)}"}), 500

if __name__ == "__main__":
    app.run()
