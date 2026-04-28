import os
import glob
import subprocess
import json
import datetime
import re

import yt_dlp
from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)
DOWNLOAD_FOLDER = 'downloads'
GESTURES_FOLDER = 'static/gestures'
EXPORTS_FOLDER = 'exports'  # Nowy folder na wyniki

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
            percent = d.get('_percent_str', '0%').strip()
            download_progress[url] = percent

    res_map = {
        "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
        "720p": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
        "480p": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]"
    }

    ydl_opts = {
        'format': res_map.get(resolution, res_map["1080p"]),
        'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
        'quiet': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            safe_name = os.path.basename(filename)
            filepath = os.path.join(DOWNLOAD_FOLDER, safe_name)

            fps = 30.0
            total_frames = 1
            try:
                cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                       'stream=r_frame_rate,nb_frames,duration', '-of', 'json', filepath]
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                probe_data = json.loads(result.stdout)
                stream = probe_data['streams'][0]

                num, den = map(int, stream['r_frame_rate'].split('/'))
                fps = num / den if den != 0 else 30.0

                if 'nb_frames' in stream:
                    total_frames = int(stream['nb_frames'])
                elif 'duration' in stream:
                    total_frames = int(float(stream['duration']) * fps)
            except Exception as probe_e:
                print("FFprobe error:", probe_e)

            download_progress[url] = "100%"
            return jsonify({
                "success": True,
                "file_url": f"/video/{safe_name}",
                "filename": safe_name,
                "fps": fps,
                "total_frames": total_frames,
                "yt_url": url
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
    gestures = [{"name": os.path.splitext(os.path.basename(f))[0].replace('_', ' ').title(), "icon": f"/{f}"} for f in
                files]
    return jsonify(gestures)


@app.route('/api/process', methods=['POST'])
def process_data():
    data = request.json
    filename = data.get('filename', 'Wideo')
    yt_url = data.get('yt_url', None)
    fps = data.get('fps', 30.0)
    ranges = data.get('ranges', [])
    extract_frames = data.get('extract_frames', False)

    start_time = datetime.datetime.now()

    # Przygotowanie nazwy folderu
    base_name = os.path.splitext(filename)[0]
    if base_name in ["Brak wczytanego wideo", "Pobieranie z YT..."]:
        base_name = "Wideo"

    date_str = start_time.strftime("%Y-%m-%d_%H-%M-%S")
    folder_name = f"{base_name}_dane_{date_str}"
    target_dir = os.path.join(EXPORTS_FOLDER, folder_name)
    os.makedirs(target_dir, exist_ok=True)

    # Przetwarzanie i wyciąganie klatek przez FFmpeg (jeśli zażądano)
    if extract_frames and filename and os.path.exists(os.path.join(DOWNLOAD_FOLDER, filename)):
        filepath = os.path.join(DOWNLOAD_FOLDER, filename)

        for r in ranges:
            word = r.get('slowo_glowne', 'Nieznany')
            # Sanityzacja nazwy folderu dla słowa
            safe_word = re.sub(r'[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]', '_', word)
            word_dir = os.path.join(target_dir, safe_word)
            os.makedirs(word_dir, exist_ok=True)

            start_f = r['glowny_zakres']['start_frame']
            end_f = r['glowny_zakres']['end_frame']

            # Wzór dla zapisywanych klatek
            out_pattern = os.path.join(word_dir, 'frame_%06d.jpg')

            # Komenda FFmpeg do precyzyjnego wyciągnięcia danego zakresu klatek
            cmd = [
                'ffmpeg', '-y', '-v', 'error',
                '-i', filepath,
                '-vf', f"select='between(n\,{start_f}\,{end_f})'",
                '-vsync', '0',
                '-frame_pts', '1',
                out_pattern
            ]
            subprocess.run(cmd)

    end_time = datetime.datetime.now()
    processing_time = str(end_time - start_time)

    # Budowa struktury JSON do zapisu
    json_data = {
        "plikWideo": filename,
        "url_youtube": yt_url,
        "dataWygenerowania": start_time.strftime("%Y-%m-%d %H:%M:%S"),
        "czasWykonaniaZapisywania": processing_time,
        "wyciagnieto_klatki": extract_frames,
        "fps": fps,
        "zakresy": ranges
    }

    with open(os.path.join(target_dir, 'informacje_o_gestach.json'), 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4, ensure_ascii=False)

    return jsonify({"success": True, "folder": target_dir, "time": processing_time})


if __name__ == '__main__':
    # Usunęliśmy app.run(debug=True) i daliśmy host='0.0.0.0'
    app.run(host='0.0.0.0', port=5000)
