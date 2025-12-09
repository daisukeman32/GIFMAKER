const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

// FFmpegのパスを設定（開発時とパッケージ時で異なる）
function getResourcePath(relativePath) {
  // パッケージ化されている場合
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  // 開発時
  return path.join(__dirname, relativePath);
}

const ffmpegPath = getResourcePath(path.join('ffmpeg-8.0-essentials_build', 'bin', 'ffmpeg.exe'));
const ffprobePath = getResourcePath(path.join('ffmpeg-8.0-essentials_build', 'bin', 'ffprobe.exe'));

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

// フォルダ選択ダイアログ
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
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
  const { videoPath, startTime, endTime, quality, outputWidth, width, height, outputFolder } = options;

  // 出力ファイルパス（outputFolderが指定されていればそれを使用、なければデスクトップ）
  const targetFolder = outputFolder || app.getPath('desktop');
  const outputPath = path.join(targetFolder, `output_${Date.now()}.gif`);

  return new Promise((resolve, reject) => {
    // 品質から設定を計算
    const fps = Math.round(8 + (quality / 100) * 22); // 8-30 FPS
    const aspectRatio = height / width;
    const outputHeight = Math.round(outputWidth * aspectRatio);

    event.sender.send('conversion-progress', {
      message: `変換中... (FPS: ${fps}, サイズ: ${outputWidth}x${outputHeight})`
    });

    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions([
        '-vf', `fps=${fps},scale=${outputWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`
      ])
      .output(outputPath)
      .on('end', async () => {
        try {
          const stats = fs.statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);

          resolve({
            success: true,
            path: outputPath,
            size: sizeMB.toFixed(2),
            fps: fps,
            width: outputWidth,
            height: outputHeight
          });
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
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
