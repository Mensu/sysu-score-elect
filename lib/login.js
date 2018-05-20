import { resolve, URL } from 'url';
import request from 'request-promise-native';
import { recognizeCaptcha } from './captcha';

const services = {
  /** 教务系统 */
  jwxt: 'http://uems.sysu.edu.cn/jwxt/api/sso/cas/login?pattern=student-login',
  /** 选课系统 */
  elect: 'https://uems.sysu.edu.cn/elect/casLogin',
  /** 教学管理 */
  jxgl: 'https://uems.sysu.edu.cn/jxgl/casLogin',
};

// request default settings
const headers = { 'User-Agent': 'nodejs' };
const req = request.defaults({ headers });
const allow302 = { simple: false, resolveWithFullResponse: true };

/**
 * 登录主逻辑
 * @param {string} service
 * @param {string} username
 * @param {string} password
 */
async function login(service, username, password) {
  // regexp to extract redirect url from html
  const redirectReg = /(?:\r\n){0,}loadCodeList\(\);(?:\r\n){0,}window\.location {0,}= {0,}"(\S{1,})"/;
  const wrongCaptchaReg = /Captcha is wrong/;
  const invalidCredentialsReg = /Invalid credentials\.<\/div>/;

  const jar = request.jar();
  // format url with service query set
  const url = new URL('https://cas.sysu.edu.cn/cas/login');
  url.searchParams.set('service', service);
  while (true) {
    // fetch login page
    const casLoginPageHtml = await req.get(url, { jar });
    // parse hidden fields
    const hidden = getHiddenFieldsFromPage(casLoginPageHtml);
    // fetch captcha
    const captcha = await getCaptcha(jar);
    // post login form
    let location = url;
    const form = { username, password, captcha, ...hidden };
    const loginRes = await req.post(location, { form, jar, ...allow302 });

    // examine login response
    const { body } = loginRes;
    ({ headers: { location } } = loginRes);

    // username or password mismatch
    if (invalidCredentialsReg.test(body)) {
      // abort
      throw new Error('Wrong username or password');
    }
    // wrong captcha
    if (wrongCaptchaReg.test(body)) {
      console.log('[login]', 'wrong captcha =', captcha);
      await new Promise(r => setTimeout(r, 1000));
      console.log('[login]', 'trying again...');
      // try again
      continue;
    }
    // following redirect until no location (redirect) can be found
    while (location) {
      // GET requests follow redirects automatically
      // however, sometimes we would be redirected to http://uems.sysu.edu.cn/jwxt/login.do?method=login
      // where we are expected to execute js script 'window.location = xxx',
      // where 'xxx' is the real final destination url
      const { body, request: { href } } = await req.get(location, { jar, ...allow302 });
      // expose the final destination url to jar
      Object.assign(jar, { location: href });
      // parse http://uems.sysu.edu.cn/jwxt/login.do?method=login for the final destination url
      [, location] = body.match(redirectReg) || [];
      // resolve location to absolute url
      if (location) location = resolve(href, location);
    }
    // then redirects end, we are done
    break;
  }
  // return the cookie jar to the user
  return jar;
}

/**
 * 从 CAS 登录页获取隐藏表单项
 * @param {string} html
 */
function getHiddenFieldsFromPage(html) {
  // regexps to extract hidden fields
  const executionReg = /<input type="hidden" name="execution" value="(\S{1,})" \/>/;
  // parse hidden fields
  const [, execution] = html.match(executionReg);
  const _eventId = 'submit';
  const geolocation = '';
  return { execution, _eventId, geolocation };
}

// just for typing
const Jar = !1 && request.jar();
/**
 * 获得登录需要的验证码
 * @param {Jar} jar
 */
async function getCaptcha(jar) {
  const casCaptchaUrl = 'https://cas.sysu.edu.cn/cas/captcha.jsp';
  while (true) {
    // fetch captcha image buffer
    const buffer = await req.get(casCaptchaUrl, { jar, encoding: null });
    // recognize captcha
    const result = await recognizeCaptcha(buffer);
    // if the result is valid captcha, return it (not necessarily correct though)
    if (/^[0-9A-Za-z]{4}$/.test(result)) {
      console.log('[login]', 'recognized captcha =', result);
      return result;
    }
    // if invalid, try again
    console.log('[login]', 'invalid captcha =', result);
    await new Promise(r => setTimeout(r, 500));
    console.log('[login]', 'refresh again...');
  }
}

async function test() {
  /* eslint no-eval: "off" */
  const credentials = ['netid', 'pass'];
  let jar = null;
  let body = null;

  // test 教务系统
  jar = await login(services.jwxt, ...credentials);
  body = await req.get('https://uems.sysu.edu.cn/jwxt/achievement-manage/score-check/list?addScoreFlag=true', { jar, json: true });
  if (Array.isArray(body.data)) {
    console.log(services.jwxt, '沃克');
  }
  // test 选课系统
  jar = await login(services.elect, ...credentials);
  body = await req.get(jar.location, { jar });
  if (/选课结果/.test(body)) {
    console.log(services.elect, '沃克');
  }
  // test 教学管理系统
  jar = await login(services.jxgl, ...credentials);
  body = await req.get(jar.location, { jar });
  if (/页面正在加载, 请稍候/.test(body)) {
    console.log(services.jxgl, '沃克');
  }
}
// test();

/**
 * 登录教务系统
 * @param {string} username
 * @param {string} password
 */
export async function jwxt(username, password) {
  return login(services.jwxt, username, password);
}

/**
 * 登录选课系统
 * @param {string} username
 * @param {string} password
 */
export async function elect(username, password) {
  return login(services.elect, username, password);
}

/**
 * 登录教学管理系统
 * @param {string} username
 * @param {string} password
 */
export async function jxgl(username, password) {
  return login(services.jxgl, username, password);
}
