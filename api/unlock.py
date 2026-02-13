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
            return jsonify({"error": "No file"}), 400
        
        file = request.files['file']
        user_pass = request.form.get('password', '').strip()
        
        input_data = file.read()
        pdf = None
        
        # --- THE iLovePDF LOGIC ---
        # 1. Try opening normally (Strips most restrictions)
        try:
            pdf = pikepdf.open(io.BytesIO(input_data))
        except pikepdf.PasswordError:
            # 2. Try with an empty string password (fixes 'fake' locks)
            try:
                pdf = pikepdf.open(io.BytesIO(input_data), password="")
            except pikepdf.PasswordError:
                # 3. Only if that fails, try the user's password
                if user_pass:
                    try:
                        pdf = pikepdf.open(io.BytesIO(input_data), password=user_pass)
                    except pikepdf.PasswordError:
                        return jsonify({"error": "Wrong password"}), 401
                else:
                    return jsonify({"error": "Password required"}), 401

        # Save without encryption
        output_buffer = io.BytesIO()
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
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run()
