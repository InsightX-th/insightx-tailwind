"""Build the standalone Thai HTML manual using only the Python standard library."""
import base64
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'


def inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)


def build():
    lines = (DOCS / 'manual-th.md').read_text().splitlines()
    output = []
    i, section = 0, 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i])
                i += 1
            output.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
        elif line.startswith('# '):
            output.append('<header class="cover">')
        elif line.startswith('## '):
            if not section:
                output.append('</header>')
            else:
                output.append('</div></details>')
            section += 1
            title = line[3:]
            opened = ' open' if section == 1 else ''
            output.append(f'<details class="manual-section" id="s{section}"{opened}><summary><h2>{inline(title)}</h2><svg class="section-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="section-body">')
        elif line.startswith('!['):
            match = re.fullmatch(r'!\[(.*?)\]\((.*?)\)', line)
            alt, path = match.groups()
            data = base64.b64encode((DOCS / path).read_bytes()).decode()
            output.append(f'<figure><a href="{path}" title="เปิดภาพต้นฉบับ"><img src="data:image/png;base64,{data}" alt="{html.escape(alt)}" loading="eager"></a><figcaption>{inline(alt)}</figcaption></figure>')
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [x.strip() for x in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+', x) for x in cells):
                    tag = 'th' if not rows else 'td'
                    rows.append('<tr>' + ''.join(f'<{tag}>{inline(x)}</{tag}>' for x in cells) + '</tr>')
                i += 1
            output.append('<div class="table-wrap"><table>' + ''.join(rows) + '</table></div>')
            continue
        elif re.match(r'^\d+\. ', line):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i]):
                items.append('<li>' + inline(re.sub(r'^\d+\. ', '', lines[i])) + '</li>')
                i += 1
            output.append('<ol>' + ''.join(items) + '</ol>')
            continue
        else:
            kind = ' class="caption-note"' if line.startswith('**อ่านภาพ:') else ''
            if not section and len(output) == 1:
                kind = ' class="metadata"'
            output.append('<p' + kind + '>' + inline(line) + '</p>')
        i += 1
    output.append('</div></details>')
    body = '\n'.join(output)
    style = (DOCS / 'manual.css').read_text()
    behavior = '''
    let printState = [];
    window.addEventListener('beforeprint', () => {
      printState = [...document.querySelectorAll('details')].map(item => [item, item.open]);
      printState.forEach(([item]) => { item.open = true; });
    });
    window.addEventListener('afterprint', () => {
      printState.forEach(([item, open]) => { item.open = open; });
    });
    function openLinkedTopic() {
      const target = document.getElementById(location.hash.slice(1));
      if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView(); }
    }
    window.addEventListener('hashchange', openLinkedTopic);
    openLinkedTopic();
    '''
    result = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>คู่มือการใช้งาน</title><style>' + style + '</style></head><body><main>' + body + '</main><script>' + behavior + '</script></body></html>'
    (DOCS / 'manual-th.html').write_text(result)
    print(f'Built docs/manual-th.html ({section} sections, embedded screenshots)')


if __name__ == '__main__':
    build()
