import {paddleEndpoint,scanWithPaddle} from './paddleOcr';
const canvas={toBlob:cb=>cb(new Blob(['page'],{type:'image/png'}))};
afterEach(()=>{delete global.fetch;delete process.env.REACT_APP_OCR_SERVER_URL;});
test('rejects invalid results instead of trusting arbitrary JSON',async()=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({text:'data',confidence:NaN,uncertain:[]})});await expect(scanWithPaddle(canvas,'eng',new AbortController().signal)).rejects.toThrow('invalid scan result');});
test('propagates backend busy error',async()=>{global.fetch=jest.fn().mockResolvedValue({ok:false,json:async()=>({detail:'Scanner is busy'})});await expect(scanWithPaddle(canvas,'eng',new AbortController().signal)).rejects.toThrow('busy');});
test('cancelled request never uploads a page',async()=>{global.fetch=jest.fn();const controller=new AbortController();controller.abort();await expect(scanWithPaddle(canvas,'eng',controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetch).not.toHaveBeenCalled();});
test('configured backend origin produces the scan endpoint',()=>{process.env.REACT_APP_OCR_SERVER_URL='https://ocr.example';expect(paddleEndpoint()).toBe('https://ocr.example/api/ocr');});

test('reports model phase and stops polling after recognition',async()=>{
  jest.useFakeTimers();
  let finish;
  const progress=jest.fn();
  global.fetch=jest.fn((url,options)=> options.method==='POST'
    ? new Promise(resolve=>{finish=resolve;})
    : Promise.resolve({ok:true,json:async()=>({status:'processing'})}));
  try {
    const scan=scanWithPaddle(canvas,'eng',new AbortController().signal,progress);
    await Promise.resolve(); await Promise.resolve();
    jest.advanceTimersByTime(2000);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(progress).toHaveBeenCalledWith({status:'processing',elapsed:2});
    finish({ok:true,json:async()=>({text:'hello',confidence:90,uncertain:[]})});
    await expect(scan).resolves.toMatchObject({text:'hello'});
    const calls=fetch.mock.calls.length; jest.advanceTimersByTime(10000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  } finally {jest.useRealTimers();}
});
test('no internet still permits a reachable local Python backend',async()=>{
  const online=jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
  global.fetch=jest.fn((url,options)=>Promise.resolve({ok:true,json:async()=> options.method==='POST' ? {text:'Local offline scan',confidence:90,uncertain:[]} : {status:'ready'}}));
  try {
    await expect(scanWithPaddle(canvas,'eng',new AbortController().signal)).resolves.toMatchObject({text:'Local offline scan'});
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/ocr\/health$/);
    expect(fetch.mock.calls[1][1].method).toBe('POST');
  } finally {online.mockRestore();}
});
test('unreachable offline Python backend produces actionable fallback error',async()=>{
  const online=jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
  global.fetch=jest.fn().mockRejectedValue(new Error('Network unavailable'));
  try {await expect(scanWithPaddle(canvas,'eng',new AbortController().signal)).rejects.toThrow('Keep it running');expect(fetch).toHaveBeenCalledTimes(1);}
  finally {online.mockRestore();}
});
