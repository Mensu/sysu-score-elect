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
  /** @type {Course[]} */
  const courses = [];
  $('body .toolbar + .grid-container .grid tbody tr').each((rowIndex, row) => {
    /** @type {Course} */
    const one = {};
    $(row).find('td').each((colIndex, col) => {
      const propName = propNames[colIndex];
      if (colIndex === 0) {
        one.electable = Boolean($(col).find('.xk-div a').length);
        one.classId = $(col).find('a').attr('jxbh');
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
 * @param {string} html
 * @return {ElectResult}
 */
async function parseResult(html) {
  const $ = await parseAsync(html);
  const result = $('textarea').text();
  try {
    return JSON.parse(result);
  } catch (e) {
    throw new Error(`[parseResult] ${e.message}: ${result}`);
  }
}

/**
 *
 * @param {string} xkjdszid
 * @param {string} unelect
 * @param {boolean} muteOnSuccess
 */
async function electBack(xkjdszid, unelect, muteOnSuccess) {
  const html = await op('elect', xkjdszid, unelect);
  const result = await parseResult(html);
  console.log(unelect, '回抢结果', JSON.stringify(result));
  if (result.err.caurse || result.err.code) {
    await sendResult({ course: unelect, time: 'BAD！回抢失败！' }, result);
  } else if (!muteOnSuccess) {
    await sendResult({ course: unelect, time: '回抢成功' }, result);
  }
}

/**
 *
 * @param {ElectPolicy} policy
 */
async function tryElectCourse(policy) {
  const { xkjdszid, type, match, unelect, force } = policy;
  const coursesList = await queryCourseList(xkjdszid);
  console.log(`获取${type}数据成功`);
  const target = coursesList.find((course) => {
    if (!course.electable && !force) return false;
    // 强制模式 || 非强制模式 and 有选课按钮
    return match(course);
  });

  if (target) {
    // 强制模式不发送正在抢课
    if (!force) {
      sendProgressing(target).catch(e => console.error('发送正在抢课通知失败', e));
    }
    // 可能需要先退掉某门课
    if (unelect) {
      await op('unelect', xkjdszid, unelect);
    }
    const html = await op('elect', xkjdszid, target.classId);
    const result = await parseResult(html);
    console.log(target.course, '抢课结果', JSON.stringify(result));
    const failure = result.err.caurse || result.err.code;
    const tasksAfterElect = [];
    // 非强制模式 || 强制模式 and 成功
    if (!force || !failure) {
      tasksAfterElect.push(sendResult(target, result));
    }
    // 选课失败，回抢 unelect
    if (unelect && failure) {
      tasksAfterElect.push(electBack(xkjdszid, unelect, force));
    }
    await Promise.all(tasksAfterElect);
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
