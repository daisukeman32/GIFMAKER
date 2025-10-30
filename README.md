# GIF Maker

エレガントな動画からGIFへの変換ツール

## 機能

- MOV/MP4/AVI/MKV対応
- タイムライン上で切り取り範囲を視覚的に選択
- ファイルサイズ上限設定（自動品質調整）
- ミニマルで洗練されたUI
- デスクトップアプリケーション

## インストール

```bash
npm install
```

## 使い方

### 開発モード
```bash
npm start
```

### ビルド
```bash
npm run build
```

## 必要要件

- Node.js 18以上
- FFmpeg（システムにインストール済みであること）

### FFmpegのインストール

#### Windows
1. https://ffmpeg.org/download.html からダウンロード
2. 解凍してPATHに追加

または Chocolatey を使用:
```bash
choco install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Linux
```bash
sudo apt install ffmpeg
```

## 技術スタック

- Electron
- FFmpeg
- HTML/CSS/JavaScript
- Inter フォント
