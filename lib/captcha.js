import { exec } from 'child_process';
import { promisify } from 'util';
import jimp from 'jimp';

/**
 *
 * @param {Buffer} srcBuffer
 */
export async function recognizeCaptcha(srcBuffer) {
  const srcImg = await jimp.read(srcBuffer);
  const image = processImg(srcImg);
  const buffer = await promisify(image.getBuffer).call(image, jimp.MIME_PNG);
  const cmd = [
    'tesseract', '-', '-', '-psm', '7',
    '-c', `tessedit_char_whitelist=${getWhiteList()}`,
  ];
  const raw = await execAsync(cmd, buffer);
  return raw.replace(/ /g, '').slice(0, 4);
}

/**
 * 对验证码图片进行灰度处理，过滤掉过黑和过白的颜色
 * @param {jimp} origin
 */
function processImg(origin) {
  const image = origin.clone();
  for (const x of range(image.bitmap.width)) {
    for (const y of range(image.bitmap.height)) {
      const curColor = image.getPixelColor(x, y);
      const { r, g, b } = jimp.intToRGBA(curColor);
      let mean = (r + g + b) / 3;
      // 过白或者过黑 -> 变白
      if (mean >= 0xe0 || mean < 7) {
        mean = 255;
      }
      const newColor = jimp.rgbaToInt(mean, mean, mean, 255);
      image.setPixelColor(newColor, x, y);
    }
  }
  return image;
}

/**
 *
 * @param {string[]} cmd
 * @param {Buffer|string} input
 * @return {Promise<string>}
 */
async function execAsync(cmd, input) {
  return new Promise((resolve, reject) => {
    const cp = exec(cmd.join(' '), (err, stdout, stderr) => {
      if (err) return reject(err);
      return resolve(stdout);
    });
    cp.stdin.write(input);
    cp.stdin.end();
  });
}

/**
 *
 * @param {number} begin
 * @param {number} [end]
 * @param {number} [step]
 */
function *range(begin, end = undefined, step = 1) {
  if (end === undefined) {
    end = begin;
    begin = 0;
  }
  let cur = 0;
  const toContinue = step < 0 ? (() => cur > end) : (() => cur < end);
  for (cur = begin; toContinue(); cur += step) {
    yield cur;
  }
}

function getWhiteList() {
  /** @type {number[]} */
  const numbers = [
    ...range('0'.charCodeAt(0), '9'.charCodeAt(0) + 1),
    ...range('A'.charCodeAt(0), 'Z'.charCodeAt(0) + 1),
    ...range('a'.charCodeAt(0), 'z'.charCodeAt(0) + 1),
  ];
  return numbers.reduce((prev, cur) => prev + String.fromCharCode(cur), '');
}
