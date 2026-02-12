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
        password = request.form.get('password', '')
        
        # Read the PDF
        try:
            if password.strip():
                pdf = pikepdf.open(file, password=password)
            else:
                # Instant unlock (strips owner restrictions)
                pdf = pikepdf.open(file)
        except pikepdf.PasswordError:
            return jsonify({"error": "Correct password required to open this file."}), 401
        except Exception:
            return jsonify({"error": "This PDF is either corrupted or unsupported."}), 400

        # Save to memory
        output_buffer = io.BytesIO()
        pdf.save(output_buffer)
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"unlocked_{file.filename}"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# This allows Vercel to see the app
if __name__ == "__main__":
    app.run()
