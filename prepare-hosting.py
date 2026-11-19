from pathlib import Path
import shutil
root = Path(__file__).resolve().parent
public = root / 'public'
public.mkdir(exist_ok=True)
files = ['index.html', 'style.css', 'app.js', 'cloud.js', 'cloud-config.json', 'connect.html', 'history.html', 'history-data.json', 'history-editor.js', 'rehearsals.html', 'rehearsals.js', 'rehearsal-model.js', 'schedule-ui.css', 'rakugo-theme.css', 'records.css', 'logo.jpg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'install.js', 'sw.js', 'record-transfer.js']
for name in files:
    shutil.copy2(root / name, public / name)
print(f'Prepared {len(files)} public application files')
