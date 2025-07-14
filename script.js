// script.js
let recordings = {
    1: {1: null, 2: null},
    2: {1: null, 2: null},
    3: {1: null, 2: null}
};

let mediaRecorders = {};
let audioChunks = {};

function getKazakhstanTimestamp() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Almaty',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const date = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
    const time = `${parts.find(p => p.type === 'hour').value}-${parts.find(p => p.type === 'minute').value}-${parts.find(p => p.type === 'second').value}`;
    return { date, time };
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function encodeWAV(samples, sampleRate) {
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const bitsPerSample = 16;

    let buffer = new ArrayBuffer(44 + samples.length * 2);
    let view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
}

navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        document.querySelectorAll('.record').forEach(button => {
            button.addEventListener('click', () => {
                const technique = button.dataset.technique;
                const session = button.dataset.session;
                const key = `${technique}-${session}`;
                
                mediaRecorders[key] = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                audioChunks[key] = [];
                
                mediaRecorders[key].addEventListener('dataavailable', event => {
                    audioChunks[key].push(event.data);
                });
                
                mediaRecorders[key].addEventListener('stop', async () => {
                    const webmBlob = new Blob(audioChunks[key], { type: 'audio/webm' });
                    const audioCtx = new AudioContext();
                    const arrayBuf = await webmBlob.arrayBuffer();
                    const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
                    const channelData = audioBuf.getChannelData(0);
                    const sampleRate = audioBuf.sampleRate;
                    const wavBlob = encodeWAV(channelData, sampleRate);
                    await audioCtx.close();

                    const audioUrl = URL.createObjectURL(wavBlob);
                    const audioPlayer = document.querySelector(`.audio-player[data-technique="${technique}"][data-session="${session}"]`);
                    audioPlayer.src = audioUrl;
                    const { date, time } = getKazakhstanTimestamp();
                    recordings[technique][session] = { blob: wavBlob, date, time };

                    const indicator = document.querySelector(`.recording-indicator[data-technique="${technique}"][data-session="${session}"]`);
                    indicator.style.display = 'none';

                    document.querySelector(`.download[data-technique="${technique}"][data-session="${session}"]`).disabled = false;
                    document.querySelector(`.rerecord[data-technique="${technique}"][data-session="${session}"]`).disabled = false;
                    checkAllRecordings();
                });
                
                mediaRecorders[key].start();
                button.disabled = true;
                document.querySelector(`.stop-record[data-technique="${technique}"][data-session="${session}"]`).disabled = false;
                const indicator = document.querySelector(`.recording-indicator[data-technique="${technique}"][data-session="${session}"]`);
                indicator.style.display = 'block';
            });
        });
        
        document.querySelectorAll('.stop-record').forEach(button => {
            button.addEventListener('click', () => {
                const technique = button.dataset.technique;
                const session = button.dataset.session;
                const key = `${technique}-${session}`;
                
                mediaRecorders[key].stop();
                button.disabled = true;
            });
        });
        
        document.querySelectorAll('.rerecord').forEach(button => {
            button.addEventListener('click', () => {
                const technique = button.dataset.technique;
                const session = button.dataset.session;
                const key = `${technique}-${session}`;
                const audioPlayer = document.querySelector(`.audio-player[data-technique="${technique}"][data-session="${session}"]`);
                audioPlayer.src = '';
                recordings[technique][session] = null;
                if (mediaRecorders[key]) {
                    mediaRecorders[key].stop();
                    delete mediaRecorders[key];
                    delete audioChunks[key];
                }
                button.disabled = true;
                document.querySelector(`.download[data-technique="${technique}"][data-session="${session}"]`).disabled = true;
                document.querySelector(`.record[data-technique="${technique}"][data-session="${session}"]`).disabled = false;
                document.querySelector(`.stop-record[data-technique="${technique}"][data-session="${session}"]`).disabled = true;
                const indicator = document.querySelector(`.recording-indicator[data-technique="${technique}"][data-session="${session}"]`);
                indicator.style.display = 'none';
                checkAllRecordings();
            });
        });

        document.querySelectorAll('.download').forEach(button => {
            button.addEventListener('click', () => {
                const technique = button.dataset.technique;
                const session = button.dataset.session;
                const rec = recordings[technique][session];
                if (rec) {
                    const deviceId = localStorage.getItem('deviceId');
                    const url = URL.createObjectURL(rec.blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${deviceId}_technique${technique}_session${session}_${rec.date}_${rec.time}.wav`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            });
        });
    })
    .catch(error => {
        console.error('Error accessing microphone:', error);
    });

function checkAllRecordings() {
    const allRecorded = Object.values(recordings).every(tech => Object.values(tech).every(sess => sess !== null));
    document.getElementById('download-archive').disabled = !allRecorded;
}

document.getElementById('download-archive').addEventListener('click', () => {
    const zip = new JSZip();
    const deviceId = localStorage.getItem('deviceId');
    const { date, time } = getKazakhstanTimestamp();
    
    Object.keys(recordings).forEach(technique => {
        Object.keys(recordings[technique]).forEach(session => {
            const rec = recordings[technique][session];
            if (rec) {
                zip.file(`${deviceId}_technique${technique}_session${session}_${rec.date}_${rec.time}.wav`, rec.blob);
            }
        });
    });
    
    zip.generateAsync({type: 'blob'}).then(content => {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deviceId}_breathing_sessions_${date}_${time}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    });
});

// Generate and display shortened unique device ID
function generateUniqueId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = crypto.randomUUID().substring(0, 8); // Shortened to 8 characters
        localStorage.setItem('deviceId', deviceId);
    } else if (deviceId.length > 8) {
        deviceId = deviceId.substring(0, 8);
        localStorage.setItem('deviceId', deviceId);
    }
    document.getElementById('unique-id').textContent = deviceId;
}

generateUniqueId();

// Copy ID to clipboard
document.getElementById('copy-id').addEventListener('click', () => {
    const idText = document.getElementById('unique-id').textContent;
    navigator.clipboard.writeText(idText).then(() => {
        alert('ID скопирован в буфер обмена!');
    }).catch(err => {
        console.error('Ошибка копирования:', err);
    });
});