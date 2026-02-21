from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

@app.route('/api/maple', methods=['GET'])
def get_maple_data():
    nickname = request.args.get('name')
    api_key = os.environ.get("NEXON_API_KEY") # Vercel 금고에서 키를 가져옴

    headers = {"x-nxopen-api-key": api_key}
    id_url = f"https://open.api.nexon.com/maplestory/v1/id?character_name={nickname}"

    try:
        res = requests.get(id_url, headers=headers)
        if res.status_code == 200:
            return jsonify(res.json())
        else:
            return jsonify({"error": "데이터를 가져오지 못했습니다."}), res.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Vercel 환경을 위한 설정
def handler(event, context):
    return app(event, context)
