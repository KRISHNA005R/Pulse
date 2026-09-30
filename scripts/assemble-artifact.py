"""Turn the singlefile artifact build (dist-artifact/index.html) into dist-artifact/pulse.html:
title + splash CSS + app CSS + React UMD from cdnjs + body (splash + root) + module script."""
import os, re
d = os.path.join(os.path.dirname(__file__), '..', 'dist-artifact')
s = open(os.path.join(d, 'index.html')).read()
title = re.search(r'<title>.*?</title>', s, re.S).group(0)
head = s[:s.index('<body>')]
body = s[s.index('<body>') + 6:s.rindex('</body>')]
def grab(start):
    i = head.index(start)
    end = '</script>' if start.startswith('<script') else '</style>'
    return head[i:head.index(end, i) + len(end)]
module = grab('<script type="module" crossorigin>')
css = grab('<style rel="stylesheet" crossorigin>')
splash_css = grab('<style>')
umd = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>'
       '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>')
open(os.path.join(d, 'pulse.html'), 'w').write('\n'.join(['<meta charset="utf-8">', title, splash_css, css, umd, body.strip(), module, '']))
os.remove(os.path.join(d, 'index.html'))
print('pulse.html', os.path.getsize(os.path.join(d, 'pulse.html')))
