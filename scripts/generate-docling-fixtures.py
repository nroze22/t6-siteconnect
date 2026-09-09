from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import Table,TableStyle
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
import json
out=Path('sample-data/docling');out.mkdir(exist_ok=True,parents=True)
def heading(c,title):
 c.setFont('Helvetica-Bold',16);c.drawString(40,755,title)
 c.setFont('Helvetica',10);c.drawString(40,735,'SYNTHETIC TRAINING DOCUMENT - NOT PATIENT DATA')
rows=[['Test','Result','Unit','Reference interval','Status'],['Creatinine','1.36','mg/dL','Not supplied','Corrected'],['Potassium','<2.5','mmol/L','Not supplied','Final'],['Glucose','112','','Not supplied','Final'],['Hemoglobin','12.7','g/dL','Not supplied','Final']]
c=canvas.Canvas(str(out/'lab-table.pdf'),pagesize=(612,792));heading(c,'Synthetic laboratory report')
c.setFont('Helvetica',11);c.drawString(40,700,'Patient: SYN-A | Specimen: Serum | Collected: 2026-08-06')
t=Table(rows,colWidths=[100,65,70,140,85],rowHeights=32);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7ecf5')),('GRID',(0,0),(-1,-1),.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),10),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
t.wrapOn(c,530,300);t.drawOn(c,40,475)
c.setFont('Helvetica',10);c.drawString(40,445,'Glucose unit is absent in the source. Do not infer it.');c.drawString(40,425,'Correction: prior creatinine 1.63 mg/dL is superseded by 1.36 mg/dL.');c.save()
# Pixel-only PDF, no text layer; OCR must read its table.
import pypdfium2 as pdfium
pdf=pdfium.PdfDocument(str(out/'lab-table.pdf'));image=pdf[0].render(scale=2).to_pil().convert('RGB');image.save(out/'lab-table-scan.jpg',quality=78);pdf.close()
c=canvas.Canvas(str(out/'lab-table-scanned.pdf'),pagesize=(612,792));c.drawImage(ImageReader(image),0,0,width=612,height=792);c.save()
c=canvas.Canvas(str(out/'two-column-notes.pdf'),pagesize=(612,792));heading(c,'Two independent synthetic notes')
for x,patient,lines in [(40,'SYN-A',['Sodium was 138 mmol/L.','No diabetes is documented.','Metformin 500 mg was stopped.']), (325,'SYN-B',['Sodium was 142 mmol/L.','Possible pneumonia is under review.','Lisinopril 10 mg remains current.'])]:
 c.setFont('Helvetica-Bold',12);c.drawString(x,690,'Patient '+patient)
 c.setFont('Helvetica',10)
 for i,line in enumerate(lines):c.drawString(x,660-i*24,line)
c.save()
(out/'expected.json').write_text(json.dumps({'lab-table.pdf':{'tableRows':[r[:3] for r in rows[1:]],'phrases':['SYN-A','1.63','1.36','<2.5','112','12.7']},'lab-table-scanned.pdf':{'tableRows':[r[:3] for r in rows[1:]],'phrases':['SYN-A','1.63','1.36','<2.5','112','12.7']},'two-column-notes.pdf':{'phrases':['SYN-A','138','SYN-B','142','No diabetes','Possible pneumonia']}},indent=2))
print('Created table, scan and two-column synthetic documents.')
