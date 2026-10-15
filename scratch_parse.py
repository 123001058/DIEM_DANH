import zipfile
import xml.etree.ElementTree as ET
import os

z = zipfile.ZipFile('LH-NaviX.docx')
doc_xml = z.read('word/document.xml')
doc_root = ET.fromstring(doc_xml)
ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

rels_xml = z.read('word/_rels/document.xml.rels')
rels_root = ET.fromstring(rels_xml)
rel_map = {r.attrib.get('Id'): r.attrib.get('Target') for r in rels_root}

with open('scratch_out.txt', 'w', encoding='utf-8') as out:
    for i, tr in enumerate(doc_root.findall('.//w:tr', ns)):
        cells = [' '.join(''.join(c.itertext()).split()) for c in tr.findall('.//w:tc', ns)]
        
        # Check all blips / images in each cell
        cell_images = []
        for c in tr.findall('.//w:tc', ns):
            blips = c.findall('.//a:blip', ns)
            imgs = [rel_map.get(b.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')) for b in blips]
            cell_images.append(imgs)
            
        out.write(f"ROW {i} (cells={len(cells)}):\n")
        for c_idx, (text, imgs) in enumerate(zip(cells, cell_images)):
            out.write(f"   Cell {c_idx}: \"{text}\" | Imgs: {imgs}\n")
        out.write("\n")

print("Parsed successfully to scratch_out.txt")
