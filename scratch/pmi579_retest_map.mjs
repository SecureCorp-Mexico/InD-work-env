import { cameraRecordingStats } from './recordings.mjs';

const cams = [
  'i150200700_579_2_24_bullet',
  'i150200700_579_2_25_bullet',
  'i150200700_578_2_10_bullet',
];
const suf = { main: '_2', sub: '_1' };
for (const stream of cams) {
  const t0 = Date.now();
  const r = await cameraRecordingStats('172.20.0.146', stream, suf);
  const buckets = r.buckets || [];
  const withFootage = buckets.filter((b) => b.ratio != null && b.ratio > 0).length;
  const last = buckets.slice(-6).map((b) => ({
    ratio: b.ratio == null ? null : Number(b.ratio.toFixed(2)),
    dur: b.duration,
  }));
  console.log(JSON.stringify({
    stream,
    ms: Date.now() - t0,
    camera: r.camera,
    coverage: r.coverage == null ? null : Number(r.coverage.toFixed(3)),
    source: r.summary_source,
    stale: r.summary_stale || false,
    buckets: buckets.length,
    withFootage,
    error: r.error || null,
    last6: last,
  }, null, 2));
}
