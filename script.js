let video = document.getElementById('videoPlayer');
let playBtn = document.getElementById('playBtn');
let timeLabel = document.getElementById('timeLabel');
let trimLabel = document.getElementById('trimLabel');
let fps = 30.0; let totalFrames = 1; let currentFrame = 0;
let savedRanges = []; let editingRangeId = null;

let tracks = [
    { name: "Główny", start: 0, end: 0, color: "#2E7D32" },
    { name: "Mimika", start: 0, end: 0, color: "#1976D2" },
    { name: "L Dłoń", start: 0, end: 0, color: "#E64A19" },
    { name: "P Dłoń", start: 0, end: 0, color: "#FBC02D" }
];
const canvas = document.getElementById('timelineCanvas');
const ctx = canvas.getContext('2d');
let dragging = null; let hoveredTrackIndex = 0; const margin = 20;

// Budowanie obiektów gestów na podstawie listy z config.js
let globalGestures = PLIKI_GESTOW.map(filename => {
    // Odcinamy samo rozszerzenie (np. .png) i zachowujemy dokładną nazwę z configu
    let exactName = filename.replace(/\.[^/.]+$/, "");
    return { name: exactName, icon: `ListaGestow/${filename}` };
});

window.onload = () => {
    resizeTimeline();
    // Ładowanie wygenerowanych gestów do interfejsu (Combo Boxy)
    populateDropdown('leftHandMenu', 'leftHandInput', 'left', globalGestures);
    populateDropdown('rightHandMenu', 'rightHandInput', 'right', globalGestures);
};

// ==========================================
// RESZTA KODU (OSIE CZASU I ZAPISYWANIE)
// ==========================================
window.addEventListener('resize', resizeTimeline);
function resizeTimeline() {
    if (!canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; drawTimeline();
}

function updateLabels() {
    timeLabel.textContent = `${formatTime(currentFrame)} / ${formatTime(totalFrames)}`;
    trimLabel.textContent = `Klatka: ${currentFrame}`;
}

function formatTime(frame) {
    const totalSecs = frame / fps; if (isNaN(totalSecs)) return "00:00.00";
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
    const ms = Math.floor((totalSecs % 1) * 100).toString().padStart(2, '0');
    return `${m}:${s}.${ms}`;
}

document.getElementById('videoUploader').addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    document.getElementById('fileNameDisplay').textContent = file.name;
    document.getElementById('fileFpsDisplay').textContent = "Analizowanie klatek...";
    cancelEdit();
    const mp4boxfile = MP4Box.createFile();
    mp4boxfile.onReady = function(info) {
        const videoTrack = info.videoTracks[0];
        if (videoTrack) {
            const durationSeconds = videoTrack.duration / videoTrack.timescale;
            const detectedFps = videoTrack.nb_samples / durationSeconds;
            initVideoState(URL.createObjectURL(file), detectedFps, videoTrack.nb_samples);
        }
    };
    const reader = new FileReader();
    reader.onload = function(e) { const buffer = e.target.result; buffer.fileStart = 0; mp4boxfile.appendBuffer(buffer); mp4boxfile.flush(); };
    reader.readAsArrayBuffer(file.slice(0, 5000 * 1024));
});

function initVideoState(url, detectedFps, detectedFrames) {
    fps = detectedFps; totalFrames = detectedFrames; video.src = url;
    video.onloadedmetadata = () => { resetTracksToFullRange(); currentFrame = 0; document.getElementById('fileFpsDisplay').textContent = `${fps.toFixed(2)} FPS | ${totalFrames} Klatek`; updateLabels(); };
}

function drawRoundedRect(ctx, x, y, w, h, r, color) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fillStyle = color; ctx.fill(); ctx.closePath();
}
function frameToX(frame) { return margin + (frame / Math.max(1, totalFrames - 1)) * (canvas.width - 2 * margin); }
function xToFrame(x) { let ratio = (x - margin) / (canvas.width - 2 * margin); return Math.max(0, Math.min(totalFrames - 1, Math.round(ratio * (totalFrames - 1)))); }

