const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 64 * 1024 * 1024;
const elements = (node, name) => [...node.getElementsByTagNameNS('*', name)];
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function xml(value) {
  const document = new DOMParser().parseFromString(value, 'application/xml');
  if (elements(document, 'parsererror').length) throw new Error('Invalid workbook XML');
  return document;
}

function partPath(owner, target) {
  const url = new URL(String(target).replaceAll('\\', '/'), `https://workbook.invalid/${owner}`);
  if (url.origin !== 'https://workbook.invalid') throw new Error('External workbook relationship');
  return decodeURIComponent(url.pathname.slice(1));
}

function relationshipsPath(part) {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

async function relationships(zip, owner) {
  const entry = zip.file(relationshipsPath(owner));
  if (!entry) return new Map();
  const document = xml(await entry.async('string'));
  return new Map(elements(document, 'Relationship').map(rel => [rel.getAttribute('Id'), {
    path: rel.getAttribute('TargetMode') === 'External' ? null : partPath(owner, rel.getAttribute('Target')),
    type: rel.getAttribute('Type'),
  }]));
}

function relationshipId(node, name = 'id') {
  return [...node.attributes].find(attribute => attribute.localName === name)?.value;
}

function normalizeSpreadsheetXml(document) {
  // ExcelJS expects unprefixed SpreadsheetML tags; Excel and other exporters also write x: tags.
  for (const node of [document.documentElement, ...elements(document.documentElement, '*')]) {
    if (node.namespaceURI !== SPREADSHEET_NS || !node.prefix) continue;
    const replacement = document.createElementNS(SPREADSHEET_NS, node.localName);
    for (const attribute of [...node.attributes]) {
      if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/' && attribute.value === SPREADSHEET_NS) continue;
      replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    }
    while (node.firstChild) replacement.appendChild(node.firstChild);
    node.parentNode.replaceChild(replacement, node);
  }
  return new XMLSerializer().serializeToString(document);
}

function imageMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return '';
}

// Extract picture relationships before handing a picture-free workbook to ExcelJS.
// Excel uses arbitrary namespace prefixes and drawing extensions that its image loader cannot read.
export async function readQuestionWorkbook(file, { ExcelJS, JSZip, t }) {
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error(t('gh.excelFileTooLarge'));
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookPart = zip.file('xl/workbook.xml');
  if (!workbookPart) throw new Error(t('gh.excelUnreadable'));
  const workbookDocument = xml(await workbookPart.async('string'));
  const firstSheet = elements(workbookDocument, 'sheet')[0];
  if (!firstSheet) throw new Error(t('gh.excelNoSheet'));
  const workbookRels = await relationships(zip, 'xl/workbook.xml');
  const sheetPath = workbookRels.get(relationshipId(firstSheet))?.path;
  const sheetPart = sheetPath && zip.file(sheetPath);
  if (!sheetPart) throw new Error(t('gh.excelNoSheet'));
  const sheetDocument = xml(await sheetPart.async('string'));
  const sheetRels = await relationships(zip, sheetPath);
  const images = [];
  for (const drawingReference of elements(sheetDocument, 'drawing')) {
    const drawingPath = sheetRels.get(relationshipId(drawingReference))?.path;
    const drawingPart = drawingPath && zip.file(drawingPath);
    if (!drawingPart) throw new Error(t('gh.excelDrawingInvalid'));
    const drawingDocument = xml(await drawingPart.async('string'));
    const drawingRels = await relationships(zip, drawingPath);
    for (const anchor of [...drawingDocument.documentElement.children]) {
      const pictures = elements(anchor, 'pic');
      if (!pictures.length) continue;
      const from = [...anchor.children].find(node => node.localName === 'from');
      const row = Number(elements(from || anchor, 'row')[0]?.textContent);
      const column = Number(elements(from || anchor, 'col')[0]?.textContent);
      if (!Number.isInteger(row) || row < 0 || !Number.isInteger(column) || column < 0) {
        throw new Error(t('gh.excelDrawingInvalid'));
      }
      for (const picture of pictures) {
        const blip = elements(picture, 'blip')[0];
        const relation = blip && drawingRels.get(relationshipId(blip, 'embed'));
        const entry = relation?.path && zip.file(relation.path);
        images.push({ row: row + 1, column: column + 1, async blob() {
          if (!entry) throw new Error(t('gh.excelImageInvalid', { row: row + 1 }));
          const bytes = await entry.async('uint8array');
          const type = imageMime(bytes);
          if (!type) throw new Error(t('gh.excelImageUnsupported', { row: row + 1 }));
          return new Blob([bytes], { type });
        } });
      }
    }
  }
  // Do not silently lose modern in-cell pictures, which are not ordinary drawing anchors.
  const inCellImages = elements(sheetDocument, 'c').filter(cell => cell.hasAttribute('vm')).map(cell => cell.getAttribute('r'));
  for (const path of Object.keys(zip.files)) {
    if (/^xl\/(?:drawings|media|charts)\//.test(path)) zip.remove(path);
  }
  for (const path of Object.keys(zip.files)) {
    if (!/^xl\/.*\.xml$/.test(path) || zip.files[path].dir) continue;
    const document = xml(await zip.file(path).async('string'));
    if (document.documentElement.namespaceURI === SPREADSHEET_NS) zip.file(path, normalizeSpreadsheetXml(document));
  }
  for (const path of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/_rels\/.*\.rels$/.test(path)) continue;
    const document = xml(await zip.file(path).async('string'));
    for (const relation of elements(document, 'Relationship')) {
      if (/\/(?:comments|threadedComment|vmlDrawing|drawing)$/.test(relation.getAttribute('Type'))) relation.remove();
    }
    zip.file(path, new XMLSerializer().serializeToString(document));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }), {
    ignoreNodes: ['drawing', 'picture', 'legacyDrawing'],
  });
  return { workbook, images, inCellImages };
}

export async function normalizeQuestionImage(blob, t) {
  if (!blob || blob.size > MAX_SOURCE_BYTES) throw new Error(t('gh.imageTooLarge'));
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(t('gh.imageInvalid')));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(t('gh.imageInvalid'));
    let scale = Math.min(1, 1280 / image.naturalWidth, 960 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    for (let resize = 0; resize < 6; resize++, scale *= .78) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error(t('gh.imageInvalid'));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .76, .66, .56]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.startsWith('data:image/jpeg;base64,') && Math.ceil((data.length - data.indexOf(',') - 1) * 3 / 4) <= MAX_IMAGE_BYTES) return data;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error(t('gh.imageTooLarge'));
  } finally {
    image.onload = null; image.onerror = null; image.src = '';
    URL.revokeObjectURL(objectUrl);
  }
}
