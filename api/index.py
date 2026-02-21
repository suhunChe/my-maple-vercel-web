from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

@app.route('/api/maple', methods=['GET'])
def get_maple_data():
    nickname = request.args.get('name')
    # Vercel 환경 변수에서 키를 가져옵니다.
    api_key = os.environ.get("NEXON_API_KEY")
    
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

# 핵심 수정: 기존의 'def handler' 부분을 지우고 아래 한 줄만 남깁니다.
# Vercel은 파일 내의 'app' 객체를 자동으로 찾아 실행합니다.
