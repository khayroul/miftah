import json
import re

with open("data/bm_wbw_complete.json") as f:
    data = json.load(f)

vocab = set()
for k, v in data.items():
    vocab.add(v)

import collections
counts = collections.Counter()
for v in vocab:
    for word in re.findall(r'\b\w+\b', v.lower()):
        counts[word] += 1

targets = ["bahwa", "bahwasanya", "kerusakan", "rezki", "rizki", "istri", "karena", "surga", "syetan", "setan", "cobaan", "ruh", "sholat", "dzalim", "zhalim", "dhalim", "ridha", "ridho", "pahala", "neraka", "taubat"]
for t in targets:
    if t in counts:
        print(f"{t}: {counts[t]}")