function drawTimeline() {
    if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height);
    const row_h = 40; const track_h = 20; const padding = (row_h - track_h) / 2; const top_offset = 5;
    tracks.forEach((track, i) => {
        const y = top_offset + i * row_h + padding;
        drawRoundedRect(ctx, margin, y, canvas.width - 2 * margin, track_h, 8, "#16181A");
        const x_start = frameToX(track.start); const x_end = frameToX(track.end);
        drawRoundedRect(ctx, x_start, y, Math.max(2, x_end - x_start), track_h, 8, track.color);
        const handle_w = 12; drawRoundedRect(ctx, x_start - handle_w / 2, y - 2, handle_w, track_h + 4, 4, "#8EB2D6"); drawRoundedRect(ctx, x_end - handle_w / 2, y - 2, handle_w, track_h + 4, 4, "#8EB2D6");
        ctx.fillStyle = "#A0AAB5"; ctx.font = "12px Consolas"; ctx.fillText(`${track.name}: ${track.start} - ${track.end}`, margin, y - 4);
    });
    const x_curr = frameToX(currentFrame); ctx.beginPath(); ctx.strokeStyle = "#E53935"; ctx.lineWidth = 2; ctx.moveTo(x_curr, 0); ctx.lineTo(x_curr, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle = "#E53935"; ctx.moveTo(x_curr - 9, 0); ctx.lineTo(x_curr + 9, 0); ctx.lineTo(x_curr, 10); ctx.fill();
}

function enforceConstraints(changedTrackIndex) {
    const main = tracks[0];
    if (changedTrackIndex === 0) {
        for(let i=1; i<4; i++) {
            if (tracks[i].start < main.start) tracks[i].start = main.start; 
            if (tracks[i].end > main.end) tracks[i].end = main.end; 
            if (tracks[i].end < tracks[i].start) tracks[i].end = tracks[i].start;
        }
    } else {
        const t = tracks[changedTrackIndex];
        if (t.start < main.start) t.start = main.start; 
        if (t.end > main.end) t.end = main.end; 
        if (t.start > t.end) { let temp = t.start; t.start = t.end; t.end = temp; }
    }
}

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const clickedTrack = Math.floor((y - 5) / 40);
    if (clickedTrack >= 0 && clickedTrack < 4) {
        const tr = tracks[clickedTrack]; const sx = frameToX(tr.start); const ex = frameToX(tr.end);
        if (Math.abs(x - sx) < 15) dragging = { track: clickedTrack, type: 'start' };
        else if (Math.abs(x - ex) < 15) dragging = { track: clickedTrack, type: 'end' };
        else { dragging = { type: 'playhead' }; currentFrame = xToFrame(x); video.currentTime = currentFrame / fps; drawTimeline(); updateLabels(); }
    } else { dragging = { type: 'playhead' }; currentFrame = xToFrame(x); video.currentTime = currentFrame / fps; drawTimeline(); updateLabels(); }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect(); const y = e.clientY - rect.top;
    let trackIndex = Math.floor((y - 5) / 40);
    if (trackIndex >= 0 && trackIndex < 4) hoveredTrackIndex = trackIndex;
    if (!dragging) return;
    const frame = xToFrame(e.clientX - rect.left);
    if (dragging.type === 'playhead') { currentFrame = frame; video.currentTime = currentFrame / fps; }
    else { const t = tracks[dragging.track]; if (dragging.type === 'start') t.start = frame; if (dragging.type === 'end') t.end = frame; enforceConstraints(dragging.track); }
    drawTimeline(); updateLabels();
});
window.addEventListener('mouseup', () => dragging = null);
canvas.addEventListener('mouseleave', () => { dragging = null; hoveredTrackIndex = 0; });

