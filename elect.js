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

const checkLoginQueue = new BlockingQueue(2 * 60 * 1000);

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

function msgs() {
  return [
    '提交成功',
    '非法操作! 数据库没有对应的教学班号。',
    '当前不在此课程类别的选课时间范围内！',
    '您不在该教学班的修读对象范围内，不允许选此教学班！',
    '您所在的学生群体，在此阶段不允许对该课程类别的课进行选课、退课！',
    '系统中没有您这个学期的报到记录，不允许选课。请联系您所在院系的教务员申请补注册。',
    '您这个学期未完成评教任务，不允许选课。',
    '您不满足该教学班选课的性别要求，不能选此门课程！',
    '不允许跨校区选课！',
    '此课程已选，不能重复选择！',
    '您所选课程 的成绩为“已通过”，因此不允许再选该课，请重新选择！',
    '此类型课程已选学分总数超标',
    '此类型课程已选门数超标',
    '毕业班学生，公选学分已满，最后一个学期不允许选择公选课！',
    '您不是博雅班学生，不能选此门课程！',
    '您最多能选2门博雅班课程！',
    '您不是基础实验班学生，不能选此门课程！',
    '所选课程与已选课程上课时间冲突,请重新选择!',
    '已经超出限选人数，请选择别的课程！',
    '该教学班不参加选课，你不能选此教学班！',
    '选课等待超时',
    '您这个学期未完成缴费，不允许选课。请联系财务处帮助台（84036866 再按 3）',
    '您未满足选择该课程的先修课程条件!',
    '不在此课程类型的选课时间范围内',
    '您的核心通识课学分已满足培养方案的学分要求，无法再选择核心通识课',
    '您的主修必专绩点未达到精英课的选课要求',
    '您已选可互认课程的同组课程',
    '及格重修选课只能选已通过的课程',
    '您不在教学班撤消后抢选的学生名单中',
    '您不是卓越班学生，不能选此门课程！',
    '早前的选课不允许退课！',
  ];
}

/**
 *
 * @param {string} html
 * @return {ElectResult}
 */
async function parseResult(html) {
  const $ = await parseAsync(html);
  const resultStr = $('textarea').text();
  try {
    const result = JSON.parse(resultStr);
    const { err = {} } = result;
    err.cause = msgs()[err.code];
    return result;
  } catch (e) {
    throw new Error(`[parseResult] ${e.message}: ${resultStr}`);
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
    await Promise.all([
      poll().catch(e => console.error('轮询未知错误', e)),
      setTimeoutAsync(config.pollInterval.elect || 30 * 1000),
    ]);
  }
}

loop().catch(e => console.error('未知错误', e));
