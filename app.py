import os
import glob
import subprocess
import json
import datetime
import yt_dlp
from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)
DOWNLOAD_FOLDER = 'downloads'
GESTURES_FOLDER = 'static/gestures'
EXPORTS_FOLDER = 'exports'  # Zapisujemy wszystko do lokalnego folderu Colaba

os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
os.makedirs(GESTURES_FOLDER, exist_ok=True)
os.makedirs(EXPORTS_FOLDER, exist_ok=True)

download_progress = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/progress')
def get_progress():
    video_url = request.args.get('url')
    return jsonify({"percent": download_progress.get(video_url, "0%")})

@app.route('/api/download', methods=['POST'])
def download_video():
    data = request.json
    url = data.get('url')
    resolution = data.get('resolution', '1080p')
    download_progress[url] = "0%"

    def progress_hook(d):
        if d['status'] == 'downloading':
            download_progress[url] = d.get('_percent_str', '0%').strip()

    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
        'quiet': True
    }
    
    # Odkomentuj to, jeśli na Colabie wgrasz plik cookies.txt by YT nie blokował
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            safe_name = os.path.basename(ydl.prepare_filename(info))
            filepath = os.path.join(DOWNLOAD_FOLDER, safe_name)

            fps = 30.0
            total_frames = 1
            try:
                cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                       'stream=r_frame_rate,nb_frames,duration', '-of', 'json', filepath]
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                stream = json.loads(result.stdout)['streams'][0]
                num, den = map(int, stream['r_frame_rate'].split('/'))
                fps = num / den if den != 0 else 30.0
                if 'nb_frames' in stream: total_frames = int(stream['nb_frames'])
                elif 'duration' in stream: total_frames = int(float(stream['duration']) * fps)
            except: pass

            download_progress[url] = "100%"
            return jsonify({
                "success": True, "file_url": f"/video/{safe_name}",
                "filename": safe_name, "fps": fps, "total_frames": total_frames, "yt_url": url
            })
    except Exception as e:
        download_progress[url] = "Błąd"
        return jsonify({"success": False, "error": str(e)})

@app.route('/video/<filename>')
def serve_video(filename):
    return send_file(os.path.join(DOWNLOAD_FOLDER, filename))

@app.route('/api/gestures', methods=['GET'])
def get_gestures():
    files = glob.glob(os.path.join(GESTURES_FOLDER, '*.*'))
    return jsonify([{"name": os.path.splitext(os.path.basename(f))[0], "icon": f"/{f}"} for f in files])

@app.route('/api/process', methods=['POST'])
def process_data():
    data = request.json
    filename = data.get('filename', 'Wideo')
    
    # Ustalamy nazwę dla eksportu
    base_name = os.path.splitext(filename)[0]
    date_str = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    folder_name = f"{base_name}_{date_str}"
    target_dir = os.path.join(EXPORTS_FOLDER, folder_name)
    os.makedirs(target_dir, exist_ok=True)

    json_data = {
        "plikWideo": filename,
        "url_youtube": data.get('yt_url'),
        "dataWygenerowania": date_str,
        "fps": data.get('fps', 30.0),
        "zakresy": data.get('ranges', [])
    }

    with open(os.path.join(target_dir, 'dane.json'), 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4, ensure_ascii=False)

    return jsonify({"success": True, "time": date_str})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
