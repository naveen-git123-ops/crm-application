import pandas as pd
from pathlib import Path

files = [
    r"c:\Users\PritamNayak\Downloads\bhuneer one time renewal 1.xlsx",
    r"c:\Users\PritamNayak\Downloads\NO cap NEW.xlsx",
    r"c:\Users\PritamNayak\Downloads\Noacap old data.xlsx",
]

for f in files:
    p = Path(f)
    print("=" * 80)
    print("FILE:", p.name)
    xl = pd.ExcelFile(f)
    print("SHEETS:", xl.sheet_names)
    for s in xl.sheet_names:
        df0 = pd.read_excel(f, sheet_name=s, header=None)
        print(f"  sheet={s!r} raw_shape={df0.shape}")
        for i in range(min(12, len(df0))):
            vals = [str(v) if pd.notna(v) else "" for v in df0.iloc[i].tolist()]
            print(f"    row{i} non-null={df0.iloc[i].notna().sum()} sample={vals[:15]}")
        df = pd.read_excel(f, sheet_name=s)
        print("  default headers:", [str(c) for c in df.columns])
        print("  default rows:", len(df))
        print()
