// FFmpeg (loaded via CDN)
const { createFFmpeg, fetchFile } = FFmpeg;
let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

// Video data
let videoData = null;
let videoFile = null;
let currentGifBlob = null;

// Theme
let isDayMode = false;

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const dropZone = document.getElementById('drop-zone');
const editor = document.getElementById('editor');
const videoPlayer = document.getElementById('video-player');
const selectFileBtn = document.getElementById('select-file-btn');
const fileInput = document.getElementById('file-input');
const changeVideoBtn = document.getElementById('change-video-btn');
const startTimeSlider = document.getElementById('start-time');
const endTimeSlider = document.getElementById('end-time');
const startTimeDisplay = document.getElementById('start-time-display');
const endTimeDisplay = document.getElementById('end-time-display');
const durationDisplay = document.getElementById('duration-display');
const startTimeInput = document.getElementById('start-time-input');
const endTimeInput = document.getElementById('end-time-input');
const durationInput = document.getElementById('duration-input');
const outputWidthInput = document.getElementById('output-width');
const outputHeightInput = document.getElementById('output-height');
const originalSizeDisplay = document.getElementById('original-size');
const resetSizeBtn = document.getElementById('reset-size-btn');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');
const predictedSizeDisplay = document.getElementById('predicted-size');
const sizeWarning = document.getElementById('size-warning');
const createGifBtn = document.getElementById('create-gif-btn');
const resetBtn = document.getElementById('reset-btn');
const progressSection = document.getElementById('progress-section');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressMessage = document.getElementById('progress-message');
const resultSection = document.getElementById('result-section');
const resultGif = document.getElementById('result-gif');
const resultSize = document.getElementById('result-size');
const downloadBtn = document.getElementById('download-btn');

console.log('App.js loaded');

// Load FFmpeg
async function loadFFmpegInstance() {
  if (ffmpegLoaded || ffmpegLoading) return;
  ffmpegLoading = true;

  try {
    progressMessage.textContent = 'FFmpegを読み込み中...';

    ffmpeg = createFFmpeg({
      log: true,
      progress: ({ ratio }) => {
        const percent = Math.round(ratio * 100);
        progressBarFill.style.width = `${percent}%`;
        progressMessage.textContent = `変換中... ${percent}%`;
      }
    });

    await ffmpeg.load();
    ffmpegLoaded = true;
    console.log('FFmpeg loaded successfully');
  } catch (error) {
    console.error('Failed to load FFmpeg:', error);
    throw error;
  } finally {
    ffmpegLoading = false;
  }
}

// Theme toggle
themeToggle.addEventListener('click', () => {
  isDayMode = !isDayMode;
  document.body.classList.toggle('day-mode', isDayMode);
  updatePredictedSize();
});

// Format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Calculate predicted size
function calculatePredictedSize() {
  if (!videoData) return 0;

  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;
  const quality = parseInt(qualitySlider.value);
  const width = parseInt(outputWidthInput.value);

  const aspectRatio = videoData.height / videoData.width;
  const height = Math.round(width * aspectRatio);

  const fps = Math.round(8 + (quality / 100) * 22);
  const totalPixels = width * height;
  const totalFrames = Math.ceil(fps * duration);
  const paletteSize = 256 * 3;

  // 調整済み係数（実測値に基づく - 予測を大きめに出す）
  const compressionRatio = 0.26 + (quality / 100) * 0.26; // 0.26-0.52
  const ditherOverhead = 1.0 + (quality / 100) * 0.12;    // 1.0-1.12
  const interFrameEfficiency = totalFrames > 1 ? 0.75 : 1.0; // フレーム間効率
  const headerSize = 800;

  const firstFrameSize = totalPixels * compressionRatio * ditherOverhead;
  const subsequentFramesSize = totalPixels * compressionRatio * ditherOverhead * interFrameEfficiency * (totalFrames - 1);
  const totalDataSize = headerSize + paletteSize + firstFrameSize + subsequentFramesSize;

  // 安全マージン（予測 > 実際 となるように）
  const sizeMB = (totalDataSize / (1024 * 1024)) * 1.20 + 0.6;

  return Math.max(0.1, sizeMB);
}

// Update predicted size display
function updatePredictedSize() {
  const predictedSize = calculatePredictedSize();
  predictedSizeDisplay.textContent = predictedSize.toFixed(1);
  predictedSizeDisplay.style.color = isDayMode ? '#000000' : '#ffffff';

  if (predictedSize > 15) {
    sizeWarning.style.display = 'block';
  } else {
    sizeWarning.style.display = 'none';
  }
}

