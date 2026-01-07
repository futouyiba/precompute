from pdfminer.high_level import extract_text
import re

pdf_path = "D:/fishinggame/precompute/中鱼-预计算+实时计算+校验方案 (1).pdf"
output_path = "D:/fishinggame/precompute/temp_pdf_text.txt"

text = extract_text(pdf_path)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(text)

print(f"Extraction complete. Saved to {output_path}")
