import pug from 'pug';
import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { formatDate, parseAsync } from './utils';
import { Wechat } from './wechat';
import config from '../config';

async function connect() {
  try {
    const transport = nodemailer.createTransport(config.notification.mail.login);
    await promisify(transport.verify).call(transport);
    return transport;
  } catch (e) {
    console.error('邮件服务验证出错:', e);
    throw e;
  }
}

async function sendMail(subject, html) {
  const options = { ...config.notification.mail.send, subject, html };
  const transport = await connect();
  try {
    return await transport.sendMail(options);
  } catch (e) {
    console.error('发送邮件时出错:', e);
  }
}

let toMail;
if (config.notification.mail) {
  toMail = pug.compileFile(config.notification.mail.path);
}
const { appid, secret, openid, elect, score } = config.notification.wechat || {};

/**
 *
 * @param {{ course: string, time: string }} target
 */
export async function sendProgressing(target) {
  const title = `${formatDate(new Date())} 正在抢课`;
  if (config.notification.mail) {
    const locals = { scores: { [target.course]: target.time } };
    await sendMail(title, toMail(locals));
  }
  if (config.notification.wechat) {
    const wc = new Wechat(appid, secret);
    const value = `${title}

- ${target.course}
- ${target.time}`;
    await wc.sendMsg(openid, elect.progressing_template_id, { content: { value } });
  }
}

/**
 *
 * @param {{ course: string, time: string }} target
 * @param {ElectResult} result
 */
export async function sendResult(target, result) {
  const { err } = result;
  let title;
  const locals = { scores: { [target.course]: target.time } };
  const success = err.caurse === null && err.code === 0;
  if (success) {
    title = `${formatDate(new Date())} 抢到课啦`;
  } else {
    title = `${formatDate(new Date())} 抢课失败`;
    locals.scores['失败原因'] = err.caurse || err.cause || err.code;
  }

  if (config.notification.mail) {
    await sendMail(title, toMail(locals));
  }
  if (config.notification.wechat) {
    const wc = new Wechat(appid, secret);
    const value = `${title}
${Object.entries(locals.scores).reduce((prev, [course, time]) => `${prev}
- ${course}
- ${time}
-`, '')}`;
    const template_id = success ? elect.success_template_id : elect.failure_template_id;
    await wc.sendMsg(openid, template_id, { content: { value } });
  }
}

/**
 *
 * @param {{[x: string]: number}} scores
 */
export async function sendScore(scores) {
  const title = `${formatDate(new Date())} 又又又又又粗成绩啦`;
  if (config.notification.mail) {
    const locals = { scores };
    await sendMail(title, toMail(locals));
  }
  if (config.notification.wechat) {
    const wc = new Wechat(appid, secret);
    const value = `${title}
${Object.entries(scores).reduce((prev, [course, score]) => `${prev}
- ${course}
- ${score}`, '')}`;
    await wc.sendMsg(openid, score.score_template_id, { content: { value } });
  }
}
