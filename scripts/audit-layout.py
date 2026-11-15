#!/usr/bin/env python3
"""QA de PDF sobre documentos generados realmente: A4, páginas, contenido,
solapamientos evidentes y colocación de cabeceras respecto al PDF docente.
No afirma una equivalencia visual perfecta con Word/Pages/Safari iOS.
"""
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import json

ROOT=Path('audit-output')
ROOT.mkdir(exist_ok=True)
REPORT={}
for case in ['breve','largo','varios']:
    for engine,folder,suffix in [('word',ROOT/'word-pdf','.pdf'),
                                  ('browser',ROOT,'-webkit-css-chromium.pdf')]:
        path=folder/(case+suffix)
        if not path.exists():raise RuntimeError('No se generó '+str(path))
        info=subprocess.run(['pdfinfo',str(path)],capture_output=True,text=True,check=True).stdout
        count=int(re.search(r'^Pages:\s+(\d+)',info,re.M).group(1))
        size=re.search(r'^Page size:\s+([\d.]+) x ([\d.]+)',info,re.M)
        width,height=float(size.group(1)),float(size.group(2))
        if abs(width-595.28)>2 or abs(height-841.89)>2:
            raise RuntimeError(f'{case} {engine}: papel {width}x{height} no es A4')
        if case=='breve' and count!=1:
            raise RuntimeError(f'{case} {engine}: {count} páginas; debe caber una ficha')
        if case=='largo' and count<2:
            raise RuntimeError(f'{case} {engine}: falta salto de página')
        if case=='varios' and count<3:
            raise RuntimeError(f'{case} {engine}: falta página para alguna aparición')
        txt=subprocess.run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,check=True).stdout
        pages=[p for p in txt.split('\f') if p.strip()]
        if len(pages)!=count:
            raise RuntimeError(f'{case} {engine}: discrepancia extracción {len(pages)} vs {count}')
        if any(len(re.sub(r'\s+','',p))<45 for p in pages):
            raise RuntimeError(f'{case} {engine}: página en blanco o casi vacía')
        for key in ['Julio César','De bello Gallico','Vocabulario','Traducción del texto.',
                     'Elige dos de estas cuatro preguntas']:
            if key not in txt:
                raise RuntimeError(f'{case} {engine}: falta {key}')
        if case=='breve':
            for key in ['Helvetii','secuti','contulerunt','phălanx','transgressionem','peccata minuta']:
                if key not in txt:
                    raise RuntimeError(f'{case} {engine}: falta contenido {key}')
        # Cuando la batería corta de preguntas cabe, evitar una pregunta 1
        # aislada al pie de una hoja distinta de la pregunta 4.
        question_pages=[i for i,content in enumerate(pages,1) if 'Traducción del texto.' in content]
        choice_pages=[i for i,content in enumerate(pages,1) if 'Elige dos de estas cuatro preguntas' in content]
        if question_pages!=choice_pages:
            raise RuntimeError(f'{case} {engine}: preguntas huérfanas: {question_pages} frente a {choice_pages}')
        # No aceptar numeración de aparición como si fuese número físico.
        if engine=='browser':
            for i,content in enumerate(pages,1):
                footer=f'{i}|{count}'
                if footer not in content.replace(' ',''):
                    raise RuntimeError(f'{case}: falta numeración física {footer} en página {i}')
        bbox=subprocess.run(['pdftotext','-f','1','-l','1','-bbox',str(path),'-'],
                            capture_output=True,text=True,check=True).stdout
        doc=ET.fromstring(bbox)
        words=doc.findall('.//{http://www.w3.org/1999/xhtml}word')
        def locate(needle):
            for w in words:
                if needle in ''.join(w.itertext()):
                    return (round(float(w.attrib['xMin']),1),round(float(w.attrib['yMin']),1))
            return None
        metrics={'pages':count,'page_size':[width,height],
          'header_first_word':locate('Los') if case!='largo' else locate('Texto'),
          'source':locate('Julio'),'latin':locate('Helvetii'),
          'vocabulary':locate('Vocabulario'),
          'first_question':locate('Traducción'), 'choice':locate('Elige'),
          'last_page_tail':pages[-1][-180:].strip().replace('\n',' '),
          'first_page_chars':len(pages[0])}
        if case=='breve':
            # Coordenadas y de la página original proporcionada por el docente.
            # Tolerancia explícita por sustituciones tipográficas Word/Chromium.
            reference={'latin':124.3,'vocabulary':220.3,
                       'first_question':299.3,'choice':356.3}
            for key,expected in reference.items():
                value=metrics[key]
                if value is None or abs(value[1]-expected)>20:
                    raise RuntimeError(
                        f'{case} {engine}: {key} en {value}, referencia {expected} pt')
        REPORT[case+'_'+engine]=metrics
        # Render real bitmap; compatible con inspección visual humana.
        subprocess.run(['pdftoppm','-f','1','-l','1','-scale-to','1300',
          '-png','-singlefile',str(path),str(ROOT/(case+'-'+engine+'-pagina1'))],
          check=True,stdout=subprocess.DEVNULL)
        if case!='breve':
            subprocess.run(['pdftoppm','-f',str(count),'-l',str(count),'-scale-to','1300',
              '-png','-singlefile',str(path),str(ROOT/(case+'-'+engine+'-ultima'))],
              check=True,stdout=subprocess.DEVNULL)
        print(case,engine,metrics)
(ROOT/'auditoria-resultados.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
