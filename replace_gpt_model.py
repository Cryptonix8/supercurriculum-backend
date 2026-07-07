from pathlib import Path

root = Path(__file__).resolve().parent / "src"
changed = []
for path in root.rglob("*.ts"):
    text = path.read_text(encoding="utf-8")
    if "gpt-4.1" in text:
        path.write_text(text.replace("gpt-4.1", "gpt-5.5"), encoding="utf-8")
        changed.append(str(path))
print(f"changed {len(changed)} files")
for p in changed:
    print(p)