// Update output height
function updateOutputHeight() {
  if (!videoData) return;

  const width = parseInt(outputWidthInput.value);
  const aspectRatio = videoData.height / videoData.width;
  const height = Math.round(width * aspectRatio);
  outputHeightInput.value = height;
}

// Update time display
function updateTimeDisplay() {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;

  startTimeDisplay.textContent = formatTime(startTime);
  endTimeDisplay.textContent = formatTime(endTime);
  durationDisplay.textContent = `長さ: ${formatTime(duration)}`;

  startTimeInput.value = startTime.toFixed(1);
  endTimeInput.value = endTime.toFixed(1);
  durationInput.value = duration.toFixed(1);

  updatePredictedSize();
}

// Load video
function loadVideo(file) {
  console.log('Loading video:', file.name);
  videoFile = file;
  const url = URL.createObjectURL(file);

  videoPlayer.src = url;
  videoPlayer.onloadedmetadata = () => {
    console.log('Video metadata loaded:', videoPlayer.duration, videoPlayer.videoWidth, videoPlayer.videoHeight);
    videoData = {
      duration: videoPlayer.duration,
      width: videoPlayer.videoWidth,
      height: videoPlayer.videoHeight
    };

    dropZone.style.display = 'none';
    editor.style.display = 'block';

    startTimeSlider.max = videoData.duration;
    endTimeSlider.max = videoData.duration;
    startTimeSlider.value = 0;
    endTimeSlider.value = videoData.duration;

    startTimeInput.max = videoData.duration;
    endTimeInput.max = videoData.duration;
    endTimeInput.value = videoData.duration.toFixed(1);
    durationInput.max = videoData.duration;
    durationInput.value = videoData.duration.toFixed(1);

    // オリジナルサイズを表示
    originalSizeDisplay.textContent = `${videoData.width} x ${videoData.height}`;

    outputWidthInput.value = Math.min(videoData.width, 480);

    updateTimeDisplay();
    updateOutputHeight();
    updatePredictedSize();
  };
}

// File selection button
selectFileBtn.addEventListener('click', function(e) {
  e.preventDefault();
  console.log('Select file button clicked');
  fileInput.click();
});

// File input change
fileInput.addEventListener('change', function(e) {
  console.log('File input changed', e.target.files);
  const file = e.target.files[0];
  if (file) {
    loadVideo(file);
  }
});

// Change video button
changeVideoBtn.addEventListener('click', function() {
  fileInput.click();
});

// Drag and drop - drop zone
dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', function() {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  const video = files.find(function(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv'].includes(ext);
  });

  if (video) {
    loadVideo(video);
  }
});

// Video preview drag and drop
videoPlayer.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.stopPropagation();
  videoPlayer.style.opacity = '0.5';
});

videoPlayer.addEventListener('dragleave', function(e) {
  e.preventDefault();
  e.stopPropagation();
  videoPlayer.style.opacity = '1';
});

videoPlayer.addEventListener('drop', function(e) {
  e.preventDefault();
  e.stopPropagation();
  videoPlayer.style.opacity = '1';

  const files = Array.from(e.dataTransfer.files);
  const newVideoFile = files.find(function(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv'].includes(ext);
  });

  if (newVideoFile) {
    progressSection.style.display = 'none';
    resultSection.style.display = 'none';
    loadVideo(newVideoFile);
  }
});

// Slider events
startTimeSlider.addEventListener('input', function() {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);

  if (startTime >= endTime) {
    startTimeSlider.value = endTime - 0.1;
  }

  updateTimeDisplay();
  videoPlayer.currentTime = parseFloat(startTimeSlider.value);
});

endTimeSlider.addEventListener('input', function() {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);

  if (endTime <= startTime) {
    endTimeSlider.value = startTime + 0.1;
  }

  updateTimeDisplay();
  videoPlayer.currentTime = parseFloat(endTimeSlider.value);
});

// Input field events
startTimeInput.addEventListener('input', function() {
  let startTime = parseFloat(startTimeInput.value) || 0;
  const endTime = parseFloat(endTimeSlider.value);

  if (startTime < 0) startTime = 0;
  if (startTime >= endTime) startTime = endTime - 0.1;
  if (videoData && startTime > videoData.duration) startTime = videoData.duration - 0.1;

  startTimeSlider.value = startTime;
  updateTimeDisplay();
});

