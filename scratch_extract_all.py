import zipfile
import xml.etree.ElementTree as ET
import os
import json
import re

z = zipfile.ZipFile('LH-NaviX.docx')
doc_xml = z.read('word/document.xml')
doc_root = ET.fromstring(doc_xml)

rels_xml = z.read('word/_rels/document.xml.rels')
rels_root = ET.fromstring(rels_xml)
rel_map = {r.attrib.get('Id'): r.attrib.get('Target') for r in rels_root}

ns = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

os.makedirs('images/faces', exist_ok=True)

def parse_info(text):
    # Format: "Họ tên: Cao Thanh NghĩaLớp: 23OT112MSSV: 123000651Điện thoại: 0889258633"
    name = ""
    lop = ""
    mssv = ""
    phone = ""
    
    m_name = re.search(r'Họ\s*tên\s*:\s*([^Lớp|MSSV|Điện]+)', text, re.IGNORECASE)
    if m_name:
        name = m_name.group(1).strip()
    
    m_lop = re.search(r'Lớp\s*:\s*([^MSSV|Điện]+)', text, re.IGNORECASE)
    if m_lop:
        lop = m_lop.group(1).strip()
        
    m_mssv = re.search(r'MSSV\s*:\s*([0-9]+)', text, re.IGNORECASE)
    if m_mssv:
        mssv = m_mssv.group(1).strip()
        
    m_phone = re.search(r'Điện\s*thoại\s*:\s*([0-9\s]+)', text, re.IGNORECASE)
    if m_phone:
        phone = m_phone.group(1).replace(" ", "").strip()
        
    return name, lop, mssv, phone

students = []

for tr in doc_root.findall('.//w:tr', ns):
    cells = tr.findall('.//w:tc', ns)
    if len(cells) != 6:
        continue
        
    text_0 = ' '.join(''.join(cells[0].itertext()).split())
    if text_0 == "STT":
        continue
        
    # Student 1: cells[0]=STT, cells[1]=Image, cells[2]=Info
    stt1 = text_0
    info1 = ' '.join(''.join(cells[2].itertext()).split())
    blips1 = cells[1].findall('.//a:blip', ns)
    imgs1 = [rel_map.get(b.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')) for b in blips1]
    
    name1, lop1, mssv1, phone1 = parse_info(info1)
    if mssv1:
        img_target1 = imgs1[0] if imgs1 else ""
        students.append({
            'stt': int(stt1) if stt1.isdigit() else 0,
            'name': name1,
            'class': lop1,
            'mssv': mssv1,
            'phone': phone1,
            'doc_img': img_target1
        })
        
    # Student 2: cells[3]=STT, cells[4]=Image, cells[5]=Info
    stt2 = ' '.join(''.join(cells[3].itertext()).split())
    info2 = ' '.join(''.join(cells[5].itertext()).split())
    blips2 = cells[4].findall('.//a:blip', ns)
    imgs2 = [rel_map.get(b.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')) for b in blips2]
    
    name2, lop2, mssv2, phone2 = parse_info(info2)
    if mssv2:
        img_target2 = imgs2[0] if imgs2 else ""
        students.append({
            'stt': int(stt2) if stt2.isdigit() else 0,
            'name': name2,
            'class': lop2,
            'mssv': mssv2,
            'phone': phone2,
            'doc_img': img_target2
        })

students.sort(key=lambda s: s['stt'])
print(f"Total students parsed: {len(students)}")

mapping = []
for s in students:
    doc_img = s['doc_img']
    avatar_rel = ""
    if doc_img:
        # e.g. media/image1.png -> word/media/image1.png
        zip_path = f"word/{doc_img}"
        ext = os.path.splitext(doc_img)[1].lower()
        if not ext:
            ext = ".jpg"
        out_filename = f"{s['mssv']}{ext}"
        out_path = os.path.join('images', 'faces', out_filename)
        
        try:
            img_bytes = z.read(zip_path)
            with open(out_path, 'wb') as f:
                f.write(img_bytes)
            avatar_rel = f"images/faces/{out_filename}"
        except Exception as e:
            print(f"Error extracting {zip_path} for {s['name']}: {e}")
            
    mapping.append({
        'stt': s['stt'],
        'name': s['name'],
        'class': s['class'],
        'mssv': s['mssv'],
        'phone': s['phone'],
        'avatar': avatar_rel
    })

with open('images/faces/students_mapping.json', 'w', encoding='utf-8') as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)

print("\nUpdated images/faces/students_mapping.json successfully!")
