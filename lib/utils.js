import cheerio from 'cheerio';
import moment from 'moment';

/**
 * 删除 obj 里的指定属性
 * @param  {object}      obj
 * @param  {...string}   props
 */
export function deleteProps(obj, ...props) {
  props.forEach(one => delete obj[one]);
}

/**
 * 替换属性
 * @param  {object}  obj
 * @param  {object}  map
 */
export function replaceProp(obj, map) {
  Object.entries(map).forEach(([key, value]) => {
    if (obj.hasOwnProperty(key)) obj[value] = obj[key];
  });
  Object.keys(map).forEach(key => delete obj[key]);
}

/**
 * 将 obj 里的指定属性转换为数字
 * @param  {object}      obj
 * @param  {...string}   props
 */
export function propsToNum(obj, ...props) {
  props.forEach((one) => {
    if (Reflect.hasOwnProperty.call(obj, one)) {
      obj[one] = Number(obj[one]);
    }
  });
}

/**
 * setTimeout 的 Promise 封装
 * @param  {number}    millisecond
 * @return {void}
 */
export function setTimeoutAsync(millisecond) {
  return new Promise(resolve => setTimeout(resolve, millisecond));
}

/**
 * 将数组转化为映射
 * @param  {object}      body
 * @param  {string}      [keyPropName]     要作为 key 的属性的属性名
 * @param  {string}      [valuePropName]   要作为 value 的属性的属性名
 * @return {object}
 * @author 陈宇翔
 */
export function arr2Map(arr, keyPropName, valuePropName) {
  const ret = {};
  arr.forEach((one) => {
    ret[keyPropName ? one[keyPropName] : one] = (valuePropName ? one[valuePropName] : one);
  });
  return ret;
}

/**
 * 格式化日期字符串
 * @param  {Date}      date
 * @return {string}           日期字符串
 * @author 陈宇翔
 */
export function formatDate(date) {
  return moment(new Date(date)).format('YYYY-MM-DD HH:mm:ss.SSS');
}

export function parseAsync(html) {
  return cheerio.load(html);
}
