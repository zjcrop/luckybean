// GET-only helper. The deadline covers headers AND the complete response body.
export async function fetchResource(url, {
  format='json', timeoutMs=20000, attempts=3, headers={},
  fetchImpl=globalThis.fetch, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('Invalid retry limit');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request deadline');
  for (let attempt=1; attempt<=attempts; attempt++) {
    const controller=new AbortController();
    let timer;
    let failure;
    try {
      const timeout=new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          const error=new Error(`GET deadline exceeded after ${timeoutMs}ms: ${url}`);
          error.name='TimeoutError'; controller.abort(error); reject(error);
        },timeoutMs);
      });
      return await Promise.race([(async()=>{
        const response=await fetchImpl(url,{method:'GET',cache:'no-store',headers,signal:controller.signal});
        if (!response.ok) {
          const error=new Error(`GET ${url}: HTTP ${response.status}`);
          error.retryable=response.status===429 || response.status>=500
            || (response.status===403 && response.headers.get('x-ratelimit-remaining')==='0');
          const seconds=Number(response.headers.get('retry-after'));
          if (Number.isFinite(seconds) && seconds>0) error.retryAfterMs=seconds*1000;
          await response.body?.cancel();
          throw error;
        }
        if (format==='bytes') return response.arrayBuffer();
        const body=await response.text();
        return format==='text' ? body : JSON.parse(body);
      })(),timeout]);
    } catch(error) {
      failure=error;
      const retryable=error.retryable===true || ['AbortError','TimeoutError'].includes(error.name) || error instanceof TypeError;
      if (!retryable || attempt===attempts) throw error;
    } finally { clearTimeout(timer); }
    await sleep(Math.min(failure.retryAfterMs || 500*attempt,5000));
  }
}
