import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('artifacts/head20-attempt6-per-cell/c03/revision-6');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const file=name=>path.join(out,name);
const lineagePath=file('c03-r6-lineage.json');
const rawProvenance=JSON.parse(await fs.readFile(file('c03-r6-raw-provenance.json'),'utf8'));
const lineage=JSON.parse(await fs.readFile(lineagePath,'utf8'));
const names=[
  'c03-r6-raw-full-dressed-imagegen-source.png',
  'c03-r6-target-coordinate-locked-160x160.png',
  'c03-r6-helmet-layer-same-coordinate-160x160.png',
  'c03-r6-helmet-mask-same-coordinate-160x160.png',
  'c03-r6-helmet-pre-gate-candidate-layer-160x160.png',
  'c03-r6-helmet-pre-gate-candidate-mask-160x160.png',
  'c03-r6-rightcup-target-local-semantic-pregate.json',
  'c03-r6-rightcup-final-semantic-audit.json',
  'c03-r6-mechanical-audit.json',
  'c03-tail-visible-pixels-mask.png',
  'c03-ear-extension-empty.png',
  'c03-protection-evidence.json',
  'c03-r6-raw-provenance.json',
];
const hashes={};for(const name of names)hashes[name]=await hash(file(name));
lineage.generation=rawProvenance.generation;
lineage.rawFullRedrawSource=rawProvenance.rawFullRedrawSource;
lineage.normalization={...lineage.normalization,sourceSha256:rawProvenance.rawFullRedrawSource.sha256};
lineage.independentPreGate={
  candidateOnly:true,
  targetLocalReport:{path:file('c03-r6-rightcup-target-local-semantic-pregate.json'),sha256:hashes['c03-r6-rightcup-target-local-semantic-pregate.json'],verdict:'PASS'},
  finalLayerReport:{path:file('c03-r6-rightcup-final-semantic-audit.json'),sha256:hashes['c03-r6-rightcup-final-semantic-audit.json'],verdict:'PASS'},
};
lineage.mechanicalAudit={path:file('c03-r6-mechanical-audit.json'),sha256:hashes['c03-r6-mechanical-audit.json'],verdict:'PASS_MECHANICAL_PENDING_VISUAL_CRITIC'};
lineage.freeze={frozen:true,frozenAt:'2026-08-26T18:00:00+08:00',artifactSha256:hashes,rule:'No further image, mask, layer, target, or lineage writes are permitted without a fresh numbered revision.'};
lineage.frozen=true;
lineage.verdict='FROZEN_PENDING_INDEPENDENT_VISUAL_CRITIC';
lineage.gates={...lineage.gates,critic:'PENDING_INDEPENDENT_VISUAL_REVIEW',publishable:false};
await fs.writeFile(lineagePath,`${JSON.stringify(lineage,null,2)}\n`);
console.log(JSON.stringify({lineagePath,lineageSha256:await hash(lineagePath),frozen:lineage.frozen,artifactSha256:hashes},null,2));
