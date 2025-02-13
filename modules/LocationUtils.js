import resolvePathname from 'resolve-pathname';
import valueEqual from 'value-equal';

import { parsePath } from './PathUtils';

/*
  基于入参 做一些参数的从处理罢了 例如path可以是string 也可以是个对象等
 */
export function createLocation(path, state, key, currentLocation) {
  let location;
  if (typeof path === 'string') {
    // Two-arg form: push(path, state)
    location = parsePath(path);
    location.state = state;
  } else {
    // One-arg form: push(location)
    location = { ...path };

    if (location.pathname === undefined) location.pathname = '';

    if (location.search) {
      if (location.search.charAt(0) !== '?')
        location.search = '?' + location.search;
    } else {
      location.search = '';
    }

    if (location.hash) {
      if (location.hash.charAt(0) !== '#') location.hash = '#' + location.hash;
    } else {
      location.hash = '';
    }

    if (state !== undefined && location.state === undefined)
      location.state = state;
  }

  try {
    location.pathname = decodeURI(location.pathname);
  } catch (e) {
    if (e instanceof URIError) {
      throw new URIError(
        'Pathname "' +
          location.pathname +
          '" could not be decoded. ' +
          'This is likely caused by an invalid percent-encoding.'
      );
    } else {
      throw e;
    }
  }

  if (key) location.key = key;

  if (currentLocation) {
    // Resolve incomplete/relative pathname relative to current location.
    if (!location.pathname) {
      location.pathname = currentLocation.pathname;
    } else if (location.pathname.charAt(0) !== '/') {
      location.pathname = resolvePathname(
        location.pathname,
        currentLocation.pathname
      );
    }
  } else {
    // When there is no prior location and pathname is empty, set it to /
    if (!location.pathname) {
      location.pathname = '/';
    }
  }

  return location;
}

export function locationsAreEqual(a, b) {
  return (
    a.pathname === b.pathname &&
    a.search === b.search &&
    a.hash === b.hash &&
    a.key === b.key &&
    valueEqual(a.state, b.state)
  );
}
