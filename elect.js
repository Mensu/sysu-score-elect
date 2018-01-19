import { URL } from 'url';
import request from 'request-promise-native';
import config from './config';
import * as login from './lib/login';
import BlockingQueue from './lib/BlockingQueue';
import { setTimeoutAsync, parseAsync } from './lib/utils';
import { sendProgressing, sendResult } from './lib/notification';

const headers = { 'User-Agent': 'nodejs' };
const req = request.defaults({ headers });
const allow302 = { simple: false, resolveWithFullResponse: true };

const checkLoginQueue = new BlockingQueue(60 * 60 * 1000);

let jar = null;
async function checkLogin() {
  while (true) {
    if (jar) {
      const { request: { href } } = await req.get('http://uems.sysu.edu.cn/elect/casLogin', { jar, ...allow302 });
      if (href.startsWith('https://cas.sysu.edu.cn/cas/login')) {
        jar = null;
      } else {
        jar.location = href;
        return;
      }
    }
    console.log('重新登录中...');
    jar = await login.elect(...config.credentials);
  }
}

const propNames = [
  undefined,
  'course',
  'type',
  'time',
  'teacher',
  'credit',
  undefined,
  'applicantNum',
  'remainingNum',
  'percent',
];
/**
 *
 * @param {string} xkjdszid
 */
async function queryCourseList(xkjdszid) {
  await checkLoginQueue.push(checkLogin);
  const location = new URL(jar.location);
  const sid = location.searchParams.get('sid');
  const url = new URL('https://uems.sysu.edu.cn/elect/s/courses?xqm=4&fromSearch=false');
  url.searchParams.set('sid', sid);
  url.searchParams.set('xkjdszid', xkjdszid);
  const html = await req.get(url, { jar });
  const $ = await parseAsync(html);
  const courses = [];
  $('body .toolbar + .grid-container .grid tbody tr').each((rowIndex, row) => {
    const one = {};
    $(row).find('td').each((colIndex, col) => {
      const propName = propNames[colIndex];
      if (colIndex === 0) {
        one.classId = $(col).find('.xk-div a').attr('jxbh');
      } else if (propName) {
        one[propName] = $(col).text().trim();
      }
      if ([5, 7, 8].includes(colIndex)) {
        one[propName] = parseInt(one[propName], 10);
      } else if (propName === 'percent') {
        one.percent = one.remainingNum ? parseFloat(one.percent) / 100 : 0;
      }
    });
    courses.push(one);
  });
  return courses;
}

async function op(action, xkjdszid, classId) {
  await checkLoginQueue.push(checkLogin);
  const location = new URL(jar.location);
  const url = new URL(`https://uems.sysu.edu.cn/elect/s/${action}`);
  const form = {
    jxbh: classId,
    xkjdszid,
    sid: location.searchParams.get('sid'),
  };
  return req.post(url, { form, jar });
}

/**
 *
 * @param {{ xkjdszid: string, match: (course: any): boolean, unelect?: string }} policy
 */
async function tryElectCourse(policy) {
  const { xkjdszid, type, match, unelect } = policy;
  const coursesList = await queryCourseList(xkjdszid);
  console.log(`获取${type}数据成功`);
  const target = coursesList.find((course) => {
    if (!course.classId) return false;
    return match(course);
  });

  if (target) {
    sendProgressing(target).catch(e => console.error('发送正在抢课通知失败', e));
    // 可能需要先退掉某门课
    if (unelect) {
      await op('unelect', xkjdszid, unelect);
    }
    const html = await op('elect', xkjdszid, target.classId);
    await sendResult(target, html);
  } else {
    console.log(`没有找到符合要求的${type}`);
  }
}

async function poll() {
  console.log('');
  console.log('开始新一波轮询...');
  const promises = config.courses.map(tryElectCourse);
  await Promise.all(promises);
  console.log('本轮轮询结束');
}

async function loop() {
  while (true) {
    poll().catch(e => console.error('轮询未知错误', e));
    await setTimeoutAsync(config.pollInterval.elect || 30 * 1000);
  }
}

loop().catch(e => console.error('未知错误', e));
