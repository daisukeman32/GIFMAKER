const { ipcRenderer } = require('electron');

let videoData = null;
let currentOutputPath = null;
let videoQueue = []; // 複数ファイル用のキュー

// DOM要素
const dropZone = document.getElementById('drop-zone');
const editor = document.getElementById('editor');
const videoPlayer = document.getElementById('video-player');
const selectFileBtn = document.getElementById('select-file-btn');
const startTimeSlider = document.getElementById('start-time');
const endTimeSlider = document.getElementById('end-time');
const startTimeDisplay = document.getElementById('start-time-display');
const endTimeDisplay = document.getElementById('end-time-display');
const durationDisplay = document.getElementById('duration-display');
const startTimeInput = document.getElementById('start-time-input');
const endTimeInput = document.getElementById('end-time-input');
const durationInput = document.getElementById('duration-input');
const outputWidthInput = document.getElementById('output-width');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');
const sizeLimitSlider = document.getElementById('size-limit-slider');
const sizeLimitValue = document.getElementById('size-limit-value');
const predictedSizeDisplay = document.getElementById('predicted-size');
const createGifBtn = document.getElementById('create-gif-btn');
const resetBtn = document.getElementById('reset-btn');
const progressSection = document.getElementById('progress-section');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressMessage = document.getElementById('progress-message');
const resultSection = document.getElementById('result-section');
const resultSize = document.getElementById('result-size');
const saveAsBtn = document.getElementById('save-as-btn');

// 時間をフォーマット
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 予測サイズを計算（概算）
function calculatePredictedSize() {
  if (!videoData) return 0;

  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;
  const quality = parseInt(qualitySlider.value);
  const width = parseInt(outputWidthInput.value);

  // 縦横比を維持して高さを計算
  const aspectRatio = videoData.height / videoData.width;
  const height = Math.round(width * aspectRatio);

  // 品質からFPSとカラーを推定
  // quality: 1-100
  const fps = Math.round(8 + (quality / 100) * 22); // 8-30 FPS
  const colors = Math.round(128 + (quality / 100) * 128); // 128-256 colors

  // GIFサイズの概算式
  // サイズ ≈ (幅 × 高さ × FPS × 秒数 × bits_per_pixel × 圧縮率) / (8 * 1024 * 1024)
  const bitsPerPixel = Math.log2(colors); // 7-8 bits
  const compressionFactor = 0.15 + (quality / 100) * 0.25; // 0.15-0.40

  const sizeMB = (width * height * fps * duration * bitsPerPixel * compressionFactor) / (8 * 1024 * 1024);

  return Math.max(0.1, sizeMB);
}

// 予測サイズを更新
function updatePredictedSize() {
  const predictedSize = calculatePredictedSize();
  predictedSizeDisplay.textContent = predictedSize.toFixed(1);

  // サイズ上限と比較
  const sizeLimit = parseFloat(sizeLimitSlider.value);
  if (predictedSize > sizeLimit) {
    predictedSizeDisplay.style.color = '#ff6b6b';
  } else {
    predictedSizeDisplay.style.color = '#ffffff';
  }
}

// 品質から設定を取得
function getQualitySettings(quality) {
  const fps = Math.round(8 + (quality / 100) * 22); // 8-30 FPS
  const scale = parseInt(outputWidthInput.value);
  return { fps, scale };
}

// ファイル選択ボタン
selectFileBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-video');
  if (result) {
    if (Array.isArray(result)) {
      loadMultipleVideos(result);
    } else {
      loadVideo(result);
    }
  }
});

// ドラッグ&ドロップ
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  const videoFiles = files.filter(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv'].includes(ext);
  });

  if (videoFiles.length > 0) {
    // 複数ファイルの場合
    if (videoFiles.length > 1) {
      const paths = videoFiles.map(f => f.path);
      const results = await ipcRenderer.invoke('load-videos', paths);
      if (results && results.length > 0) {
        loadMultipleVideos(results);
      }
    } else {
      // 単一ファイルの場合
      const result = await ipcRenderer.invoke('load-video-by-path', videoFiles[0].path);
      if (result) {
        loadVideo(result);
      }
    }
  }
});

// 動画を読み込む
function loadVideo(data) {
  videoData = data;

  // UIを切り替え
  dropZone.style.display = 'none';
  editor.style.display = 'block';

  // 動画をセット
  videoPlayer.src = data.path;

  // スライダーの最大値を設定
  startTimeSlider.max = data.duration;
  endTimeSlider.max = data.duration;
  endTimeSlider.value = data.duration;

  // 入力フィールドの最大値を設定
  startTimeInput.max = data.duration;
  endTimeInput.max = data.duration;
  endTimeInput.value = data.duration.toFixed(1);
  durationInput.max = data.duration;
  durationInput.value = data.duration.toFixed(1);

  // 出力幅を動画サイズに基づいて初期化
  outputWidthInput.value = Math.min(data.width, 480);

  // 時間表示を更新
  updateTimeDisplay();

  // 予測サイズを初期化
  updatePredictedSize();
}

