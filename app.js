// app.js - uses Tone.js (included via CDN in index.html)
// This file creates a Tone.Player -> PitchShift -> Filter -> Analyser -> Destination
// and draws waveform on canvas. Also includes a simple export (renders audio to offline context).

let player, pitchShift, filter, analyser;
let fileBuffer = null;
let isPlaying = false;

const fileInput = document.getElementById('file');
const filterType = document.getElementById('filterType');
const cutoff = document.getElementById('cutoff');
const cutoffVal = document.getElementById('cutoffVal');
const speed = document.getElementById('speed');
const speedVal = document.getElementById('speedVal');
const pitch = document.getElementById('pitch');
const pitchVal = document.getElementById('pitchVal');
const playBtn = document.getElementById('play');
const stopBtn = document.getElementById('stop');
const exportBtn = document.getElementById('export');

const canvas = document.getElementById('wave');
const ctx = canvas.getContext('2d');

// عرض القيم الأولية على الواجهة
cutoffVal.textContent = cutoff.value;
speedVal.textContent = parseFloat(speed.value).toFixed(2);
pitchVal.textContent = pitch.value;

// تحديث عرض القيمة عند السحب
cutoff.addEventListener('input', ()=> cutoffVal.textContent = cutoff.value);
pitch.addEventListener('input', ()=> pitchVal.textContent = pitch.value);

// ************************************************
// 🔥 التعديل والإضافة الجديدة لتحديث السرعة مباشرة
// ************************************************
speed.addEventListener('input', (e) => {
    const newSpeed = parseFloat(e.target.value);
    speedVal.textContent = newSpeed.toFixed(2);
    
    // إذا كان المشغل موجودًا، قم بتحديث السرعة فوراً للتشغيل المباشر
    if(player && player.buffer) {
        player.playbackRate = newSpeed;
    }
});
// ************************************************

// load file into Tone.Player
fileInput.addEventListener('change', async (e)=>{
    // 1. تفعيل Tone.js Context إذا لم يكن مفعلاً (مهم للتشغيل الأول)
    await Tone.start();
    
    const f = e.target.files[0];
    if(!f) return;
    
    // 2. قراءة الملف كـ ArrayBuffer
    const array = await f.arrayBuffer();
    
    // 3. فك ترميز الصوت عبر WebAudio Context الخاص بـ Tone.js
    const audioBuf = await Tone.getContext().rawContext.decodeAudioData(array);
    fileBuffer = audioBuf;

    // 4. تنظيف المشغل القديم إذا كان موجوداً
    if(player) {
        player.dispose();
        player = null;
    }
    
    // 5. إنشاء مشغل Tone.Player جديد وتعيين الـ buffer يدوياً
    player = new Tone.Player({
        url: audioBuf, // يمكن تمرير AudioBuffer مباشرةً
        autostart: false,
        loop: false,
    });
    // نستخدم الـ buffer مباشرةً في هذه الطريقة
    player.buffer = new Tone.ToneAudioBuffer(fileBuffer); 
    
    // 6. تهيئة سلسلة معالجة الصوت
    setupNodes();
    console.log('file loaded, duration:', fileBuffer.duration);
    
    // تفعيل أزرار التحكم بعد التحميل
    playBtn.disabled = false;
    exportBtn.disabled = false;
});

// setup audio graph
function setupNodes(){
    // dispose old nodes if exist
    if(pitchShift) pitchShift.dispose();
    if(filter) filter.dispose();
    if(analyser) analyser.dispose();

    pitchShift = new Tone.PitchShift(0);
    filter = new Tone.Filter({
        type: 'lowpass',
        frequency: parseFloat(cutoff.value),
        rolloff: -12
    });
    analyser = new Tone.Analyser('waveform', 1024);

    // Player -> PitchShift -> Filter -> Analyser -> Destination
    player.connect(pitchShift);
    pitchShift.connect(filter);
    filter.connect(analyser);
    analyser.toDestination();
}

// draw waveform
function draw(){
    requestAnimationFrame(draw);
    if(!analyser) return;
    const waveform = analyser.getValue();
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#06b6d4';
    ctx.beginPath();
    const slice = canvas.width / waveform.length;
    for(let i=0;i<waveform.length;i++){
        const v = (waveform[i] + 1) / 2; // normalize -1..1 to 0..1
        const y = v * canvas.height;
        if(i===0) ctx.moveTo(0,y);
        else ctx.lineTo(i*slice, y);
    }
    ctx.stroke();
    
    // رسم مؤشر التشغيل
    if (player && isPlaying) {
        // حساب موضع التشغيل بالنسبة للرسم
        const duration = player.buffer.duration;
        const currentPlaybackTime = player.currentTime;
        const progress = (currentPlaybackTime / duration) * canvas.width;
        
        ctx.fillStyle = 'red';
        ctx.fillRect(progress, 0, 2, canvas.height);
    }
}
draw();

// play & stop
playBtn.addEventListener('click', async ()=>{
    if(!player || !fileBuffer) { alert('Upload audio file first'); return; }
    if(!Tone.context.state || Tone.context.state === 'suspended') {
        await Tone.start();
    }
    
    // إذا كان يعمل بالفعل، قم بالإيقاف أولاً
    if(isPlaying) {
        player.stop();
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        return;
    }
    
    // تطبيق البرامترات
    const semitones = parseInt(pitch.value, 10) || 0;
    const speedVal = parseFloat(speed.value) || 1.0;

    pitchShift.pitch = semitones;
    
    // تحديث الفلتر (الربط)
    if(filterType.value === 'none'){
        pitchShift.disconnect(filter);
        pitchShift.connect(analyser);
    } else {
        // إعادة الربط بسلسلة الفلتر والـ Analyser
        pitchShift.disconnect(analyser); 
        pitchShift.connect(filter);
        filter.type = filterType.value;
        filter.frequency.value = parseFloat(cutoff.value);
    }

    // Tone.Player playbackRate controls time; changing pitch separately via PitchShift
    player.playbackRate = speedVal;
    
    // ابدأ من الصفر
    player.start(Tone.now(), 0); 

    isPlaying = true;
    playBtn.textContent = '⏸ Pause';
});

