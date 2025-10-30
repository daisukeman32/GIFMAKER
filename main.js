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

// GIF作成 - 二分探索で最適な品質を見つける
ipcMain.handle('create-gif', async (event, options) => {
  const { videoPath, startTime, endTime, maxSizeMB, width, height } = options;

  // 出力ファイルパス
  const outputPath = path.join(app.getPath('desktop'), `output_${Date.now()}.gif`);
  const tempPath = path.join(app.getPath('temp'), `temp_${Date.now()}.gif`);

  return new Promise((resolve, reject) => {
    // 品質パラメータの範囲
    let minFps = 8;
    let maxFps = 30;
    let minScale = 240;
    let maxScale = Math.min(width, 1200);

    let bestResult = null;
    let attemptCount = 0;
    const maxAttempts = 15; // より細かく調整するため試行回数を増やす

    // 二分探索で最適な設定を見つける
    const findOptimalSettings = async () => {
      if (attemptCount >= maxAttempts) {
        // 最適な結果を返す
        if (bestResult) {
          fs.renameSync(bestResult.tempPath, outputPath);
          resolve({
            success: true,
            path: outputPath,
            size: bestResult.size.toFixed(2),
            fps: bestResult.fps,
            width: bestResult.scale
          });
        } else {
          reject(new Error('最適な設定が見つかりませんでした'));
        }
        return;
      }

      attemptCount++;

      // 現在の中間値で試行
      const currentFps = Math.round((minFps + maxFps) / 2);
      const currentScale = Math.round((minScale + maxScale) / 2);

      event.sender.send('conversion-progress', {
        message: `最適化中... ${attemptCount}/${maxAttempts} (FPS: ${currentFps}, Width: ${currentScale}px)`
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

            // サイズが上限の98%〜99.5%の範囲内なら最適（絶対に上限を超えない）
            const targetMin = maxSizeMB * 0.98;
            const targetMax = maxSizeMB * 0.995;

            if (sizeMB <= targetMax && sizeMB >= targetMin) {
              // 最適な結果を保存
              if (!bestResult || sizeMB > bestResult.size) {
                if (bestResult && fs.existsSync(bestResult.tempPath)) {
                  fs.unlinkSync(bestResult.tempPath);
                }
                bestResult = { tempPath: testPath, size: sizeMB, fps: currentFps, scale: currentScale };
              } else {
                fs.unlinkSync(testPath);
              }

              // 完了
              fs.renameSync(bestResult.tempPath, outputPath);
              resolve({
                success: true,
                path: outputPath,
                size: bestResult.size.toFixed(2),
                fps: bestResult.fps,
                width: bestResult.scale
              });
            } else if (sizeMB > targetMax) {
              // サイズが大きすぎる - 品質を下げる
              // 上限を超えた結果は保存しない
              fs.unlinkSync(testPath);

              // 範囲を狭める
              maxFps = currentFps - 1;
              maxScale = Math.floor(currentScale * 0.9);

              if (maxFps < minFps || maxScale < minScale) {
                // これ以上下げられない
                if (bestResult) {
                  fs.renameSync(bestResult.tempPath, outputPath);
                  resolve({
                    success: true,
                    path: outputPath,
                    size: bestResult.size.toFixed(2),
                    fps: bestResult.fps,
                    width: bestResult.scale
                  });
                } else {
                  reject(new Error('サイズ制限内に収まりませんでした'));
                }
              } else {
                findOptimalSettings();
              }
            } else {
              // サイズが小さすぎる - 品質を上げられるか試す
              // ただし、上限以下の最良の結果は保持
              if (sizeMB <= maxSizeMB && (!bestResult || sizeMB > bestResult.size)) {
                if (bestResult && fs.existsSync(bestResult.tempPath)) {
                  fs.unlinkSync(bestResult.tempPath);
                }
                bestResult = { tempPath: testPath, size: sizeMB, fps: currentFps, scale: currentScale };
              } else {
                fs.unlinkSync(testPath);
              }

              // 範囲を狭める
              minFps = currentFps + 1;
              minScale = Math.floor(currentScale * 1.1);

              if (minFps > maxFps || minScale > maxScale) {
                // これ以上上げられない
                if (bestResult) {
                  fs.renameSync(bestResult.tempPath, outputPath);
                  resolve({
                    success: true,
                    path: outputPath,
                    size: bestResult.size.toFixed(2),
                    fps: bestResult.fps,
                    width: bestResult.scale
                  });
                } else {
                  reject(new Error('GIF作成に失敗しました'));
                }
              } else {
                findOptimalSettings();
              }
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

    findOptimalSettings();
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