// スライダーイベント
startTimeSlider.addEventListener('input', () => {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);

  if (startTime >= endTime) {
    startTimeSlider.value = endTime - 0.1;
  }

  updateTimeDisplay();
  videoPlayer.currentTime = startTime;
});

endTimeSlider.addEventListener('input', () => {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);

  if (endTime <= startTime) {
    endTimeSlider.value = startTime + 0.1;
  }

  updateTimeDisplay();
  videoPlayer.currentTime = endTime;
});

// 時間表示を更新
function updateTimeDisplay() {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;

  startTimeDisplay.textContent = formatTime(startTime);
  endTimeDisplay.textContent = formatTime(endTime);
  durationDisplay.textContent = `長さ: ${formatTime(duration)}`;

  // 入力フィールドも同期
  startTimeInput.value = startTime.toFixed(1);
  endTimeInput.value = endTime.toFixed(1);
  durationInput.value = duration.toFixed(1);
}

// 入力フィールドからスライダーを更新
startTimeInput.addEventListener('input', () => {
  let startTime = parseFloat(startTimeInput.value) || 0;
  const endTime = parseFloat(endTimeSlider.value);

  if (startTime < 0) startTime = 0;
  if (startTime >= endTime) startTime = endTime - 0.1;
  if (startTime > videoData.duration) startTime = videoData.duration - 0.1;

  startTimeSlider.value = startTime;
  updateTimeDisplay();
});

endTimeInput.addEventListener('input', () => {
  let endTime = parseFloat(endTimeInput.value) || 0;
  const startTime = parseFloat(startTimeSlider.value);

  if (endTime <= startTime) endTime = startTime + 0.1;
  if (endTime > videoData.duration) endTime = videoData.duration;

  endTimeSlider.value = endTime;
  updateTimeDisplay();
});

durationInput.addEventListener('input', () => {
  let duration = parseFloat(durationInput.value) || 0.1;
  const startTime = parseFloat(startTimeSlider.value);
  let endTime = startTime + duration;

  if (endTime > videoData.duration) {
    endTime = videoData.duration;
    duration = endTime - startTime;
  }

  endTimeSlider.value = endTime;
  updateTimeDisplay();
  updatePredictedSize();
});

// 出力幅の変更
outputWidthInput.addEventListener('input', () => {
  updatePredictedSize();
});

// 品質スライダーの変更
qualitySlider.addEventListener('input', () => {
  const quality = parseInt(qualitySlider.value);
  qualityValue.textContent = quality;
  updatePredictedSize();

  // サイズ上限チェック
  const predictedSize = calculatePredictedSize();
  const sizeLimit = parseFloat(sizeLimitSlider.value);

  if (predictedSize > sizeLimit) {
    // 品質を自動調整してサイズ上限内に収める
    let adjustedQuality = quality;
    while (adjustedQuality > 1) {
      adjustedQuality -= 1;
      const testSize = calculatePredictedSizeWithQuality(adjustedQuality);
      if (testSize <= sizeLimit) {
        qualitySlider.value = adjustedQuality;
        qualityValue.textContent = adjustedQuality;
        updatePredictedSize();
        break;
      }
    }
  }
});

// サイズ上限スライダーの変更
sizeLimitSlider.addEventListener('input', () => {
  const limit = parseFloat(sizeLimitSlider.value);
  sizeLimitValue.textContent = limit.toFixed(1);
  updatePredictedSize();

  // 予測サイズが上限を超えている場合、品質を調整
  const predictedSize = calculatePredictedSize();
  if (predictedSize > limit) {
    const currentQuality = parseInt(qualitySlider.value);
    let adjustedQuality = currentQuality;

    while (adjustedQuality > 1) {
      adjustedQuality -= 1;
      const testSize = calculatePredictedSizeWithQuality(adjustedQuality);
      if (testSize <= limit) {
        qualitySlider.value = adjustedQuality;
        qualityValue.textContent = adjustedQuality;
        updatePredictedSize();
        break;
      }
    }
  }
});

// 指定品質での予測サイズを計算
function calculatePredictedSizeWithQuality(quality) {
  if (!videoData) return 0;

  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const duration = endTime - startTime;
  const width = parseInt(outputWidthInput.value);

  const aspectRatio = videoData.height / videoData.width;
  const height = Math.round(width * aspectRatio);

  const fps = Math.round(8 + (quality / 100) * 22);
  const colors = Math.round(128 + (quality / 100) * 128);

  const bitsPerPixel = Math.log2(colors);
  const compressionFactor = 0.15 + (quality / 100) * 0.25;

  const sizeMB = (width * height * fps * duration * bitsPerPixel * compressionFactor) / (8 * 1024 * 1024);

  return Math.max(0.1, sizeMB);
}

