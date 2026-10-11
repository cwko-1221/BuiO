'use strict';

// Patch the bundled, trusted T1 template instead of round-tripping its styles,
// fonts, printer settings and historical worksheets through a workbook writer.
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const setAttribute = (xml, name, value) => xml.replace(/^<[^>]+>/, tag => {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  const attr = ` ${name}="${escapeXml(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, attr) : tag.replace(/\/?>(?=$)/, end => `${attr}${end}`);
});
const cells = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const columnNumber = letters => [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);

async function writeTemplate({ templateBuffer, source, summary, totalRow }) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(templateBuffer);
  const read = name => zip.file(name).async('string');
  let workbookXml = await read('xl/workbook.xml');
  let relsXml = await read('xl/_rels/workbook.xml.rels');
  let typesXml = await read('[Content_Types].xml');
  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/>/g);
  const sourceTag = sheetTags.find(tag => attribute(tag, 'name') === source.name);
  const relationships = relsXml.match(/<Relationship\b[^>]*\/>/g);
  const sourceRel = relationships.find(tag => attribute(tag, 'Id') === attribute(sourceTag, 'r:id'));
  const sourcePath = `xl/${attribute(sourceRel, 'Target')}`;
  const sourceXml = await read(sourcePath);
  const originalRows = sourceXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g);
  const rowsByNumber = new Map(originalRows.map(row => [Number(attribute(row, 'r')), row]));

  let stylesXml = await read('xl/styles.xml');
  const xfSection = stylesXml.match(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/)[0];
  const formats = xfSection.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g);
  const originalFormatCount = formats.length;
  const styleIndex = new Map(formats.map((xf, index) => [xf, index]));
  const legendFills = ['N5', 'N6', 'N7', 'N8'].map(address => {
    const cellXml = rowsByNumber.get(Number(address.slice(1))).match(cells).find(xml => attribute(xml, 'r') === address);
    return { fill: JSON.stringify(source.getCell(address).fill), id: Number(attribute(formats[Number(attribute(cellXml, 's'))], 'fillId')) };
  });
  const styleFor = (base, fill) => {
    const fillId = fill?.pattern === 'none' ? 0 : legendFills.find(item => item.fill === JSON.stringify(fill))?.id;
    if (fillId == null || Number(attribute(formats[base], 'fillId')) === fillId) return base;
    const xf = setAttribute(setAttribute(formats[base], 'fillId', fillId), 'applyFill', 1);
    if (!styleIndex.has(xf)) { styleIndex.set(xf, formats.length); formats.push(xf); }
    return styleIndex.get(xf);
  };

  function writeCell(raw, rowNumber, referenceRow) {
    const oldAddress = attribute(raw, 'r');
    const letters = oldAddress.match(/^[A-Z]+/)[0];
    const column = columnNumber(letters);
    if (column > 13) return rowNumber <= source.rowCount ? raw : '';
    const cell = summary.getCell(rowNumber, column);
    const value = cell.value;
    let tag = raw.match(/^<c\b[^>]*>/)[0].replace(/\/>$/, '>');
    tag = setAttribute(tag, 'r', `${letters}${rowNumber}`);
    tag = setAttribute(tag, 's', styleFor(Number(attribute(raw, 's') || 0), cell.fill));
    if (typeof value === 'string' && value === source.getCell(referenceRow, column).value) {
      return tag + (raw.endsWith('/>') ? '' : raw.slice(raw.indexOf('>') + 1, raw.lastIndexOf('</c>'))) + '</c>';
    }
    tag = tag.replace(/\st="[^"]*"/, '');
    if (value == null) return tag.replace(/>$/, '/>');
    if (typeof value === 'number') return `${tag}<v>${value}</v></c>`;
    if (value.formula) return `${tag}<f>${escapeXml(value.formula)}</f><v>${value.result}</v></c>`;
    // Literal inline strings cannot become formulas. Keep the template's CRLF
    // convention for wrapped Chinese/English names, without changing font size.
    const text = escapeXml(value).replace(/\r?\n/g, '\r\n');
    return `${setAttribute(tag, 't', 'inlineStr')}<is><t xml:space="preserve">${text}</t></is></c>`;
  }

  const updatedRows = originalRows.map(row => {
    const n = Number(attribute(row, 'r'));
    if (n < 5) return row.replace(cells, cell => ['A2', 'A3'].includes(attribute(cell, 'r')) ? writeCell(cell, n, n) : cell);
    return row.replace(cells, cell => writeCell(cell, n, n));
  });
  for (let n = source.rowCount + 1; n <= totalRow; n++) {
    const referenceRow = n === totalRow ? source.rowCount : 5;
    const row = setAttribute(rowsByNumber.get(referenceRow), 'r', n);
    updatedRows.push(row.replace(cells, cell => writeCell(cell, n, referenceRow)));
  }
  const summaryXml = sourceXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${updatedRows.join('')}</sheetData>`)
    .replace(/<dimension\b[^>]*\/>/, tag => setAttribute(tag, 'ref', `A1:N${totalRow}`));
  if (formats.length !== originalFormatCount) {
    const section = setAttribute(xfSection.replace('</cellXfs>', `${formats.slice(originalFormatCount).join('')}</cellXfs>`), 'count', formats.length);
    stylesXml = stylesXml.replace(xfSection, section);
    zip.file('xl/styles.xml', stylesXml);
  }

  const existingTag = sheetTags.find(tag => attribute(tag, 'name') === summary.name);
  let outputPath;
  let activeTab;
  if (existingTag) {
    const rel = relationships.find(tag => attribute(tag, 'Id') === attribute(existingTag, 'r:id'));
    outputPath = `xl/${attribute(rel, 'Target')}`;
    activeTab = sheetTags.indexOf(existingTag);
  } else {
    const nextPart = 1 + Math.max(...Object.keys(zip.files).map(name => Number(name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1]) || 0));
    const nextId = 1 + Math.max(...sheetTags.map(tag => Number(attribute(tag, 'sheetId'))));
    const nextRel = `rId${1 + Math.max(...relationships.map(tag => Number(attribute(tag, 'Id').slice(3))))}`;
    outputPath = `xl/worksheets/sheet${nextPart}.xml`;
    activeTab = sheetTags.length;
    workbookXml = workbookXml.replace('</sheets>', `<sheet name="${escapeXml(summary.name)}" sheetId="${nextId}" r:id="${nextRel}"/></sheets>`);
    relsXml = relsXml.replace('</Relationships>', `<Relationship Id="${nextRel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${nextPart}.xml"/></Relationships>`);
    typesXml = typesXml.replace('</Types>', `<Override PartName="/${outputPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    const sourceRels = sourcePath.replace('/worksheets/', '/worksheets/_rels/') + '.rels';
    if (zip.file(sourceRels)) zip.file(outputPath.replace('/worksheets/', '/worksheets/_rels/') + '.rels', await zip.file(sourceRels).async('nodebuffer'));
    const appXml = await read('docProps/app.xml');
    zip.file('docProps/app.xml', appXml.replace(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/, section => section.replace(/<vt:i4>\d+<\/vt:i4>/, `<vt:i4>${sheetTags.length + 1}</vt:i4>`))
      .replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/, section => section.replace(/size="\d+"/, `size="${sheetTags.length + 1}"`).replace('</vt:vector>', `<vt:lpstr>${escapeXml(summary.name)}</vt:lpstr></vt:vector>`)));
  }
  zip.file(outputPath, summaryXml);
  // The old calculation chain does not describe updated/new total formulas.
  zip.remove('xl/calcChain.xml');
  relsXml = relsXml.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, '');
  typesXml = typesXml.replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g, '');
  workbookXml = workbookXml.replace(/<workbookView\b[^>]*\/>/, tag => setAttribute(tag, 'activeTab', activeTab))
    .replace(/<calcPr\b[^>]*\/>/, tag => setAttribute(setAttribute(tag, 'fullCalcOnLoad', 1), 'forceFullCalc', 1));
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', relsXml);
  zip.file('[Content_Types].xml', typesXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { writeTemplate };
