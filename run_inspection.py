import pandas as pd
df_head = pd.read_csv("dataset/ball_by_ball_data.csv", nrows=5)
print("COLUMNS:", list(df_head.columns))
print(df_head.to_string())

import pandas as pd
cols = pd.read_csv("dataset/ball_by_ball_data.csv", nrows=0).columns.tolist()
print("ALL COLUMNS:", cols)
# find likely columns for: match id, date, season, teams, venue, innings, over, ball, batter, bowler, runs, wicket, match type/format
for c in cols:
    print(c)
