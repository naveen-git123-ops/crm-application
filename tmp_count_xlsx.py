import pandas as pd
from pathlib import Path

files = [
    r"c:\Users\PritamNayak\Downloads\bhuneer one time renewal 1.xlsx",
    r"c:\Users\PritamNayak\Downloads\NO cap NEW.xlsx",
    r"c:\Users\PritamNayak\Downloads\Noacap old data.xlsx",
]

for f in files:
    print("=" * 80)
    print(Path(f).name)
    xl = pd.ExcelFile(f)
    total = 0
    for s in xl.sheet_names:
        df = pd.read_excel(f, sheet_name=s)
        n = len(df)
        total += n
        print(f"  {s}: {n} rows, {len(df.columns)} cols")
    print("  TOTAL:", total)
    print("  COLS:", [str(c).replace("\n", " ").replace("  ", " ") for c in pd.read_excel(f, sheet_name=xl.sheet_names[0]).columns])
