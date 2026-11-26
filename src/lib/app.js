import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';

export async function api(path, {method = 'GET', body, headers = {}, raw} = {}) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...headers},
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : type.includes('text/html') ? await response.text() : await response.blob();
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('v1/')) window.dispatchEvent(new Event('signed-out'));
    throw Object.assign(new Error(payload?.error || `הבקשה נכשלה (${response.status})`), {status: response.status});
  }
  return payload?.data !== undefined ? payload.data : payload;
}

export async function upload(file) {
  if (file.size > 4 * 1024 * 1024) throw new Error('הקובץ גדול מ־4MB');
  return api(`v1/files?type=${encodeURIComponent(file.type)}`, {method: 'POST', raw: file, headers: {'Content-Type': 'application/octet-stream'}});
}

/** Fetch a file endpoint and hand it to the browser as a download. */
export async function download(path, filename, options) {
  const blob = await api(path, options);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

const subscribe = (callback) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname);

export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function useData(path) {
  const [state, setState] = useState({data: null, error: ''});
  const reload = useCallback(
    () =>
      path
        ? api(path).then(
            (data) => setState({data, error: ''}),
            (error) => setState({data: null, error: error.message}),
          )
        : Promise.resolve(),
    [path],
  );
  useEffect(() => {
    setState({data: null, error: ''});
    reload();
  }, [reload]);
  return {...state, reload};
}

export const notify = (message, status = 'success') => window.dispatchEvent(new CustomEvent('notice', {detail: {message, status}}));

/** Run an action and report the outcome. Resolves to false when it failed. */
export async function attempt(action, success) {
  try {
    const result = await action();
    if (success) notify(success);
    return result ?? true;
  } catch (error) {
    notify(error.message, 'error');
    return false;
  }
}

export async function copy(text) {
  await navigator.clipboard.writeText(text);
  notify('הקישור הועתק');
}