// GIF作成ボタン
createGifBtn.addEventListener('click', async () => {
  const startTime = parseFloat(startTimeSlider.value);
  const endTime = parseFloat(endTimeSlider.value);
  const quality = parseInt(qualitySlider.value);
  const sizeLimit = parseFloat(sizeLimitSlider.value);
  const outputWidth = parseInt(outputWidthInput.value);

  // バリデーション
  if (endTime - startTime < 0.5) {
    alert('少なくとも0.5秒以上の長さが必要です');
    return;
  }

  // UI更新
  createGifBtn.disabled = true;
  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  progressBarFill.style.width = '0%';
  progressMessage.textContent = '処理中...';

  try {
    // 複数ファイルの場合
    if (videoQueue.length > 1) {
      let successCount = 0;
      let totalSize = 0;

      for (let i = 0; i < videoQueue.length; i++) {
        const video = videoQueue[i];
        progressMessage.textContent = `処理中... ${i + 1}/${videoQueue.length}`;

        try {
          const result = await ipcRenderer.invoke('create-gif', {
            videoPath: video.path,
            startTime: startTime,
            endTime: Math.min(endTime, video.duration),
            quality: quality,
            sizeLimit: sizeLimit,
            outputWidth: outputWidth,
            width: video.width,
            height: video.height
          });

          if (result.success) {
            successCount++;
            totalSize += parseFloat(result.size);
          }
        } catch (err) {
          console.error(`Failed to convert ${video.path}:`, err);
        }
      }

      // 結果を表示
      progressSection.style.display = 'none';
      resultSection.style.display = 'block';
      resultSize.textContent = `${successCount}個のGIF作成完了 (合計: ${totalSize.toFixed(2)} MB)`;
    } else {
      // 単一ファイルの場合
      const result = await ipcRenderer.invoke('create-gif', {
        videoPath: videoData.path,
        startTime: startTime,
        endTime: endTime,
        quality: quality,
        sizeLimit: sizeLimit,
        outputWidth: outputWidth,
        width: videoData.width,
        height: videoData.height
      });

      if (result.success) {
        currentOutputPath = result.path;

        // 結果を表示
        resultSize.textContent = result.size;
        progressSection.style.display = 'none';
        resultSection.style.display = 'block';
      }
    }
  } catch (error) {
    alert('GIF作成中にエラーが発生しました: ' + error.message);
    progressSection.style.display = 'none';
  } finally {
    createGifBtn.disabled = false;
  }
});

// 進捗状況を受信
ipcRenderer.on('conversion-progress', (event, data) => {
  if (data.percent) {
    progressBarFill.style.width = `${data.percent}%`;
    progressMessage.textContent = `処理中... ${Math.round(data.percent)}%`;
  } else if (data.message) {
    progressMessage.textContent = data.message;
  }
});

// 名前を付けて保存
saveAsBtn.addEventListener('click', async () => {
  if (currentOutputPath) {
    const savedPath = await ipcRenderer.invoke('save-gif', currentOutputPath);
    if (savedPath) {
      alert(`保存しました: ${savedPath}`);
    }
  }
});

// 複数動画を読み込む
function loadMultipleVideos(videos) {
  videoQueue = videos;

  // UIを切り替え
  dropZone.style.display = 'none';
  editor.style.display = 'block';

  // バッチモード表示
  document.getElementById('batch-mode-info').style.display = 'block';
  document.getElementById('batch-count').textContent = videos.length;

  // 最初の動画をプレビュー
  videoData = videos[0];
  videoPlayer.src = videos[0].path;

  // スライダーの最大値を設定
  startTimeSlider.max = videos[0].duration;
  endTimeSlider.max = videos[0].duration;
  endTimeSlider.value = videos[0].duration;

  // 入力フィールドの最大値を設定
  startTimeInput.max = videos[0].duration;
  endTimeInput.max = videos[0].duration;
  endTimeInput.value = videos[0].duration.toFixed(1);
  durationInput.max = videos[0].duration;
  durationInput.value = videos[0].duration.toFixed(1);

  // 時間表示を更新
  updateTimeDisplay();

  // ボタンを「全てをGIF変換」に変更
  createGifBtn.textContent = `全て (${videos.length}個) をGIF変換`;
}

// リセットボタン
resetBtn.addEventListener('click', () => {
  videoData = null;
  currentOutputPath = null;
  videoQueue = [];
  videoPlayer.src = '';
  editor.style.display = 'none';
  dropZone.style.display = 'block';
  progressSection.style.display = 'none';
  resultSection.style.display = 'none';
  document.getElementById('batch-mode-info').style.display = 'none';
  startTimeSlider.value = 0;
  endTimeSlider.value = 100;
  createGifBtn.textContent = 'GIF作成';
});
