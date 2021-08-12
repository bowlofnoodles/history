import warning from 'tiny-warning';
import invariant from 'tiny-invariant';

import { createLocation } from './LocationUtils';
import {
  addLeadingSlash,
  stripTrailingSlash,
  hasBasename,
  stripBasename,
  createPath
} from './PathUtils';
import createTransitionManager from './createTransitionManager';
import {
  canUseDOM,
  getConfirmation,
  supportsHistory,
  supportsPopStateOnHashChange,
  isExtraneousPopstateEvent
} from './DOMUtils';

const PopStateEvent = 'popstate';
const HashChangeEvent = 'hashchange';

function getHistoryState() {
  try {
    return window.history.state || {};
  } catch (e) {
    // IE 11 sometimes throws when accessing window.history.state
    // See https://github.com/ReactTraining/history/pull/289
    return {};
  }
}

/**
 * Creates a history object that uses the HTML5 history API including
 * pushState, replaceState, and the popstate event.
 */
// 简单的说就是对html5 history的API做上层封装
function createBrowserHistory(props = {}) {
  invariant(canUseDOM, 'Browser history needs a DOM');

  const globalHistory = window.history;
  // 判断兼容性
  const canUseHistory = supportsHistory();
  const needsHashChangeListener = !supportsPopStateOnHashChange();

  // 选项
  const {
    forceRefresh = false,
    getUserConfirmation = getConfirmation,
    keyLength = 6
  } = props;
  const basename = props.basename
    ? stripTrailingSlash(addLeadingSlash(props.basename))
    : '';

  function getDOMLocation(historyState) {
    const { key, state } = historyState || {};
    const { pathname, search, hash } = window.location;

    let path = pathname + search + hash;

    warning(
      !basename || hasBasename(path, basename),
      'You are attempting to use a basename on a page whose URL path does not begin ' +
        'with the basename. Expected path "' +
        path +
        '" to begin with "' +
        basename +
        '".'
    );

    if (basename) path = stripBasename(path, basename);

    return createLocation(path, state, key);
  }

  // 产生一个keyLength长度的随机字符串
  function createKey() {
    return Math.random()
      .toString(36)
      .substr(2, keyLength);
  }

  const transitionManager = createTransitionManager();

  function setState(nextState) {
    // 跟history做合并替换值 nextState => {action, location}
    Object.assign(history, nextState);
    history.length = globalHistory.length;
    // 通知订阅者
    transitionManager.notifyListeners(history.location, history.action);
  }

  function handlePopState(event) {
    // Ignore extraneous popstate events in WebKit.
    if (isExtraneousPopstateEvent(event)) return;
    handlePop(getDOMLocation(event.state));
  }

  function handleHashChange() {
    handlePop(getDOMLocation(getHistoryState()));
  }

  let forceNextPop = false;

  function handlePop(location) {
    if (forceNextPop) {
      forceNextPop = false;
      setState();
    } else {
      // action 是popstate
      const action = 'POP';

      transitionManager.confirmTransitionTo(
        location,
        action,
        getUserConfirmation,
        ok => {
          if (ok) {
            // 然后接着做setState通知listeners
            setState({ action, location });
          } else {
            revertPop(location);
          }
        }
      );
    }
  }

  function revertPop(fromLocation) {
    const toLocation = history.location;

    // TODO: We could probably make this more reliable by
    // keeping a list of keys we've seen in sessionStorage.
    // Instead, we just default to 0 for keys we don't know.

    let toIndex = allKeys.indexOf(toLocation.key);

    if (toIndex === -1) toIndex = 0;

    let fromIndex = allKeys.indexOf(fromLocation.key);

    if (fromIndex === -1) fromIndex = 0;

    const delta = toIndex - fromIndex;

    if (delta) {
      forceNextPop = true;
      go(delta);
    }
  }

  const initialLocation = getDOMLocation(getHistoryState());
  let allKeys = [initialLocation.key];

  // Public interface

  function createHref(location) {
    return basename + createPath(location);
  }

  // 对history的pushState做了和发布订阅结合上层封装
  function push(path, state) {
    warning(
      !(
        typeof path === 'object' &&
        path.state !== undefined &&
        state !== undefined
      ),
      'You should avoid providing a 2nd state argument to push when the 1st ' +
        'argument is a location-like object that already has state; it is ignored'
    );

    const action = 'PUSH';
    // 做参数处理
    const location = createLocation(path, state, createKey(), history.location);

    // 主要的，前面有说过这个方法一般就是直接调用了callback，也就是ok => {}
    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;

        const href = createHref(location);
        const { key, state } = location;

        if (canUseHistory) {
          // 调用window.history api
          globalHistory.pushState({ key, state }, null, href);

          // 是否强制刷新 默认都是false 一般单页面路由肯定都是false 我们不依赖于浏览器的刷新
          if (forceRefresh) {
            window.location.href = href;
          } else {
            // 这里key的逻辑 其实就跟replace不一样 replace是替换 push是push
            // 这里是正常的主逻辑
            // 上一步location的 key 的 index
            const prevIndex = allKeys.indexOf(history.location.key);
            // copy下来allKeys
            const nextKeys = allKeys.slice(
              0,
              prevIndex === -1 ? 0 : prevIndex + 1
            );
            // push进去 这一步计算好的location
            nextKeys.push(location.key);
            // 替换掉
            allKeys = nextKeys;

            // 要触发订阅者的更新了 也就是listeners
            setState({ action, location });
          }
        } else {
          // 如果不支持history api
          // 那就直接默认刷新了
          warning(
            state === undefined,
            'Browser history cannot push state in browsers that do not support HTML5 history'
          );

          window.location.href = href;
        }
      }
    );
  }

  // 对history的replaceState做了和发布订阅结合上层封装
  // push方法基本一致 无非就是处理方法有些不一样 主逻辑都是一样的
  function replace(path, state) {
    warning(
      !(
        typeof path === 'object' &&
        path.state !== undefined &&
        state !== undefined
      ),
      'You should avoid providing a 2nd state argument to replace when the 1st ' +
        'argument is a location-like object that already has state; it is ignored'
    );

    const action = 'REPLACE';
    // 做参数处理
    const location = createLocation(path, state, createKey(), history.location);

    // 主要的
    transitionManager.confirmTransitionTo(
      location,
      action,
      getUserConfirmation,
      ok => {
        if (!ok) return;

        const href = createHref(location);
        const { key, state } = location;

        if (canUseHistory) {
          globalHistory.replaceState({ key, state }, null, href);

          if (forceRefresh) {
            window.location.replace(href);
          } else {
            const prevIndex = allKeys.indexOf(history.location.key);

            if (prevIndex !== -1) allKeys[prevIndex] = location.key;

            setState({ action, location });
          }
        } else {
          warning(
            state === undefined,
            'Browser history cannot replace state in browsers that do not support HTML5 history'
          );

          window.location.replace(href);
        }
      }
    );
  }

  // 注意go方法不会触发订阅者 listen方法注册的更新 但是会触发注册的PoPStateEvent事件，即handlePopState
  // **push和replace是不会触发popstate事件的**
  function go(n) {
    globalHistory.go(n);
  }

  // go(-1)
  function goBack() {
    go(-1);
  }

  // go(1)
  function goForward() {
    go(1);
  }

  let listenerCount = 0;

  function checkDOMListeners(delta) {
    listenerCount += delta;

    // 当前已经有listener 代表已经监听过了 为了不重复监听
    if (listenerCount === 1 && delta === 1) { //
      window.addEventListener(PopStateEvent, handlePopState);

      if (needsHashChangeListener) // 不支持popstate事件 那就用hashchange做降级
        window.addEventListener(HashChangeEvent, handleHashChange);
      // 事件监听数为0了，移除事件监听
    } else if (listenerCount === 0) {
      window.removeEventListener(PopStateEvent, handlePopState);
      
      if (needsHashChangeListener) // 不支持popstate事件 那就用hashchange做降级
        window.removeEventListener(HashChangeEvent, handleHashChange);
    }
  }

  let isBlocked = false;

  function block(prompt = false) {
    const unblock = transitionManager.setPrompt(prompt);

    if (!isBlocked) {
      checkDOMListeners(1);
      isBlocked = true;
    }

    return () => {
      if (isBlocked) {
        isBlocked = false;
        checkDOMListeners(-1);
      }

      return unblock();
    };
  }

  // 会跟发布订阅的在一起transitionManager 以及 监听和移除popstate或者hashchange事件
  function listen(listener) {
    const unlisten = transitionManager.appendListener(listener);
    checkDOMListeners(1);

    // 返回个清除的函数 这里可以有个启发 现在很多这种监听都会返回一个清理函数 以后可以借鉴 mobx的reaction也是
    return () => {
      checkDOMListeners(-1);
      unlisten();
    };
  }

  const history = {
    length: globalHistory.length,
    action: 'POP',
    location: initialLocation,
    createHref,
    push,
    replace,
    // 原生的window.history.go方法
    go,
    // go(-1)
    goBack,
    // go(1)
    goForward,
    block,
    // 监听方法
    listen
  };

  return history;
}

export default createBrowserHistory;