endTimeInput.addEventListener('input', function() {
  let endTime = parseFloat(endTimeInput.value) || 0;
  const startTime = parseFloat(startTimeSlider.value);

  if (endTime <= startTime) endTime = startTime + 0.1;
  if (videoData && endTime > videoData.duration) endTime = videoData.duration;

  endTimeSlider.value = endTime;
  updateTimeDisplay();
});

durationInput.addEventListener('input', function() {
  let duration = parseFloat(durationInput.value) || 0.1;
  const startTime = parseFloat(startTimeSlider.value);
  let endTime = startTime + duration;

  if (videoData && endTime > videoData.duration) {
    endTime = videoData.duration;
    duration = endTime - startTime;
  }

  endTimeSlider.value = endTime;
  updateTimeDisplay();
});

// Output width change
outputWidthInput.addEventListener('input', function() {
  updateOutputHeight();
  updatePredictedSize();
});

// Reset to original size
resetSizeBtn.addEventListener('click', function() {
  if (!videoData) return;
  outputWidthInput.value = videoData.width;
  updateOutputHeight();
  updatePredictedSize();
});

// Quality slider
qualitySlider.addEventListener('input', function() {
  const quality = parseInt(qualitySlider.value);
  qualityValue.textContent = quality;
  updatePredictedSize();
});

// Create GIF
createGifBtn.addEventListener('click', async function() {
  if (!videoFile) {
    alert('動画が読み込まれていません');
    return;
  }

  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;
  const quality = parseInt(qualitySlider.value);
  const outputWidth = parseInt(outputWidthInput.value);

  if (duration < 0.5) {
    alert('少なくとも0.5秒以上の長さが必要です');
    return;
  }

  createGifBtn.disabled = true;
  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  progressBarFill.style.width = '0%';
  progressMessage.textContent = 'FFmpegを準備中...';

  try {
    // Load FFmpeg if not loaded
    if (!ffmpegLoaded) {
      await loadFFmpegInstance();
    }

    const fps = Math.round(8 + (quality / 100) * 22);

    progressMessage.textContent = '動画を読み込んでいます...';

    const ext = videoFile.name.split('.').pop().toLowerCase();
    const inputFileName = 'input.' + ext;
    ffmpeg.FS('writeFile', inputFileName, await fetchFile(videoFile));

    progressMessage.textContent = `変換中... (FPS: ${fps}, サイズ: ${outputWidth}px)`;

    // Step 1: Generate palette
    await ffmpeg.run(
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', inputFileName,
      '-vf', `fps=${fps},scale=${outputWidth}:-1:flags=lanczos,palettegen=max_colors=256`,
      '-y', 'palette.png'
    );

    // Step 2: Create GIF using palette
    await ffmpeg.run(
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', inputFileName,
      '-i', 'palette.png',
      '-lavfi', `fps=${fps},scale=${outputWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
      '-y', 'output.gif'
    );

    const data = ffmpeg.FS('readFile', 'output.gif');
    currentGifBlob = new Blob([data.buffer], { type: 'image/gif' });

    const sizeMB = currentGifBlob.size / (1024 * 1024);

    const gifUrl = URL.createObjectURL(currentGifBlob);
    resultGif.src = gifUrl;
    resultSize.textContent = sizeMB.toFixed(2);

    progressSection.style.display = 'none';
    resultSection.style.display = 'block';

    // Cleanup
    ffmpeg.FS('unlink', inputFileName);
    ffmpeg.FS('unlink', 'palette.png');
    ffmpeg.FS('unlink', 'output.gif');

  } catch (error) {
    console.error('GIF creation error:', error);
    alert('GIF作成中にエラーが発生しました: ' + error.message);
    progressSection.style.display = 'none';
  } finally {
    createGifBtn.disabled = false;
  }
});

// Download button
downloadBtn.addEventListener('click', function() {
  if (currentGifBlob) {
    const url = URL.createObjectURL(currentGifBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gif_${Date.now()}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});

// Reset button
resetBtn.addEventListener('click', function() {
  videoData = null;
  videoFile = null;
  currentGifBlob = null;
  videoPlayer.src = '';
  editor.style.display = 'none';
  dropZone.style.display = 'block';
  progressSection.style.display = 'none';
  resultSection.style.display = 'none';
  startTimeSlider.value = 0;
  endTimeSlider.value = 100;
  fileInput.value = '';
});

console.log('App initialized');