function togglePlay() { if (video.paused) { video.play(); playBtn.textContent = '||'; playBtn.classList.add('playing'); } else { video.pause(); playBtn.textContent = '▶'; playBtn.classList.remove('playing'); } }
function skipFrames(offset) { if (!video.src) return; currentFrame = Math.max(0, Math.min(totalFrames - 1, currentFrame + offset)); video.currentTime = currentFrame / fps; drawTimeline(); updateLabels(); }
function setInPoint() { tracks[hoveredTrackIndex].start = currentFrame; enforceConstraints(hoveredTrackIndex); drawTimeline(); }
function setOutPoint() { tracks[hoveredTrackIndex].end = currentFrame; enforceConstraints(hoveredTrackIndex); drawTimeline(); }
video.addEventListener('timeupdate', () => { if (!video.paused) { currentFrame = Math.round(video.currentTime * fps); drawTimeline(); updateLabels(); } });
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key.toLowerCase() === 'i') setInPoint(); if (e.key.toLowerCase() === 'o') setOutPoint();
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); skipFrames(-1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); skipFrames(1); }
});

// ==========================================
// UI COMBO BOX GESTÓW
// ==========================================
function toggleDropdown(menuId, event) {
    if (event) event.stopPropagation(); 
    document.querySelectorAll('.dropdown-menu-custom').forEach(d => { if (d.id !== menuId) d.style.display = 'none'; });
    const el = document.getElementById(menuId);
    el.style.display = 'flex';
}

function filterDropdown(menuId, searchText) {
    const items = document.querySelectorAll(`#${menuId} .dropdown-item-custom`); 
    const lowerSearch = searchText.toLowerCase();
    items.forEach(item => { 
        const gestureName = item.querySelector('.gesture-name').innerText.toLowerCase(); 
        item.style.display = gestureName.includes(lowerSearch) ? 'flex' : 'none'; 
    });
}

function populateDropdown(menuId, inputId, side, gestures) {
    const listContainer = document.querySelector(`#${menuId} .gesture-list`);
    const imgClass = (side === 'right') ? 'mirrored-icon' : ''; 
    listContainer.innerHTML = '';
    
    gestures.forEach(g => {
        let item = document.createElement('div'); item.className = 'dropdown-item-custom';
        if(g.icon) {
            item.innerHTML = `<img src="${g.icon}" class="${imgClass}" onerror="this.style.display='none'"> <span class="gesture-name">${g.name}</span>`;
        } else {
            item.innerHTML = `<span class="gesture-name px-2">${g.name}</span>`;
        }
        item.onclick = () => { 
            document.getElementById(inputId).value = g.name; 
            document.getElementById(menuId).style.display = 'none'; 
        };
        listContainer.appendChild(item);
    });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.custom-dropdown')) { document.querySelectorAll('.dropdown-menu-custom').forEach(d => d.style.display = 'none'); } });

// ==========================================
// DODAWANIE I ZAPIS
// ==========================================
function showToast(msg) { const toast = document.getElementById('successToast'); toast.textContent = msg; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 2500); }
function resetTracksToFullRange() { const maxF = Math.max(0, totalFrames - 1); tracks.forEach(t => { t.start = 0; t.end = maxF; }); drawTimeline(); }

function saveCurrentRanges() {
    const word = document.getElementById('gestureWord').value.trim() || "Nieznany";
    let leftGesture = document.getElementById('leftHandInput').value.trim() || "Brak";
    let rightGesture = document.getElementById('rightHandInput').value.trim() || "Brak";

    if (tracks[0].start === tracks[0].end && tracks[0].start === 0 && !editingRangeId) { alert("Zaznacz poprawne granice gestu przed dodaniem."); return; }

    const newEntry = {
        id: editingRangeId ? editingRangeId : Date.now(), word: word, main: { ...tracks[0] }, mimic: { ...tracks[1] },
        lHand: { ...tracks[2], gesture: leftGesture }, rHand: { ...tracks[3], gesture: rightGesture }
    };

    if (editingRangeId) { 
        const idx = savedRanges.findIndex(x => x.id === editingRangeId); 
        if(idx !== -1) savedRanges[idx] = newEntry; 
        showToast("✅ Zaktualizowano pomyślnie!"); 
    } else { 
        savedRanges.push(newEntry); 
        showToast("✅ Dodano zakres pomyślnie!"); 
    }
    updateRangesUI(); cancelEdit();
}

