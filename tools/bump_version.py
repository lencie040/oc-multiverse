#!/usr/bin/env python3
"""ブラウザのキャッシュ対策: index.html と js/*.js の相対参照に ?v=<番号> を付け直す。

使い方: python3 tools/bump_version.py <番号>
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = sys.argv[1]
files = [os.path.join(ROOT, "index.html")] + glob.glob(os.path.join(ROOT, "js", "*.js"))
for f in files:
    s = open(f, encoding="utf-8").read()
    s2 = re.sub(r"""(from '\./[\w-]+\.js)(\?v=\w+)?'""", rf"\1?v={v}'", s)
    s2 = re.sub(r'(href="style\.css|src="js/main\.js)(\?v=\w+)?"', rf'\1?v={v}"', s2)
    if s2 != s:
        open(f, "w", encoding="utf-8").write(s2)
        print("updated", os.path.relpath(f, ROOT))
