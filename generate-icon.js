const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// 512x512のキャンバスを作成
const canvas = createCanvas(512, 512);
const ctx = canvas.getContext('2d');

// 角丸矩形を描画するヘルパー関数
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// 背景 - 黒の角丸矩形
ctx.fillStyle = '#000000';
roundRect(ctx, 0, 0, 512, 512, 80);
ctx.fill();

// フィルムストリップのフレーム
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 8;
roundRect(ctx, 80, 120, 352, 272, 20);
ctx.stroke();

// フィルムのパーフォレーション - 左側
ctx.fillStyle = '#ffffff';
const perforations = [140, 200, 260, 320];
perforations.forEach(y => {
  roundRect(ctx, 90, y, 20, 30, 5);
  ctx.fill();
});

// フィルムのパーフォレーション - 右側
perforations.forEach(y => {
  roundRect(ctx, 402, y, 20, 30, 5);
  ctx.fill();
});

// GIF テキスト
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 120px Arial, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('GIF', 256, 256);

// キラキラエフェクト
ctx.globalAlpha = 0.8;
ctx.beginPath();
ctx.arc(370, 160, 8, 0, Math.PI * 2);
ctx.fill();

ctx.globalAlpha = 0.6;
ctx.beginPath();
ctx.arc(390, 180, 6, 0, Math.PI * 2);
ctx.fill();

ctx.globalAlpha = 0.7;
ctx.beginPath();
ctx.arc(350, 190, 5, 0, Math.PI * 2);
ctx.fill();

ctx.globalAlpha = 1.0;

// MAKER テキスト
ctx.font = '32px Arial, sans-serif';
ctx.fillText('MAKER', 256, 420);

// buildディレクトリを作成
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

// PNGとして保存
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(path.join(buildDir, 'icon.png'), buffer);

console.log('✓ Icon generated: build/icon.png');

// 256x256版も作成（Windows用）
const canvas256 = createCanvas(256, 256);
const ctx256 = canvas256.getContext('2d');
ctx256.scale(0.5, 0.5);

// 同じ描画を256x256に縮小
ctx256.fillStyle = '#000000';
roundRect(ctx256, 0, 0, 512, 512, 80);
ctx256.fill();

ctx256.strokeStyle = '#ffffff';
ctx256.lineWidth = 8;
roundRect(ctx256, 80, 120, 352, 272, 20);
ctx256.stroke();

ctx256.fillStyle = '#ffffff';
perforations.forEach(y => {
  roundRect(ctx256, 90, y, 20, 30, 5);
  ctx256.fill();
  roundRect(ctx256, 402, y, 20, 30, 5);
  ctx256.fill();
});

ctx256.font = 'bold 120px Arial, sans-serif';
ctx256.textAlign = 'center';
ctx256.textBaseline = 'middle';
ctx256.fillText('GIF', 256, 256);

ctx256.globalAlpha = 0.8;
ctx256.beginPath();
ctx256.arc(370, 160, 8, 0, Math.PI * 2);
ctx256.fill();

ctx256.globalAlpha = 0.6;
ctx256.beginPath();
ctx256.arc(390, 180, 6, 0, Math.PI * 2);
ctx256.fill();

ctx256.globalAlpha = 0.7;
ctx256.beginPath();
ctx256.arc(350, 190, 5, 0, Math.PI * 2);
ctx256.fill();

ctx256.globalAlpha = 1.0;
ctx256.font = '32px Arial, sans-serif';
ctx256.fillText('MAKER', 256, 420);

const buffer256 = canvas256.toBuffer('image/png');
fs.writeFileSync(path.join(buildDir, 'icon-256.png'), buffer256);

console.log('✓ Icon 256x256 generated: build/icon-256.png');