stopBtn.addEventListener('click', ()=> {
    if(player && isPlaying){
        player.stop();
        isPlaying = false;
        playBtn.textContent = '▶ Play';
        // تحديث الـ waveform لإزالة مؤشر التشغيل
        draw(); 
    }
});

filterType.addEventListener('change', (e) => {
    // هذا يسمح بتشغيل التأثير مباشرة دون الضغط على Play
    if (player) {
        if(e.target.value === 'none'){
            pitchShift.disconnect(filter);
            pitchShift.connect(analyser); // تجاوز الفلتر
        } else {
            pitchShift.disconnect(analyser);
            pitchShift.connect(filter); // تفعيل الفلتر
            filter.type = e.target.value;
        }
    }
});

// Export - offline rendering to WAV (simple approach)
exportBtn.addEventListener('click', async ()=>{
    if(!fileBuffer){ alert('Upload audio file first'); return; }
    if(isPlaying) { player.stop(); isPlaying = false; }
    
    exportBtn.disabled = true;
    exportBtn.textContent = 'Rendering...';

    // ... (كود التصدير كما هو في النسخة الأصلية لديك)
    
    // create OfflineAudioContext with same length
    const sampleRate = fileBuffer.sampleRate;
    // يجب تعديل الطول ليتناسب مع السرعة
    const length = Math.ceil(fileBuffer.duration * sampleRate / (parseFloat(speed.value) || 1)); 
    const offlineCtx = new OfflineAudioContext(fileBuffer.numberOfChannels, length, sampleRate);

    // create buffer source with original buffer
    const src = offlineCtx.createBufferSource();
    src.buffer = fileBuffer;
    src.playbackRate.value = parseFloat(speed.value) || 1.0;

    // create biquad
    const biquad = offlineCtx.createBiquadFilter();
    biquad.type = filterType.value === 'none' ? 'lowpass' : filterType.value; // Tone.js PitchShift node requires complex setup in OfflineCtx
    biquad.frequency.value = parseFloat(cutoff.value);
    
    // *** ملاحظة هامة ***:
    // عملية PitchShift (تغيير النغمة بدون تغيير السرعة) معقدة جداً للتصدير في Offline Context العادي.
    // لكي يتم تصدير تأثير PitchShift، ستحتاج إلى استخدام Tone.Offline أو Tone.Context.render()، وهو أكثر تعقيداً.
    // النسخة الحالية تقوم بتطبيق الفلتر والسرعة فقط على التصدير.

    // connect nodes
    if(filterType.value === 'none'){
        src.connect(offlineCtx.destination);
    } else {
        src.connect(biquad);
        biquad.connect(offlineCtx.destination);
    }
    src.start(0);
    const rendered = await offlineCtx.startRendering();

    // convert to WAV
    const wav = audioBufferToWav(rendered);
    const blob = new Blob([new DataView(wav)], {type: 'audio/wav'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed.wav';
    a.click();

    exportBtn.disabled = false;
    exportBtn.textContent = '⬇️ Export Processed (WAV)';
});

// utility: convert AudioBuffer to WAV (Float32 -> 16-bit PCM)
function audioBufferToWav(buffer, opt) {
    opt = opt || {}
    var numChannels = buffer.numberOfChannels
    var sampleRate = buffer.sampleRate
    var format = opt.float32 ? 3 : 1
    var bitDepth = format === 3 ? 32 : 16

    var result
    if (numChannels === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
    } else {
        result = buffer.getChannelData(0)
    }

    return encodeWAV(result, format, sampleRate, numChannels, bitDepth)
}

function interleave(inputL, inputR){
    var length = inputL.length + inputR.length
    var result = new Float32Array(length)

    var index = 0
    var inputIndex = 0

    while (index < length){
        result[index++] = inputL[inputIndex]
        result[index++] = inputR[inputIndex]
        inputIndex++
    }
    return result
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth){
    var bytesPerSample = bitDepth / 8
    var blockAlign = numChannels * bytesPerSample

    var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
    var view = new DataView(buffer)

    /* RIFF identifier */
    writeString(view, 0, 'RIFF')
    /* file length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true)
    /* RIFF type */
    writeString(view, 8, 'WAVE')
    /* format chunk identifier */
    writeString(view, 12, 'fmt ')
    /* format chunk length */
    view.setUint32(16, 16, true)
    /* sample format (raw) */
    view.setUint16(20, format, true)
    /* channel count */
    view.setUint16(22, numChannels, true)
    /* sample rate */
    view.setUint32(24, sampleRate, true)
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true)
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true)
    /* bits per sample */
    view.setUint16(34, bitDepth, true)
    /* data chunk identifier */
    writeString(view, 36, 'data')
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true)
    if (format === 1) { // PCM16
        floatTo16BitPCM(view, 44, samples)
    } else {
        writeFloat32(view, 44, samples)
    }

    return buffer
}

function floatTo16BitPCM(output, offset, input){
    for (var i = 0; i < input.length; i++, offset+=2){
        var s = Math.max(-1, Math.min(1, input[i]))
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
}

function writeFloat32(output, offset, input){
    for (var i = 0; i < input.length; i++, offset+=4){
        output.setFloat32(offset, input[i], true)
    }
}

function writeString(view, offset, string){
    for (var i = 0; i < string.length; i++){
        view.setUint8(offset + i, string.charCodeAt(i))
    }
}
