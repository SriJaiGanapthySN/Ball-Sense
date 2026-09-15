import pandas as pd
import re
for fname in ["odt.csv","tt.csv","twt.csv"]:
    df = pd.read_csv(fname)
    print("=====", fname, "rows:", len(df))
    has_in = df['Series/Tournament'].str.contains(r'\bin\b', case=False, na=False)
    print("has 'in':", has_in.sum(), "no 'in':", (~has_in).sum())
    print("--- sample WITHOUT 'in' ---")
    print(df.loc[~has_in, ['Series/Tournament','Season','Winner','Margin']].head(15).to_string())
    print("--- unique winner values (first 40) ---")
    print(sorted(df['Winner'].dropna().unique().tolist())[:40])
    print("--- sample rows overall ---")
    print(df[['Series/Tournament','Season','Winner','Margin']].sample(min(8,len(df)), random_state=1).to_string())