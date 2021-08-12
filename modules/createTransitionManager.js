import warning from 'tiny-warning';

// 这里其实就是个发布订阅的管理器
function createTransitionManager() {
  let prompt = null;

  function setPrompt(nextPrompt) {
    warning(prompt == null, 'A history supports only one prompt at a time');

    prompt = nextPrompt;

    return () => {
      if (prompt === nextPrompt) prompt = null;
    };
  }

  // ？？一般这个方法就是直接调用了callback(true)
  // 这里只有外界调了block方法也就是调了setPrompt才会变成非null
  // setPrompt就是多了个操作前的动作切面
  // 正常的话就都是直接调用了callback(true)
  function confirmTransitionTo(
    location,
    action,
    getUserConfirmation,
    callback
  ) {
    // TODO: If another transition starts while we're still confirming
    // the previous one, we may end up in a weird state. Figure out the
    // best way to handle this
    // 这里只有外界调了block方法也就是调了setPrompt才会变成非null
    // setPrompt就是多了个操作前的动作切面
    if (prompt != null) {
      const result =
        typeof prompt === 'function' ? prompt(location, action) : prompt;

      if (typeof result === 'string') {
        if (typeof getUserConfirmation === 'function') {
          getUserConfirmation(result, callback);
        } else {
          warning(
            false,
            'A history needs a getUserConfirmation function in order to use a prompt message'
          );

          callback(true);
        }
      } else {
        // Return false from a transition hook to cancel the transition.
        callback(result !== false);
      }
    } else {
      // 基本正常使用都是进来这个代码分支
      // ok => {}
      callback(true);
    }
  }

  let listeners = [];

  // 订阅 新增listeners
  function appendListener(fn) {
    let isActive = true;

    function listener(...args) {
      if (isActive) fn(...args);
    }

    listeners.push(listener);

    return () => {
      isActive = false;
      listeners = listeners.filter(item => item !== listener);
    };
  }

  // 通知 拿出listeners 透传参数执行 循环执行 (location, action: string)
  function notifyListeners(...args) {
    // 通知listener 执行
    listeners.forEach(listener => listener(...args));
  }

  return {
    setPrompt,
    confirmTransitionTo,
    appendListener,
    notifyListeners
  };
}

export default createTransitionManager;
