export default class BlockingQueue extends Array {
  /**
   *
   * @param {number} timeout
   */
  constructor(timeout = 1000) {
    super();
    this.timeout = timeout;
    this.timeoutId = null;
    this.isIdle = true;
  }
  /**
   *
   * @param {function} func
   * @public
   */
  async push(func) {
    return new Promise((resolve, reject) => {
      super.push(async () => {
        let toContinue = true;

        this.setTimeout(() => {
          toContinue = false;
          this.isIdle = true;
          this.pop();
        });

        try {
          resolve(await func());
        } catch (e) {
          reject(e);
        }
        return toContinue;
      });

      if (this.isIdle) this.pop();
    });
  }
  /**
   * @private
   */
  async pop() {
    this.clearTimeout();
    if (this.length === 0) return;
    const trigger = super.shift();

    this.isIdle = false;
    const toContinue = await trigger();
    if (!toContinue) return;
    this.isIdle = true;

    return this.pop();
  }
  /**
   * @param {function} func
   * @private
   */
  setTimeout(func) {
    this.clearTimeout();
    this.timeoutId = setTimeout(func, this.timeout);
  }
  /**
   * @private
   */
  clearTimeout() {
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}
