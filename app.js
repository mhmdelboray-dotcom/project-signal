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

cutoffVal.textContent = cutoff.value;
speedVal.textContent = parseFloat(speed.value).toFixed(2);
pitchVal.textContent = pitch.value;

cutoff.addEventListener('input', ()=> cutoffVal.textContent = cutoff.value);
speed.addEventListener('input', ()=> speedVal.textContent = parseFloat(speed.value).toFixed(2));
pitch.addEventListener('input', ()=> pitchVal.textContent = pitch.value);

// load file into Tone.Player
fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const array = await f.arrayBuffer();
  // decode via Tone (uses WebAudio)
  const audioBuf = await Tone.getContext().rawContext.decodeAudioData(array);
  fileBuffer = audioBuf;
  if(player) {
    player.dispose();
    player = null;
  }
  player = new Tone.Player({
    url: array,
    autostart: false,
    loop: false,
  });
  // we will set buffer manually after creating nodes
  player.buffer = new Tone.ToneAudioBuffer(fileBuffer);
  setupNodes();
  console.log('file loaded, duration:', fileBuffer.duration);
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
}
draw();

// play & stop
playBtn.addEventListener('click', async ()=>{
  if(!player || !fileBuffer) { alert('Upload audio file first'); return; }
  if(!Tone.context.state || Tone.context.state === 'suspended') {
    await Tone.start();
  }
  // apply params
  const semitones = parseInt(pitch.value, 10) || 0;
  const speedVal = parseFloat(speed.value) || 1.0;

  pitchShift.pitch = semitones;
  filter.type = (filterType.value === 'none') ? 'lowpass' : filterType.value;
  filter.frequency.value = parseFloat(cutoff.value);

  // Tone.Player playbackRate controls time; changing pitch separately via PitchShift
  player.playbackRate = speedVal;
  player.start();

  isPlaying = true;
});

stopBtn.addEventListener('click', ()=> {
  if(player && isPlaying){
    player.stop();
    isPlaying = false;
  }
});

// Export - offline rendering to WAV (simple approach)
exportBtn.addEventListener('click', async ()=>{
  if(!fileBuffer){ alert('Upload audio file first'); return; }
  exportBtn.disabled = true;
  exportBtn.textContent = 'Rendering...';

  // create OfflineAudioContext with same length
  const sampleRate = fileBuffer.sampleRate;
  const length = Math.ceil(fileBuffer.duration * sampleRate / (parseFloat(speed.value) || 1));
  const offlineCtx = new OfflineAudioContext(fileBuffer.numberOfChannels, length, sampleRate);

  // create buffer source with original buffer
  const src = offlineCtx.createBufferSource();
  src.buffer = fileBuffer;
  src.playbackRate.value = parseFloat(speed.value) || 1.0;

  // create pitch shift via WebAudio simple approach: we re-sample via playbackRate (pitch shift will affect speed)
  // Note: true pitch-shift without speed change requires complex algorithms (AudioWorklet / libraries).
  // Here we export with playbackRate applied and with filter applied.

  // create biquad
  const biquad = offlineCtx.createBiquadFilter();
  if(filterType.value === 'none'){
    // bypass
  } else {
    biquad.type = filterType.value;
    biquad.frequency.value = parseFloat(cutoff.value);
  }

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
