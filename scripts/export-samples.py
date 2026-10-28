"""Refresh portfolio prose exclusively from Reference/Samples, without dependencies."""
from pathlib import Path
from zipfile import ZipFile
import json
import unicodedata
import xml.etree.ElementTree as ET

project = Path(__file__).resolve().parents[1]
source_root = project / "Reference" / "Samples"
destination = project / "assets" / "samples.json"
allowed = {
    "the-dragons-pact": "Dragon_s Pact - High Fantasy Sample.docx",
    "a-thiefs-gambit": "Low Fantasy Sample - A Thief_s Gambit.docx",
    "the-lost-kingdom": "Portal Fantasy Sample - The Lost Kingdom.docx",
    "murder-mystery": "Murder Mystery Sample.docx",
    "romance": "Romance Sample.docx",
    "science-fiction": "Sci-fi Sample.docx",
    "drama": "Drama Sample.docx",
}
heading_replaced = {"the-dragons-pact", "a-thiefs-gambit", "the-lost-kingdom"}
namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
lookalikes = str.maketrans(dict(zip("аАеЕоОрРсСхХуУіІјЈѕЅԁԛһ", "aAeEoOpPcCxXyYiIjJsSdqh")))

samples = json.loads(destination.read_text())
if len(samples) != len(allowed) or {sample["slug"] for sample in samples} != set(allowed):
    raise ValueError("The collection must contain exactly the seven allowlisted samples.")

for sample in samples:
    slug = sample["slug"]
    filename = allowed[slug]
    with ZipFile(source_root / filename) as document:
        root = ET.fromstring(document.read("word/document.xml"))
    paragraphs = [
        "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)).strip()
        for paragraph in root.findall(".//w:p", namespace)
    ]
    paragraphs = [paragraph for paragraph in paragraphs if paragraph]
    if slug == "romance":
        paragraphs = [unicodedata.normalize("NFKC", p.translate(lookalikes)) for p in paragraphs]
    if slug in heading_replaced:
        paragraphs = paragraphs[1:]
    sample.update(
        paragraphs=paragraphs,
        words=sum(len(paragraph.split()) for paragraph in paragraphs),
        source=f"Reference/Samples/{filename}",
    )
    sample["minutes"] = max(1, round(sample["words"] / 220))

destination.write_text(json.dumps(samples, ensure_ascii=False, indent=2))
print(f"Refreshed {len(samples)} readers from Reference/Samples only.")
