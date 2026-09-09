"""Local-only PDF layout/OCR worker. stdout contains one bounded JSON response."""
import argparse, json, os, sys, time, hashlib, contextlib, shutil
from pathlib import Path

PROFILE = 'docling-pdf/1'

def configure(root):
    os.environ['HF_HOME'] = str(root / 'cache')
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['DO_NOT_TRACK'] = '1'
    os.environ['OMP_NUM_THREADS'] = '4'
    import onnxruntime
    onnxruntime.disable_telemetry_events()

def converter(root):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode, RapidOcrOptions, TesseractCliOcrOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    options = PdfPipelineOptions(artifacts_path=str(root / 'models'), enable_remote_services=False,
                                 do_ocr=True, do_table_structure=True)
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    tesseract=shutil.which('tesseract') or ('/opt/homebrew/bin/tesseract' if Path('/opt/homebrew/bin/tesseract').exists() else None)
    if tesseract:
        options.ocr_options = TesseractCliOcrOptions(lang=['eng'],tesseract_cmd=tesseract)
    else:
        options.ocr_options = RapidOcrOptions(backend='onnxruntime',lang=['english'])
    options.document_timeout = 240
    return DocumentConverter(allowed_formats=[InputFormat.PDF], format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})

def prepare(root):
    from docling.utils.model_downloader import download_models
    download_models(output_dir=root / 'models', with_layout=True, with_tableformer=True,
                    with_code_formula=False, with_picture_classifier=False, with_smolvlm=False,
                    with_granite_vision=False, with_easyocr=False, rapidocr_models=['onnxruntime:en'])
    # Initialize every enabled pipeline stage while downloads are permitted.
    from docling.datamodel.base_models import InputFormat
    converter(root).initialize_pipeline(InputFormat.PDF)
    import importlib.metadata
    result = {'profile': PROFILE, 'version': importlib.metadata.version('docling'), 'ready': True}
    (root / 'ready.json').write_text(json.dumps(result))
    return result

def box(raw, height):
    if not raw: return None
    raw = raw.model_dump(mode='json') if hasattr(raw, 'model_dump') else raw
    l,t,r,b = [float(raw[k]) for k in ('l','t','r','b')]
    if raw.get('coord_origin') == 'BOTTOMLEFT': t,b = height-t,height-b
    return {'x': min(l,r), 'y': min(t,b), 'width': abs(r-l), 'height': abs(b-t)}

def convert(root, path):
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    # Reject remote/network use even if a dependency attempts an implicit download.
    import socket
    def denied(*args, **kwargs): raise RuntimeError('Network access is disabled during document processing. Run setup to download missing models.')
    socket.socket.connect = denied
    socket.create_connection = denied
    if not (root / 'ready.json').exists(): raise ValueError('Document reader setup is incomplete. Run setup first.')
    if path.suffix.lower() != '.pdf' or not 0 < path.stat().st_size <= 12*1024*1024: raise ValueError('Use a PDF smaller than 12 MB.')
    started=time.monotonic()
    result=converter(root).convert(path, max_num_pages=30, max_file_size=12*1024*1024, raises_on_error=True)
    if str(result.status.value) != 'success': raise ValueError('Document conversion was incomplete. No reviewed output is available.')
    doc=result.document; segments=[]; tables=[]; warnings=[]
    def append(text, prov, label, ref):
        if not text.strip(): return
        if len(prov)!=1:
            warnings.append('Content without one unambiguous page location was omitted. Coverage is incomplete.'); return
        for p in prov:
            number=p.page_no; page=doc.pages[number]; bounds=box(p.bbox,page.size.height)
            segments.append({'id':f'docling-{len(segments)+1}', 'label':f'PDF page {number} · {label}',
                             'text':text, 'page':number, 'pageWidth':page.size.width, 'pageHeight':page.size.height,
                             'runs':[{'start':0,'end':len(text.encode('utf-16-le'))//2,'box':bounds}] if bounds else [],'sourceRef':ref})
    for item,_ in doc.iterate_items():
        if hasattr(item,'data') and hasattr(item.data,'table_cells'):
            table=item.model_dump(mode='json'); tables.append(table)
            unit_columns={c.start_col_offset_idx for c in item.data.table_cells if c.column_header and c.text.strip().lower() in ('unit','units')}
            known_units={'mg/dL','mmol/L','g/dL','mEq/L','U/L','IU/L','ng/mL','pg/mL','ng/L','%','10^9/L','10^12/L'}
            for cell in item.data.table_cells:
                if not cell.column_header and cell.start_col_offset_idx in unit_columns and cell.text.strip() and cell.text.strip() not in known_units:
                    warnings.append(f'Table unit {cell.text!r} is outside the supported laboratory unit list. Coverage is incomplete; obtain a reviewed source. No unit was corrected automatically.')
            # Keep each row and its header context together; raw cells remain in evidence.
            headers=[c.text for c in item.data.table_cells if c.column_header]
            for row in range(item.data.num_rows):
                cells=sorted([c for c in item.data.table_cells if c.start_row_offset_idx<=row<c.end_row_offset_idx],key=lambda c:c.start_col_offset_idx)
                values=['']*item.data.num_cols
                for cell in cells:
                    values[cell.start_col_offset_idx]=cell.text
                text=('Table headers: '+' | '.join(headers)+'\n' if headers else '')+' | '.join(values)
                append(text,item.prov,f'table row {row+1}',item.self_ref)
        elif hasattr(item,'text'):
            append(item.text,item.prov,str(item.label.value),item.self_ref)
    if not segments: raise ValueError('No readable content was found. Review the original scan.')
    if len(segments)>12000 or sum(len(s['text']) for s in segments)>100000: raise ValueError('Document exceeds the review limit. Split it into smaller files.')
    covered={s['page'] for s in segments}
    for page in doc.pages:
        if page not in covered: warnings.append(f'Page {page} has no extracted content. Coverage is incomplete; inspect the original.')
    import importlib.metadata
    return {'profile':PROFILE,'version':importlib.metadata.version('docling'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'elapsedSeconds':round(time.monotonic()-started,3),'segments':segments,'tables':tables,'warnings':list(dict.fromkeys(warnings)),
            'pageCount':len(doc.pages),'settings':{'ocr':'Tesseract English' if (shutil.which('tesseract') or Path('/opt/homebrew/bin/tesseract').exists()) else 'RapidOCR ONNX English','tableMode':'accurate','remoteServices':False,'network':'disabled during processing'},
            'coordinatePrecision':'document block / table region; not character-level OCR proof'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['prepare','convert']);parser.add_argument('--root',required=True);parser.add_argument('--input')
    args=parser.parse_args();root=Path(args.root).resolve();root.mkdir(parents=True,exist_ok=True);configure(root)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            value=prepare(root) if args.mode=='prepare' else convert(root,Path(args.input))
        output=json.dumps(value,ensure_ascii=False)
        if len(output.encode())>8*1024*1024: raise ValueError('Document evidence is too large.')
        print(output)
    except Exception as exc:
        print(json.dumps({'error':str(exc)}));sys.exit(1)
