const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

// FFmpegのパスを設定
const ffmpegPath = path.join(__dirname, 'ffmpeg-8.0-essentials_build', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(__dirname, 'ffmpeg-8.0-essentials_build', 'bin', 'ffprobe.exe');

if (fs.existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (fs.existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: true,
    titleBarStyle: 'default'
  });

  mainWindow.loadFile('index.html');

  // 開発時はDevToolsを開く
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 動画のメタデータを取得するヘルパー関数
function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration;
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        resolve({
          path: videoPath,
          duration: duration,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate)
        });
      }
    });
  });
}

// ファイル選択ダイアログ
ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    // 複数ファイルの場合
    if (result.filePaths.length > 1) {
      const metadataPromises = result.filePaths.map(path => getVideoMetadata(path));
      return await Promise.all(metadataPromises);
    } else {
      // 単一ファイルの場合
      return await getVideoMetadata(result.filePaths[0]);
    }
  }

  return null;
});

// パスから動画を読み込む（ドラッグ&ドロップ用）
ipcMain.handle('load-video-by-path', async (event, videoPath) => {
  return await getVideoMetadata(videoPath);
});

// 複数の動画を読み込む（ドラッグ&ドロップ用）
ipcMain.handle('load-videos', async (event, videoPaths) => {
  const metadataPromises = videoPaths.map(path => getVideoMetadata(path));
  return await Promise.all(metadataPromises);
});

// GIF作成 - 品質設定に基づいて変換
ipcMain.handle('create-gif', async (event, options) => {
  const { videoPath, startTime, endTime, quality, sizeLimit, outputWidth, width, height } = options;

  // 出力ファイルパス
  const outputPath = path.join(app.getPath('desktop'), `output_${Date.now()}.gif`);
  const tempPath = path.join(app.getPath('temp'), `temp_${Date.now()}.gif`);

  return new Promise((resolve, reject) => {
    // 品質から設定を計算
    const fps = Math.round(8 + (quality / 100) * 22); // 8-30 FPS
    const aspectRatio = height / width;
    const outputHeight = Math.round(outputWidth * aspectRatio);

    // サイズ上限チェック用
    const maxSizeMB = sizeLimit;
    let bestResult = null;
    let attemptCount = 0;
    const maxAttempts = 10;

    // 指定された品質で変換を試みる
    const tryConvert = (currentFps, currentScale) => {
      attemptCount++;

      event.sender.send('conversion-progress', {
        message: `変換中... (FPS: ${currentFps}, Width: ${currentScale}px)`
      });

      const testPath = path.join(app.getPath('temp'), `test_${Date.now()}_${attemptCount}.gif`);

      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .fps(currentFps)
        .size(`${currentScale}x?`)
        .outputOptions([
          '-vf', `fps=${currentFps},scale=${currentScale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`
        ])
        .output(testPath)
        .on('end', async () => {
          try {
            const stats = fs.statSync(testPath);
            const sizeMB = stats.size / (1024 * 1024);

            // サイズ上限内かチェック
            if (sizeMB <= maxSizeMB) {
              // 成功
              fs.renameSync(testPath, outputPath);
              resolve({
                success: true,
                path: outputPath,
                size: sizeMB.toFixed(2),
                fps: currentFps,
                width: currentScale
              });
            } else if (attemptCount < maxAttempts) {
              // サイズが大きすぎる場合、FPSを下げて再試行
              fs.unlinkSync(testPath);
              const newFps = Math.max(8, currentFps - 2);
              const newScale = Math.max(120, Math.floor(currentScale * 0.9));
              tryConvert(newFps, newScale);
            } else {
              // 最大試行回数に達した
              fs.unlinkSync(testPath);
              reject(new Error('サイズ上限内に収まりませんでした'));
            }
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          if (fs.existsSync(testPath)) {
            fs.unlinkSync(testPath);
          }
          reject(err);
        })
        .run();
    };

    // 初回変換を開始
    tryConvert(fps, outputWidth);
  });
});

// 保存先選択
ipcMain.handle('save-gif', async (event, sourcePath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'output.gif',
    filters: [
      { name: 'GIF', extensions: ['gif'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    fs.copyFileSync(sourcePath, result.filePath);
    return result.filePath;
  }

  return null;
});