function cancelEdit() {
    editingRangeId = null; resetTracksToFullRange(); 
    document.getElementById('gestureWord').value = ""; 
    document.getElementById('leftHandInput').value = ""; 
    document.getElementById('rightHandInput').value = "";
    
    const btn = document.getElementById('actionRangeBtn'); 
    btn.innerHTML = "➕ Dodaj ułożony zakres"; 
    btn.classList.remove('btn-edit-mode'); 
    document.getElementById('cancelEditBtn').style.display = 'none';
}

function editRange(id) {
    const r = savedRanges.find(x => x.id === id); if (!r) return; 
    editingRangeId = id;
    tracks[0] = { ...r.main, color: tracks[0].color }; tracks[1] = { ...r.mimic, color: tracks[1].color }; tracks[2] = { ...r.lHand, color: tracks[2].color }; tracks[3] = { ...r.rHand, color: tracks[3].color };
    
    document.getElementById('gestureWord').value = r.word;
    document.getElementById('leftHandInput').value = r.lHand.gesture !== "Brak" ? r.lHand.gesture : ""; 
    document.getElementById('rightHandInput').value = r.rHand.gesture !== "Brak" ? r.rHand.gesture : "";
    
    drawTimeline();
    const btn = document.getElementById('actionRangeBtn'); btn.innerHTML = "💾 Zapisz edytowany zakres"; btn.classList.add('btn-edit-mode'); document.getElementById('cancelEditBtn').style.display = 'inline-block';
    currentFrame = tracks[0].start; video.currentTime = currentFrame / fps; updateLabels();
}

function deleteRange(id) { if (editingRangeId === id) cancelEdit(); savedRanges = savedRanges.filter(r => r.id !== id); updateRangesUI(); }

function updateRangesUI() {
    const list = document.getElementById('rangesList'); list.innerHTML = '';
    savedRanges.forEach(r => {
        list.innerHTML += `
            <div class="p-2 mb-2" style="background: #16181A; border-radius: 6px; border: 1px solid #383A40;">
                <div class="fw-bold text-success mb-1">📝 ${r.word} [${r.main.start}-${r.main.end}]</div>
                <div class="small text-light-muted">🎭 Mimika: ${r.mimic.start}-${r.mimic.end}</div>
                <div class="small text-light-muted">👈 L dłoń: ${r.lHand.gesture} [${r.lHand.start}-${r.lHand.end}]</div>
                <div class="small text-light-muted">👉 P dłoń: ${r.rHand.gesture} [${r.rHand.start}-${r.rHand.end}]</div>
                <div class="mt-2 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-warning py-0" onclick="editRange(${r.id})">Edytuj</button>
                    <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteRange(${r.id})">Usuń</button>
                </div>
            </div>`;
    });
}

function downloadJSON() {
    if (savedRanges.length === 0) return alert("Najpierw wgraj plik wideo i dodaj co najmniej jeden zakres!");

    const payload = {
        plikWideo: document.getElementById('fileNameDisplay').textContent,
        fps: fps,
        dataWygenerowania: new Date().toLocaleString(),
        zakresy: savedRanges.map(r => ({
            slowo_glowne: r.word, 
            glowny_zakres: { start_frame: r.main.start, end_frame: r.main.end },
            mimika_zakres: { start_frame: r.mimic.start, end_frame: r.mimic.end },
            lewa_dlon: { gest: r.lHand.gesture, start_frame: r.lHand.start, end_frame: r.lHand.end },
            prawa_dlon: { gest: r.rHand.gesture, start_frame: r.rHand.start, end_frame: r.rHand.end }
        }))
    };

    const dataStr = JSON.stringify(payload, null, 4);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `adnotacje_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function extractCurrentFrame() {
    if (!video.src) return alert("Wczytaj wideo!");
    const cvs = document.createElement('canvas');
    cvs.width = video.videoWidth;
    cvs.height = video.videoHeight;
    cvs.getContext('2d').drawImage(video, 0, 0, cvs.width, cvs.height);
    
    const dataURL = cvs.toDataURL('image/jpeg', 0.9);
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `klatka_${currentFrame}.jpg`;
    a.click();
}
