// WKWebView may cancel a report while navigating or presenting a share sheet.
// Discard that incomplete report; the fixture keeps sending fresh measurements.
export async function readFixtureReport(request) {
  let body = '';
  try {
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 10000) return { status: 413 };
    }
  } catch (error) {
    if (request.aborted || error.code === 'ECONNRESET') return { status: 0 };
    throw error;
  }
  if (request.aborted) return { status: 0 };
  try {
    const report = JSON.parse(body);
    if (!report || typeof report !== 'object' || typeof report.path !== 'string') return { status: 400 };
    return { status: 204, report };
  } catch { return { status: 400 }; }
}
