import os
import glob
import json
import re
import cv2
import shutil
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# TUTAJ WKLEJ ID SWOJEGO FOLDERU Z DYSKU GOOGLE!
GDRIVE_FOLDER_ID = 'TUTAJ_WKLEJ_ID_FOLDERU'

CREDENTIALS_FILE = 'gdrive_credentials.json'
EXPORTS_DIR = 'exports'
DOWNLOADS_DIR = 'downloads'

def upload_to_drive(file_path, file_name):
    print(f"☁️ Wgrywanie pliku {file_name} na Twój Dysk Google...")
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=['https://www.googleapis.com/auth/drive.file']
    )
    service = build('drive', 'v3', credentials=creds)
    
    file_metadata = {'name': file_name, 'parents': [GDRIVE_FOLDER_ID]}
    media = MediaFileUpload(file_path, mimetype='application/zip', resumable=True)
    
    file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
    print(f"✅ Zakończono wgrywanie! ID Pliku na dysku: {file.get('id')}")

def main():
    projects = glob.glob(os.path.join(EXPORTS_DIR, '*', 'dane.json'))
    if not projects:
        print("❌ Brak nowych plików JSON. Wygeneruj je najpierw w aplikacji.")
        return

    for json_path in projects:
        project_dir = os.path.dirname(json_path)
        project_name = os.path.basename(project_dir)
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        video_path = os.path.join(DOWNLOADS_DIR, data['plikWideo'])
        if not os.path.exists(video_path):
            print(f"⚠️ Nie znaleziono wideo dla projektu {project_name}. Pomijam.")
            continue

        print(f"\n🎬 WYCINANIE KLATEK DLA PROJEKTU: {project_name}")
        cap = cv2.VideoCapture(video_path)
        
        for r in data.get('zakresy', []):
            word = re.sub(r'[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]', '_', r.get('slowo_glowne', 'Nieznany'))
            word_dir = os.path.join(project_dir, word)
            os.makedirs(word_dir, exist_ok=True)
            
            start_f = int(r['glowny_zakres']['start_frame'])
            end_f = int(r['glowny_zakres']['end_frame'])
            
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_f)
            for i in range(start_f, end_f + 1):
                ret, frame = cap.read()
                if not ret: break
                cv2.imwrite(os.path.join(word_dir, f'frame_{i:06d}.jpg'), frame)
            print(f"  -> {word}: wycięto klatki od {start_f} do {end_f}")
        
        cap.release()
        
        # Pakowanie całego folderu z JSONem i Klatkami do ZIPa
        print("📦 Pakowanie plików do archiwum ZIP...")
        zip_path = f"{project_dir}.zip"
        shutil.make_archive(project_dir, 'zip', project_dir)
        
        # Wysłanie na Twój prywatny dysk
        upload_to_drive(zip_path, f"{project_name}.zip")
        
        # Oczyszczanie serwera Colab z wysłanych plików
        os.remove(zip_path)
        shutil.rmtree(project_dir)

if __name__ == '__main__':
    main()
