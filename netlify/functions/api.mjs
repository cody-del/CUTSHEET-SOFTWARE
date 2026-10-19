import {calculate, ValidationError, SCOPE, VERSION} from '../../calculations.mjs';
import {createPDF} from '../../pdf.mjs';
import {accountAPI} from '../../account-runtime.mjs';

const MAX_BODY_BYTES = 512000;
const json = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
});

// Keep the browser's existing API URLs on the deployed site.
export const config = {path: ['/api/info','/api/calculate','/api/pdf']};

export default request=>accountAPI.protect(request,calculationHandler);
export async function calculationHandler(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/info' && request.method === 'GET') {
    return json(200, {scope: SCOPE, version: VERSION});
  }
  if (!['/api/calculate', '/api/pdf'].includes(url.pathname)) {
    return json(404, {error: 'Unknown endpoint.'});
  }
  if (request.method !== 'POST') return json(405, {error: 'POST required.'});
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json(403, {error: 'Invalid origin.'});
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json(415, {error: 'Expected JSON.'});
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return json(413, {error: 'Job is too large.'});
  }
  try {
    const reader = request.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return json(413, {error: 'Job is too large.'});
        }
        chunks.push(Buffer.from(value));
      }
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return json(400, {error: 'Invalid JSON.'}); }
    if (url.pathname === '/api/calculate') return json(200, calculate(data));
    if (!data || typeof data !== 'object') return json(400, {error: 'A job is required.'});
    if (data.units !== undefined && !['mm', 'in'].includes(data.units)) {
      return json(400, {error: 'Invalid output unit.'});
    }
    for (const key of ['number', 'customer']) {
      if (typeof data.job?.[key] !== 'string' || data.job[key].length > 120) {
        return json(400, {error: `Invalid job ${key}.`});
      }
    }
    const pdf = await createPDF(data.job, {combined: !!data.combined, units: data.units || 'mm'});
    return new Response(pdf, {headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="shutter-cut-sheets.pdf"',
      'Cache-Control': 'no-store',
    }});
  } catch (error) {
    if (error instanceof ValidationError) return json(422, {error: error.message});
    // Do not log job/customer data on the hosted service.
    return json(422, {error: 'A workbook rule could not be resolved. Check this configuration against the original workbook.'});
  }
}
