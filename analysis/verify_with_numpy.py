"""
Independent cross-check of the app's regression using NumPy.

Fits FAT ~ CAT-1 + CAT-2 + DA on data/historical_marks.csv and prints the same
numbers shown on the app's Model page (coefficients, standard errors, R², σ̂).

    python3 analysis/verify_with_numpy.py
"""
import csv
from pathlib import Path

import numpy as np

path = Path(__file__).resolve().parent.parent / "data" / "historical_marks.csv"
rows = list(csv.DictReader(path.open()))

cat1 = np.array([float(r["cat1"]) for r in rows])
cat2 = np.array([float(r["cat2"]) for r in rows])
da = np.array([float(r["da1"]) + float(r["da2"]) + float(r["da3"]) for r in rows])
fat = np.array([float(r["fat"]) for r in rows])

X = np.column_stack([np.ones_like(fat), cat1, cat2, da])
n, p = X.shape
xtx_inv = np.linalg.inv(X.T @ X)
beta = xtx_inv @ X.T @ fat
resid = fat - X @ beta
s2 = resid @ resid / (n - p)
se = np.sqrt(np.diag(s2 * xtx_inv))
r2 = 1 - (resid @ resid) / ((fat - fat.mean()) @ (fat - fat.mean()))

print(f"n = {n}, residual df = {n - p}")
for name, b, e in zip(["(Intercept)", "CAT-1", "CAT-2", "DA"], beta, se):
    print(f"{name:12s} estimate {b:9.4f}   SE {e:7.4f}   t {b / e:6.2f}")
print(f"R² = {r2:.4f}   adjusted R² = {1 - (1 - r2) * (n - 1) / (n - p):.4f}   σ̂ = {np.sqrt(s2):.4f}")

# Correlation matrix of the components
internal = 0.3 * cat1 + 0.3 * cat2 + da
total = internal + 0.4 * fat
names = ["CAT-1", "CAT-2", "DA", "Internal", "FAT", "Total"]
corr = np.corrcoef([cat1, cat2, da, internal, fat, total])
print("\nCorrelation matrix")
print(" " * 9 + "".join(f"{nm:>9s}" for nm in names))
for nm, row in zip(names, corr):
    print(f"{nm:>9s}" + "".join(f"{v:9.3f}" for v in row))
