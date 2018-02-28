import { URL } from 'url';
import request from 'request-promise-native';
import config from './config';
import * as login from './lib/login';
import { deleteProps, replaceProp, propsToNum, arr2Map, setTimeoutAsync } from './lib/utils';
import { sendScore } from './lib/notification';
import BlockingQueue from './lib/BlockingQueue';

const headers = { 'User-Agent': 'nodejs' };
const req = request.defaults({ headers });

const checkLoginQueue = new BlockingQueue(2 * 60 * 1000);
let jar = null;
async function checkLogin() {
  while (true) {
    if (jar) {
      try {
        const result = await req.get('https://uems.sysu.edu.cn/jwxt/api/login/status', { jar, json: true });
        if (result.data === 0) {
          jar = null;
        } else {
          return;
        }
      } catch (e) {
        jar = null;
      }
    }
    console.log('重新登录中...');
    jar = await login.jwxt(...config.credentials);
  }
}

const propsToDelete = [
  'accessFlag', 'scoCourseCategoryName',
  'scoCourseNumber', 'scoPoint', 'total',
];
const propNamesMap = {
  rank: 'classRank',
  scoTeacherName: 'teacher',
  scoFinalScore: 'score',
  scoSchoolYear: 'year',
  scoSemester: 'term',
  scoCourseName: 'course',
  scoCourseCategory: 'type',
  scoCredit: 'credit',
  // sftg: 'pass',
  scoStudentNumber: 'studentId',
  // njzypm: 'totalRank',
  teachClassNumber: 'resource_id',
};
const typeMap = {
  10: '公必',
  30: '公选',
  11: '专必',
  21: '专选',
};
/**
 *
 * @param {string} scoSchoolYear 学年
 * @param {string} scoSemester 学期
 * @param {string} trainTypeCode 培养类别代码
 * @return {Promise<Object<string, ScoreResult>>}
 */
async function queryScore(scoSchoolYear, scoSemester, trainTypeCode) {
  /* eslint no-eval: "off" */
  await checkLoginQueue.push(checkLogin);
  const url = new URL('https://uems.sysu.edu.cn/jwxt/achievement-manage/score-check/list');
  if (scoSchoolYear) url.searchParams.set('scoSchoolYear', scoSchoolYear);
  if (scoSemester) url.searchParams.set('scoSemester', scoSemester);
  if (trainTypeCode) url.searchParams.set('trainTypeCode', trainTypeCode);
  const qs = { addScoreFlag: false };
  /** @type {{ code: number, data: ScoreResult[] }} */
  const body = await req.get(url, { qs, jar, json: true });
  if (body.code !== 200 || !Array.isArray(body.data)) {
    console.log('响应数据异常', body);
    return;
  }
  const { data } = body;
  data.forEach((one) => {
    deleteProps(one, ...propsToDelete);
    replaceProp(one, propNamesMap);
    propsToNum(one, 'score', 'term');
    one.type = typeMap[one.type];
  });
  return arr2Map(data, 'resource_id');
}

/** @type {Object<string, ScoreResult>} */
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
  while (true) {
    await Promise.all([
      poll().catch(e => console.error('轮询未知错误', e)),
      sleep(),
    ]);
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

/**
 *
 * @param {Object<string, ScoreResult>} originalScore
 * @param {string[]} newScores
 */
function refactorScore(originalScore, newScores) {
  /** @type {Object<string, string>} */
  const ret = {};
  newScores.forEach((id) => {
    const { course, score, classRank, totalRank } = originalScore[id];
    ret[course] = `分数: ${score}, 班级排名: ${classRank}`;
  });
  return ret;
}

loop().catch(e => console.error('未知错误', e));
