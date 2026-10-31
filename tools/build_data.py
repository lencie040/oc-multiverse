#!/usr/bin/env python3
"""スプレッドシートから data/data.json と img/ を生成する。

使い方:
  python3 tools/build_data.py [イラストフォルダ]
"""
import csv, io, json, os, re, shutil, sys, urllib.request

SHEET = "1v2nMhZftw4EIEVcpOMluSK8nlz62roy7OMkh23AyvE4"
CHAR_GID, MAP_GID, TYPE_GID = "0", "1517354738", "1535860723"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ILLUST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "illust")


def fetch(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}"
    with urllib.request.urlopen(url) as r:
        return list(csv.reader(io.StringIO(r.read().decode("utf-8"))))


def type_chart():
    """タイプ相性表 (行=攻撃側, 列=防御側)。等倍以外だけを残す"""
    rows = fetch(TYPE_GID)
    defs = [x.strip() for x in rows[0][1:]]
    chart = {}
    for r in rows[1:]:
        if not r or not r[0].strip():
            continue
        m = {}
        for d, v in zip(defs, r[1:]):
            v = v.strip()
            if d and v and float(v) != 1:
                m[d] = float(v)
        chart[r[0].strip()] = m
    return {"types": defs, "chart": chart}


# キャラがいない等でシートから世界団を決められない世界線の指定
WORLD_DAN = {"B32": "𡻦", "A5if": "𡻦"}  # 勉界, 零界IF
# シートの世界線一覧にまだない世界線 (世界線名, 読み方, 汎異記号)。シートに載ればそちらが優先される
EXTRA_WORLDS = [["零界IF", "れいかいIF", "A5if"]]


def num(s):
    try:
        return int(float(s))
    except ValueError:
        return 0


def dan_of(raw):
    m = re.match(r"(.+?)\((.+)\)", raw or "")
    return (m.group(1), m.group(2)) if m else (raw, "")


def main():
    chars_raw, map_raw = fetch(CHAR_GID)[1:], fetch(MAP_GID)[1:]
    worlds = {}
    for name, yomi, hani in map_raw + EXTRA_WORLDS:
        if not hani or hani in worlds:
            continue
        m = re.match(r"(.+?)\((.+)\)", name)  # 菓界×夢界(汽界)
        disp, sub = (m.group(2), m.group(1)) if m else (name, "")
        n = re.search(r"\d+", hani)
        worlds[hani] = {"id": hani, "name": disp, "sub": sub, "yomi": yomi,
                        "num": int(n.group()) if n else 0, "dan": None}

    os.makedirs(os.path.join(ROOT, "img"), exist_ok=True)
    chars, dan_votes, dans = [], {}, {}
    for r in chars_raw:
        no = r[2]
        if "[" in no or no.startswith("EV") or not r[16].strip():
            continue  # MG / CC / 覚醒 / EV / 種族値未入力 は未実装
        hani = r[5]
        if hani not in worlds:
            print("skip (unknown 汎異記号):", r[0], hani)
            continue
        dan, dan_yomi = dan_of(r[10])
        dans[dan] = dan_yomi
        dan_votes.setdefault(hani, {}).setdefault(dan, 0)
        dan_votes[hani][dan] += 1
        rank = re.match(r"\d+", r[27])
        img = None
        src = os.path.join(ILLUST, f"{no}.png")
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(ROOT, "img", f"{no}.png"))
            img = f"img/{no}.png"
        chars.append({
            "id": no, "name": r[0], "yomi": r[4], "hani": hani,
            "rank": int(rank.group()) if rank else 1, "kanji": r[15][:1] or r[0][:1],
            "colors": [c for c in r[12:15] if c], "stats": [num(v) for v in r[16:22]],
            "type": r[28], "zoku": r[33] if r[33] != "-" else "", "seiryoku": r[34] if r[34] != "-" else "",
            "birthday": r[11], "img": img,
        })

    suffix_dan = {"ex": "壞", "if": "𡻦", "sp": "𢜤"}
    for hani, w in worlds.items():
        if hani in WORLD_DAN:
            w["dan"] = WORLD_DAN[hani]
        elif hani in dan_votes:
            w["dan"] = max(dan_votes[hani].items(), key=lambda kv: kv[1])[0]
        else:
            sfx = re.search(r"(ex|if|sp)$", hani)
            w["dan"] = suffix_dan[sfx.group(1)] if sfx else "䥚"
    used = {w["dan"] for w in worlds.values()}
    out = {
        "dans": [{"id": d, "yomi": dans.get(d, "")} for d in dans if d in used],
        "worlds": list(worlds.values()),
        "chars": chars,
        "types": type_chart(),
    }
    with open(os.path.join(ROOT, "data", "data.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"worlds={len(worlds)} chars={len(chars)} images={sum(1 for c in chars if c['img'])} dans={out['dans']}")


if __name__ == "__main__":
    main()
