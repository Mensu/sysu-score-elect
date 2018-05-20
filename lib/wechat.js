import request from 'request-promise-native';
import TaskQueue from './TaskQueue';

// turn on json option
const json = true;

class AccessToken {
  /**
   *
   * @param {string} appid
   * @param {string} secret
   */
  constructor(appid, secret) {
    this.token = null;
    this.expires_at = 0;
    this.appid = appid;
    this.secret = secret;
    this.queue = new TaskQueue(1, 10 * 1000);
  }

  /**
   * @private
   */
  async refresh() {
    const { appid, secret } = this;
    const now = new Date().getTime();
    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const qs = { grant_type: 'client_credential', appid, secret };
    /** @type {{ access_token: string, expires_in: number, errcode: number, errmsg: string }}  */
    const { access_token, expires_in, errcode, errmsg } = await request.get(url, { qs, json });
    if (errcode === -1) {
      return this.refresh();
    }
    if (errcode) {
      throw new Error(`${errcode}: ${errmsg}`);
    }
    this.token = access_token;
    this.expires_at = now + (expires_in - 5) * 1000;
  }

  /**
   * @public
   */
  async get() {
    if (new Date() >= this.expires_at) {
      await this.queue.add(() => this.refresh());
    }
    return this.token;
  }
}

export class Wechat {
  /**
   *
   * @param {string} appid
   * @param {string} secret
   */
  constructor(appid, secret) {
    this.token = new AccessToken(appid, secret);
  }

  async getUserList() {
    const url = 'https://api.weixin.qq.com/cgi-bin/user/get';
    const qs = { access_token: await this.token.get() };
    /** @type {{ data: { open_id: string[] }, errcode: number, errmsg: string }}  */
    const { data: open_id, errcode, errmsg } = await request.get(url, { qs, json });
    if (errcode === -1) {
      return this.getUserList();
    }
    if (errcode) {
      throw new Error(`${errcode}: ${errmsg}`);
    }
    return open_id;
  }

  /**
   *
   * @param {string} touser
   * @param {string} template_id
   * @param {{ [x: string]: { value: string, color: string } }} data
   */
  async sendMsg(touser, template_id, data) {
    const url = 'https://api.weixin.qq.com/cgi-bin/message/template/send';
    const qs = { access_token: await this.token.get() };
    const body = { touser, template_id, data };
    /** @type {{ msgid: number, errcode: number, errmsg: string }}  */
    const { errcode, errmsg } = await request.post(url, { qs, body, json });
    if (errcode === -1) {
      return this.sendMsg(touser, template_id, data);
    }
    if (errcode) {
      throw new Error(`${errcode}: ${errmsg}`);
    }
  }
}
