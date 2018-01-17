import { URL } from 'url';
import request from 'request-promise-native';
import config from './config';
import * as login from './lib/login';
import { deleteProps, replaceProp, propsToNum, arr2Map, setTimeoutAsync } from './lib/utils';
import { sendScore } from './lib/notification';
import BlockingQueue from './lib/BlockingQueue';

const headers = { 'User-Agent': 'nodejs' };
const req = request.defaults({ headers });

const checkLoginQueue = new BlockingQueue(60 * 60 * 1000);
let jar = null;
async function checkLogin() {
  while (true) {
    if (jar) {
      try {
        const result = await req.get('http://wjw.sysu.edu.cn/api/tno', { jar });
        if (result === 'expired') jar = null;
      } catch (e) {
        jar = null;
      }
    }
    if (jar) {
      return;
    }
    console.log('重新登录中...');
    jar = await login.wjw(...config.credentials);
  }
}

const propsToDelete = [
  'bzw', 'cjzt', 'cjlcId', 'kcywmc', 'jxbh', 'jxbmc', 'zpcj',
  'khfs', 'kch', 'class', 'xf', 'xs',
];
const propNamesMap = {
  jxbpm: 'classRank',
  jsxm: 'teacher',
  zzcj: 'score',
  xnd: 'year',
  xq: 'term',
  kcmc: 'course',
  kclb: 'type',
  jd: 'credit',
  sftg: 'pass',
  xh: 'studentId',
  njzypm: 'totalRank',
};
const typeMap = {
  10: '公必',
  30: '公选',
  11: '专必',
  21: '专选',
};
async function queryScore(year, term, pylb) {
  /* eslint no-eval: "off" */
  await checkLoginQueue.push(checkLogin);
  const url = new URL('http://wjw.sysu.edu.cn/api/score');
  if (year) url.searchParams.set('year', year);
  if (term) url.searchParams.set('term', term);
  if (pylb) url.searchParams.set('pylb', pylb);
  let body = await req.get(url, { jar });
  if (body === 'expired') {
    console.log('登录失败');
    return;
  }
  body = eval(`(${body})`).body.dataStores.kccjStore.rowSet.primary;
  body.forEach((one) => {
    deleteProps(one, ...propsToDelete);
    replaceProp(one, propNamesMap);
    propsToNum(one, 'score', 'term', 'credit', 'pass');
    one.type = typeMap[one.type];
    one.pass = Boolean(one.pass);
  });
  return arr2Map(body, 'resource_id');
}

let score = {};
async function poll() {
  console.log('');
  console.log('开始新一波轮询');
  const curScore = await queryScore();
  if (!curScore) return;
  console.log('获取数据成功');
  if (Object.keys(score).length === 0) {
    console.log('是首次获取');
    score = curScore;
    return;
  }
  const newScores = Object.keys(curScore).filter(id => !score.hasOwnProperty(id));
  if (newScores.length === 0) {
    console.log('没有新的成绩');
    return;
  }
  score = curScore;
  const scores = refactorScore(score, newScores);
  console.log('准备发送通知...');
  return sendScore(scores);
}

async function loop() {
  const toContinue = true;
  while (toContinue) {
    poll().catch(e => console.error('轮询未知错误', e));
    await sleep();
  }
}

async function sleep() {
  let milliseconds = config.pollInterval.score || 30 * 1000;
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 0 && hour < 7) {
    milliseconds = 60 * 60 * 1000;
  } else if (hour === 7) {
    const eight = new Date(now);
    eight.setHours(8);
    eight.setMinutes(0);
    eight.setSeconds(0);
    eight.setMilliseconds(0);
    milliseconds = eight - now;
  }
  await setTimeoutAsync(milliseconds);
}

function refactorScore(originalScore, newScores) {
  const ret = {};
  newScores.forEach((id) => {
    const { course, score, classRank, totalRank } = originalScore[id];
    ret[course] = `分数: ${score}, 班级排名: ${classRank}, 年级排名: ${totalRank}`;
  });
  return ret;
}

loop().catch(e => console.error('未知错误', e));
