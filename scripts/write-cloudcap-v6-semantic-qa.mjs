/** Attach the completed visual mask-only review to the per-cell pixel audit. */
import fs from 'node:fs/promises';
import path from 'node:path';

const [technicalReportPath, proofDirectory, outputPath] = process.argv.slice(2);
if (!technicalReportPath || !proofDirectory || !outputPath) {
  console.error('usage: node scripts/write-cloudcap-v6-semantic-qa.mjs <technical.json> <proof-dir> <output.json>');
  process.exit(1);
}
const technical = JSON.parse(await fs.readFile(technicalReportPath, 'utf8'));
const poseFor = (row, column) => {
  if (row === 0) return 'front';
  if (row === 1) return 'side';
  if (row === 2) return 'back';
  return ['feeding', 'jumping', 'sleeping', 'sitting', 'sitting-expression'][column];
};
const noteFor = (row, column) => {
  if (row === 1) return 'Blue brim is complete; bottom-connected cream/brown pet fringe is absent.';
  if (row === 2) return 'Rear cloud body and blue band are complete; no tail, fur, or body pixels are selected.';
  if (row === 3 && column === 0) return 'Rainbow and gold star are complete; raised feeding tail is absent.';
  if (row === 3 && column === 1) return 'Cloud-cap silhouette is complete; forehead fur and tail fur are absent.';
  if (row === 3 && column === 2) return 'Slanted cloud body and blue brim are complete; orange ear/body/fur pixels are absent.';
  return 'Cloud body, rainbow, star, and blue brim are complete; no pet pixels are visible.';
};

const cells = technical.cells.map((cell) => ({
  row: cell.row,
  column: cell.column,
  pose: poseFor(cell.row, cell.column),
  maskPixels: cell.pixels,
  connectedAccessoryComponents: cell.components.length,
  enclosedTransparentHoles: cell.enclosedTransparentHoles.length,
  petFurPixelsVisible: false,
  petEarPixelsVisible: false,
  petTailPixelsVisible: false,
  petBodyPixelsVisible: false,
  hardCropDetected: false,
  sourceCoordinateViolations: cell.layerCoordinateOrSourceViolations,
  proof4xMagenta: path.join(proofDirectory, `layer-v6-qa-r${cell.row}c${cell.column}-4x-magenta.png`),
  note: noteFor(cell.row, cell.column),
  verdict: cell.technicalVerdict === 'PASS' ? 'PASS' : 'REJECT',
}));
const report = {
  subject: 'head-06 cloud-cap v6 mask-only QA',
  reviewedAsset: technical.inputs.refinedMaskPath,
  reviewedLayer: technical.inputs.layerPath,
  acceptancePolicy: {
    requiredPassingCells: 20,
    requiredEnclosedTransparentHolesPerCell: 0,
    requiredAccessoryComponentsPerCell: 1,
    requiredPetPixels: 0,
    requiredCoordinateViolations: 0,
    transformsAllowed: false,
  },
  geometry: technical.geometry,
  result: {
    passingCells: cells.filter((cell) => cell.verdict === 'PASS').length,
    totalCells: cells.length,
    totalEnclosedTransparentHoles: cells.reduce((sum, cell) => sum + cell.enclosedTransparentHoles, 0),
    totalCoordinateViolations: cells.reduce((sum, cell) => sum + cell.sourceCoordinateViolations, 0),
    semanticPetContaminationFound: false,
    verdict: cells.every((cell) => cell.verdict === 'PASS') ? 'PASS' : 'REJECT',
  },
  sourceCorrection: {
    inputV4Verdict: 'REJECT',
    reason: 'The five side cells contained 54 bottom-connected cream/brown pet-fringe pixels; r1c0 also left a five-pixel island after fringe removal.',
    correction: 'Removed only those source-coordinate pixels and the isolated r1c0 island; all other mask pixels are unchanged.',
  },
  cells,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, result: report.result }, null, 2));
