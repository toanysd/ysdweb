import pandas as pd
import uuid
import datetime

# Read data
df = pd.read_csv("Data/plastic_master.csv", dtype=str)

# Extract only relevant rows
df = df[df['status_review'].isin(['approved', 'needs_review'])]

# Cleanup dimensions
df['thickness_mm'] = pd.to_numeric(df['thickness_mm'], errors='coerce')
df['width_mm'] = pd.to_numeric(df['width_mm'], errors='coerce')
df = df.dropna(subset=['thickness_mm', 'width_mm'])

# Generate Semantic Code function
def generate_semantic(row):
    fam = str(row['plastic_family']).strip().upper()
    col = str(row['color_code_raw']).strip().upper()
    if col == 'NAN' or not col:
        col = 'UN'
        
    t = row['thickness_mm']
    if pd.isna(t):
        th_str = "00"
    else:
        # Convert float to int string e.g., 0.6 -> '06', 1.0 -> '10', 0.38 -> '038'
        th_str = str(t).replace('.', '')
        if len(th_str) == 1:
            th_str = '0' + th_str

    w = row['width_mm']
    w_str = str(int(w)) if not pd.isna(w) else "000"
    
    code = f"{fam}-{col}-{th_str}-{w_str}"
    return code

df['semantic_base'] = df.apply(generate_semantic, axis=1)

# Deduplicate keeping the first occurrence (Priority to PLA-)
df['is_pla'] = df['plastic_code'].str.startswith('PLA-').fillna(False)
df = df.sort_values(by=['semantic_base', 'is_pla'], ascending=[True, False])
df = df.drop_duplicates(subset=['semantic_base'], keep='first')

# Assign final codes and UUIDs
def finalize_code(idx, row):
    base = row['semantic_base']
    return f"{base}-01"

df['plastic_code'] = [finalize_code(i, r) for i, r in df.iterrows()]
df['plastic_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
df['is_active'] = 1
df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# Select relevant columns as per Perplexity's output
cols = [
    "plastic_id","plastic_code","plastic_family","plastic_subtype",
    "thickness_mm","width_mm","standard_length_m",
    "color_code_raw","color_name_normalized","electrical_property",
    "silicone_status_normalized","additive_flags","additive_text_raw","appearance_text_raw",
    "an_code_raw","an_meaning_normalized","si_code_raw","ab_code_raw",
    "status_review","remarks_raw","is_active","created_by","created_at","updated_at"
]
for c in cols:
    if c not in df.columns:
        df[c] = ""
        
df = df[cols]

# Output the file locally
out_path = "Data/plastic_master_clean.csv"
df.to_csv(out_path, index=False, encoding='utf-8-sig')

# Print summary
st = df.groupby('plastic_family').size().to_dict()
rev = df.groupby('status_review').size().to_dict()
print("ROWS: ", len(df))
print("FAMILY: ", st)
print("STATUS: ", rev)
