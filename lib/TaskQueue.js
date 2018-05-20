class Task {
  /**
   * @param {{ (task: Task): void }} execute 标志任务开始执行，通过调用 `task.finish()` 标志任务结束
   * @param {number} [timeout]
   */
  constructor(execute, timeout = 1000) {
    this.execute = execute;
    this.timeout = timeout;
    this.timer = null;
    this._finish = null;
    /** resolve 时任务结束或超时 */
    this.promise = new Promise((_finish) => { this._finish = _finish; });
  }

  /**
   * @public
   */
  exec() {
    this.setTimeout();
    // 传入 this，方便调用者通过 `task.finish()` 表示任务结束
    this.execute(this);
    return this.promise;
  }

  /**
   * @public
   */
  finish() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this._finish) {
      this._finish();
    }
    this._finish = null;
  }

  /**
   * @private
   */
  setTimeout() {
    if (this.timeout !== null) {
      this.timer = setTimeout(() => this.finish(), this.timeout);
    }
  }
}

class Worker {
  /**
   * 不停地从队列中获取任务并执行
   * @param {number} id
   * @param {{ fetchOneTask(...args: any[]): Promise<Task> & { cancel: () => void } }} taskQueue
   */
  constructor(id, taskQueue) {
    this.id = id;
    this.taskQueue = taskQueue;
    /** @type {Promise<Task>} */
    this.stopper = null;
    this._stop = null;
    this.cancelFetching = null;
  }

  /**
   * @public
   */
  async work() {
    if (this.stopper) return;
    this.stopper = new Promise((_stop) => { this._stop = _stop; });
    while (this.stopper) {
      const task = await Promise.race([this.fetch(), this.stopper]);
      if (task === null) break;
      await task.exec();
    }
  }

  /**
   * 从任务队列中获取任务
   * @private
   */
  async fetch() {
    const promise = this.taskQueue.fetchOneTask();
    this.cancelFetching = promise.cancel;
    try {
      return await promise;
    } finally {
      this.cancelFetching = null;
    }
  }

  /**
   * @public
   */
  stop() {
    if (this._stop) {
      this._stop(null);
    }
    if (this.cancelFetching) {
      this.cancelFetching();
    }
    this._stop = null;
    this.cancelFetching = null;
    this.stopper = null;
  }
}

export default class TaskQueue {
  constructor(workerNum = 1, timeout = 1000) {
    /** @type {Task[]} 任务队列 */
    this.queue = [];
    /** @type {function[]} 新任务事件队列 */
    this.newTaskListeners = [];
    this.timeout = timeout;
    this.workers = [...Array(workerNum).keys()].map(i => new Worker(i + 1, this));
    this.workers.forEach(worker => worker.work());
  }

  /**
   * @template {T}
   * @param {{ (...args: any[]): T | Promise<T> }} func
   * @public
   */
  async add(func) {
    // await 返回表示任务开始
    const task = await this.createOneTask();

    try {
      return await func();
    } finally {
      // 标记任务结束
      task.finish();
    }
  }

  /**
   * 创建一个任务并加入队列。任务开始时 resolve
   * @return {Promise<Task>}
   * @private
   */
  async createOneTask() {
    return new Promise((execute) => {
      this.queue.push(new Task(execute, this.timeout));
      this.emitNewTask();
    });
  }

  /**
   * 从任务队列中获取一个任务。如果没有任务则等待。
   * @public
   */
  fetchOneTask() {
    /** @type {() => void} */
    let cancel;
    /** @type {Promise<Task>} */
    const promise = new Promise((provide) => {
      // 提供任务给 `fetchOneTask` 的调用者
      const onNewTask = () => provide(this.queue.shift());
      // 取消监听新任务事件
      cancel = () => this.offNewTask(onNewTask);
      // 监听新任务事件
      this.onNewTask(onNewTask);
      // 尝试获取新任务
      this.emitNewTask();
    });
    return Object.assign(promise, { cancel });
  }

  /**
   * 添加新任务事件的监听器
   * @param {function} listener
   * @private
   */
  onNewTask(listener) {
    this.newTaskListeners.push(listener);
  }

  /**
   * 移除新任务事件的监听器
   * @param {function} listener
   * @private
   */
  offNewTask(listener) {
    this.newTaskListeners = this.newTaskListeners.filter(one => one !== listener);
  }

  /**
   * 触发新任务事件
   * @private
   */
  emitNewTask() {
    while (this.newTaskListeners.length > 0 && this.queue.length > 0) {
      this.newTaskListeners.shift()();
    }
  }
}
