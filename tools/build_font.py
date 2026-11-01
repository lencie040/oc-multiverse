#!/usr/bin/env python3
"""アプリに出てくる珍しい漢字だけを Jigmo から抜き出して fonts/ に置く。

スマホには JIS 第1・第2水準より外の漢字が入っていないことが多いので、その字だけをサイトに同梱する。
build_data.py の最後に自動で実行される。Jigmo は CC0 (https://kamichikoichi.github.io/jigmo/)。

使い方:
  python3 tools/build_font.py [Jigmo のあるフォルダ]
"""
import glob, hashlib, json, os, sys, unicodedata
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "fonts")
SOURCES = ["Jigmo.ttf", "Jigmo2.ttf", "Jigmo3.ttf"]
FAMILY = "OC Jigmo"


def is_han(c):
    o = ord(c)
    return unicodedata.category(c) == "Lo" and (0x3400 <= o <= 0x9fff or 0xf900 <= o <= 0xfaff or o >= 0x20000)


def is_common(c):
    """JIS 第1・第2水準の漢字 (どのスマホにもまず入っている)"""
    try:
        b = c.encode("cp932")
    except UnicodeEncodeError:
        return False
    return len(b) == 2 and b[0] < 0xEB


def rare_chars():
    text = open(os.path.join(ROOT, "data", "data.json"), encoding="utf-8").read()
    for f in glob.glob(os.path.join(ROOT, "js", "*.js")) + [os.path.join(ROOT, "index.html")]:
        text += open(f, encoding="utf-8").read()
    return sorted({c for c in text if is_han(c) and not is_common(c)})


def write_subset(path, chars, n):
    opt = subset.Options()
    opt.flavor = "woff"
    opt.layout_features = []
    opt.hinting = False
    font = TTFont(path, lazy=True)
    sub = subset.Subsetter(opt)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    font.flavor = "woff"
    tmp = os.path.join(OUT, "tmp.woff")
    font.save(tmp)
    # 中身が変わったらファイル名も変わるので、古いフォントがキャッシュに残らない
    digest = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:8]
    name = f"jigmo-{n}-{digest}.woff"
    os.replace(tmp, os.path.join(OUT, name))
    return name


def main(folder=None):
    folder = folder or os.path.expanduser("~/Library/Fonts")
    paths = [os.path.join(folder, s) for s in SOURCES]
    if not all(os.path.exists(p) for p in paths):
        print("Jigmo が見つからないのでフォントは更新しません:", folder)
        return
    chars = rare_chars()
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "jigmo-*.woff")):
        os.remove(f)
    faces, rest = [], chars
    for n, path in enumerate(paths, 1):
        cmap = TTFont(path, lazy=True).getBestCmap()
        here = [c for c in rest if ord(c) in cmap]
        rest = [c for c in rest if ord(c) not in cmap]
        if not here:
            continue
        name = write_subset(path, here, n)
        rng = ",".join(f"U+{ord(c):X}" for c in here)
        faces.append(f'@font-face {{ font-family: "{FAMILY}"; src: url({name}) format("woff"); font-display: swap; unicode-range: {rng}; }}\n')
    with open(os.path.join(OUT, "jigmo.css"), "w", encoding="utf-8") as f:
        f.write("/* tools/build_font.py が作るファイル。手で書き換えない */\n" + "".join(faces))
    with open(os.path.join(OUT, "chars.json"), "w", encoding="utf-8") as f:
        json.dump("".join(chars), f, ensure_ascii=False)
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "*.woff")))
    print(f"fonts: {len(chars)}字 {size // 1024}KB", "".join(chars))
    if rest:
        print("Jigmo にない字:", "".join(rest))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
