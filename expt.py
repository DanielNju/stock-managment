#!/usr/bin/env python3
from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional
import argparse
import json
import math
import re
from sklearn.mixture import GaussianMixture
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

import hdbscan
from google.cloud import vision


# ============================================================
# 1) DATA MODEL
# ============================================================

@dataclass
class Word:
    text: str
    x1: float
    y1: float
    x2: float
    y2: float
    conf: float = 1.0

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0

    @property
    def w(self) -> float:
        return self.x2 - self.x1

    @property
    def h(self) -> float:
        return self.y2 - self.y1


# ============================================================
# 2) VISION OCR: IMAGE -> WORDS (+confidence)
# ============================================================

def vision_words_from_image(image_path: str) -> List[Word]:
    client = vision.ImageAnnotatorClient()

    with open(image_path, "rb") as f:
        content = f.read()

    image = vision.Image(content=content)
    image_context = vision.ImageContext(language_hints=["en-t-i0-handwrit"])
    response = client.document_text_detection(image=image, image_context=image_context)

    if response.error.message:
        raise RuntimeError(f"Vision API error: {response.error.message}")

    ann = response.full_text_annotation
    if not ann or not ann.pages:
        return []

    out: List[Word] = []
    for page in ann.pages:
        for block in page.blocks:
            for para in block.paragraphs:
                for w in para.words:
                    text = "".join(sym.text for sym in w.symbols).strip()
                    if not text:
                        continue

                    confs = [float(sym.confidence) for sym in w.symbols if sym.confidence is not None]
                    conf = float(sum(confs) / len(confs)) if confs else 1.0

                    verts = w.bounding_box.vertices
                    xs = [v.x if v.x is not None else 0 for v in verts]
                    ys = [v.y if v.y is not None else 0 for v in verts]

                    out.append(
                        Word(
                            text=text,
                            x1=float(min(xs)),
                            y1=float(min(ys)),
                            x2=float(max(xs)),
                            y2=float(max(ys)),
                            conf=conf,
                        )
                    )
    return out


# ============================================================
# 3) DF HELPERS
# ============================================================

def words_to_dataframe(words: List[Word]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "text": [w.text for w in words],
            "x1": [w.x1 for w in words],
            "y1": [w.y1 for w in words],
            "x2": [w.x2 for w in words],
            "y2": [w.y2 for w in words],
            "cx": [w.cx for w in words],
            "cy": [w.cy for w in words],
            "w": [w.w for w in words],
            "h": [w.h for w in words],
            "conf": [w.conf for w in words],
        }
    )

def _fmt_box(x1, y1, x2, y2) -> str:
    return f"({int(x1)},{int(y1)},{int(x2)},{int(y2)})"


# ============================================================
# 4) ROTATION 90°
# ============================================================

def detect_needs_rotate_90(df: pd.DataFrame) -> bool:
    x_spread = float(df["cx"].max() - df["cx"].min())
    y_spread = float(df["cy"].max() - df["cy"].min())
    return y_spread > x_spread

def rotate_90_ccw_df(df: pd.DataFrame) -> pd.DataFrame:
    x1 = df["x1"].to_numpy()
    y1 = df["y1"].to_numpy()
    x2 = df["x2"].to_numpy()
    y2 = df["y2"].to_numpy()

    corners = np.stack(
        [
            np.stack([x1, y1], axis=1),
            np.stack([x1, y2], axis=1),
            np.stack([x2, y1], axis=1),
            np.stack([x2, y2], axis=1),
        ],
        axis=1,
    )

    rx = -corners[:, :, 1]
    ry = corners[:, :, 0]

    nx1 = rx.min(axis=1)
    nx2 = rx.max(axis=1)
    ny1 = ry.min(axis=1)
    ny2 = ry.max(axis=1)

    shift_x = -nx1.min()
    shift_y = -ny1.min()

    out = df.copy()
    out["x1"] = nx1 + shift_x
    out["x2"] = nx2 + shift_x
    out["y1"] = ny1 + shift_y
    out["y2"] = ny2 + shift_y
    out["cx"] = (out["x1"] + out["x2"]) / 2.0
    out["cy"] = (out["y1"] + out["y2"]) / 2.0
    out["w"] = out["x2"] - out["x1"]
    out["h"] = out["y2"] - out["y1"]
    return out


# ============================================================
# 5) DESKEW (pairwise median angle, capped)
# ============================================================

def _median_f(values: np.ndarray, default: float) -> float:
    if values.size == 0:
        return float(default)
    return float(np.median(values))

def estimate_skew_angle_pairs(
    df: pd.DataFrame,
    *,
    max_pairs: int = 6000,
    dy_factor: float = 0.6,
    min_dx: float = 5.0,
) -> float:
    n = len(df)
    if n < 6:
        return 0.0

    cx = df["cx"].to_numpy()
    cy = df["cy"].to_numpy()
    h_med = _median_f(df["h"].to_numpy(), default=10.0)
    dy_thresh = max(2.0, dy_factor * h_med)

    rng = np.random.default_rng(0)

    if n * (n - 1) // 2 <= max_pairs:
        idx_i, idx_j = np.triu_indices(n, k=1)
        pairs = np.stack([idx_i, idx_j], axis=1)
    else:
        pairs = rng.integers(0, n, size=(max_pairs, 2))
        pairs = pairs[pairs[:, 0] != pairs[:, 1]]

    angles = []
    for i, j in pairs:
        dx = cx[j] - cx[i]
        dy = cy[j] - cy[i]
        if abs(dx) < min_dx:
            continue
        if dx < 0:
            dx = -dx
            dy = -dy
        if abs(dy) <= dy_thresh:
            angles.append(math.atan2(dy, dx))

    if not angles:
        return 0.0

    return float(np.median(np.array(angles, dtype=float)))

def rotate_df_by_angle(df: pd.DataFrame, angle_rad: float) -> pd.DataFrame:
    if abs(angle_rad) < math.radians(0.2):
        return df.copy()

    cos_t = math.cos(-angle_rad)
    sin_t = math.sin(-angle_rad)

    x1 = df["x1"].to_numpy()
    y1 = df["y1"].to_numpy()
    x2 = df["x2"].to_numpy()
    y2 = df["y2"].to_numpy()

    corners = np.stack(
        [
            np.stack([x1, y1], axis=1),
            np.stack([x1, y2], axis=1),
            np.stack([x2, y1], axis=1),
            np.stack([x2, y2], axis=1),
        ],
        axis=1,
    )
    X = corners[:, :, 0]
    Y = corners[:, :, 1]

    RX = X * cos_t - Y * sin_t
    RY = X * sin_t + Y * cos_t

    nx1 = RX.min(axis=1)
    nx2 = RX.max(axis=1)
    ny1 = RY.min(axis=1)
    ny2 = RY.max(axis=1)

    shift_x = -nx1.min()
    shift_y = -ny1.min()

    out = df.copy()
    out["x1"] = nx1 + shift_x
    out["x2"] = nx2 + shift_x
    out["y1"] = ny1 + shift_y
    out["y2"] = ny2 + shift_y
    out["cx"] = (out["x1"] + out["x2"]) / 2.0
    out["cy"] = (out["y1"] + out["y2"]) / 2.0
    out["w"] = out["x2"] - out["x1"]
    out["h"] = out["y2"] - out["y1"]
    return out

def deskew_df(df: pd.DataFrame, *, max_deskew_deg: float = 8.0) -> Tuple[pd.DataFrame, float]:
    if len(df) < 6:
        return df, 0.0

    angle = estimate_skew_angle_pairs(df)

    max_rad = math.radians(max(0.0, float(max_deskew_deg)))
    angle = max(-max_rad, min(max_rad, angle))

    if abs(angle) < math.radians(0.3):
        return df, 0.0

    out = rotate_df_by_angle(df, angle_rad=angle)
    return out, -angle


# ============================================================
# 6) ROWS (HDBSCAN) + AUTO Y STRETCH
# ============================================================

def _auto_y_stretch_from_heights(df: pd.DataFrame) -> float:
    h_med = _median_f(df["h"].to_numpy(), default=12.0)
    if h_med <= 8:
        return 12.0
    if h_med <= 12:
        return 9.0
    if h_med <= 16:
        return 7.0
    return 5.0

def discover_rows_hdbscan(
    df: pd.DataFrame,
    *,
    y_stretch: float = 5.0,
    min_cluster_size: int = 3,
    min_samples: int = 2,
    cluster_selection_epsilon: float = 0.0,
    row_conf_min: float = 0.0,
) -> pd.DataFrame:
    base = df.copy()

    if row_conf_min > 0.0 and "conf" in base.columns:
        base = base[base["conf"] >= row_conf_min].copy()

    if base.empty:
        out = df.copy()
        out["row_cluster"] = -1
        return out

    ys = float(y_stretch)
    if ys <= 0.0:
        ys = _auto_y_stretch_from_heights(base)

    cy = base[["cy"]].to_numpy()
    Z = StandardScaler().fit_transform(cy)
    Z[:, 0] *= ys

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=int(min_cluster_size),
        min_samples=int(min_samples),
        metric="euclidean",
        cluster_selection_method="eom",
        cluster_selection_epsilon=float(cluster_selection_epsilon),
    )
    labels = clusterer.fit_predict(Z)

    out = df.copy()
    out["row_cluster"] = -1
    out.loc[base.index, "row_cluster"] = labels
    return out

def normalize_row_ids(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    clusters = [c for c in out["row_cluster"].unique().tolist() if c != -1]
    if not clusters:
        out["row_id"] = -1
        return out

    med_cy = {c: float(out.loc[out["row_cluster"] == c, "cy"].median()) for c in clusters}
    ordered = sorted(clusters, key=lambda c: med_cy[c])
    mapping = {c: i for i, c in enumerate(ordered)}
    out["row_id"] = out["row_cluster"].map(lambda c: mapping.get(c, -1))
 
    return out
 

# ============================================================
# 6.2) SPLIT "FAT ROWS" (when two lines merged into one)
# ============================================================

def split_fat_rows(df: pd.DataFrame, *, sep_factor: float = 0.55, min_side: int = 2) -> pd.DataFrame:
    """
    Split a row_id if it likely contains 2 physical text lines.

    Approach:
      - For each row_id, run KMeans(k=2) on cy
      - If the two cluster centers are separated enough (relative to row median height),
        and each side has at least `min_side` tokens -> split.
    """
    if df.empty or "row_id" not in df.columns:
        return df

    out = df.copy()
 
    max_row = out["row_id"].max()
    next_row_id = int(max_row) + 1 if pd.notna(max_row) and max_row >= 0 else 0

    row_ids = sorted(
        [r for r in out["row_id"].unique().tolist() if r >= 0],
        key=lambda r: float(out.loc[out["row_id"] == r, "cy"].median())
    )

    for rid in row_ids:
        idx = out.index[out["row_id"] == rid].tolist()
        if len(idx) < (min_side * 2):
            continue

        sub = out.loc[idx, ["cy", "h"]].copy()
        cy = sub[["cy"]].to_numpy()  

        h_med_row = float(np.median(sub["h"].to_numpy()))
        if h_med_row <= 0:
            continue

        km = KMeans(n_clusters=2, n_init=10, random_state=0)
        labels = km.fit_predict(cy)
        centers = km.cluster_centers_.reshape(-1)
        sep = float(abs(centers[1] - centers[0]))

        # ✅ separation test (this is the key)
        if sep < (sep_factor * h_med_row):
            continue

        # decide which label is "lower" (larger cy)
        low_label = int(np.argmax(centers))

        lower = [i for i, lab in zip(idx, labels) if int(lab) == low_label]
        upper = [i for i, lab in zip(idx, labels) if int(lab) != low_label]

        if len(lower) < min_side or len(upper) < min_side:
            continue

        out.loc[lower, "row_id"] = next_row_id
        next_row_id += 1

    # renormalize top->bottom
    kept = out[out["row_id"] >= 0].copy()
    if kept.empty:
        return out

    new_ids = sorted(
        kept["row_id"].unique().tolist(),
        key=lambda r: float(kept.loc[kept["row_id"] == r, "cy"].median())
    )
    remap = {old: i for i, old in enumerate(new_ids)}
    out.loc[out["row_id"] >= 0, "row_id"] = out.loc[out["row_id"] >= 0, "row_id"].map(remap).astype(int)
    return out

# ============================================================
# 6.3) OPTIONAL: DROP ONLY PUNCTUATION JUNK TOKENS (keep digits!)
# ============================================================

def drop_lowconf_punct(df: pd.DataFrame, *, punct_conf_max: float = 0.55) -> pd.DataFrame:
    """
    Drop punctuation-only tokens (like > ! . ,) when low confidence.
    IMPORTANT: we do NOT drop digits, because digits may be quantity.
    """
    if df.empty:
        return df
    out = df.copy()
    t = out["text"].astype(str).str.strip()
    is_punct = t.str.fullmatch(r"[^\w\s]+", na=False)
    low_conf = out["conf"].astype(float) <= float(punct_conf_max)
    return out.loc[~(is_punct & low_conf)].copy()


# ============================================================
# 6.5) ROW CLEANUP
# ============================================================

HEADER_KEYS = {"part", "no", "item", "name", "brand", "qty", "quantity", "unit", "price"}

def _norm(s: str) -> str:
    return "".join(ch.lower() for ch in s if ch.isalnum())

def row_is_headerish_tokens(texts: List[str]) -> bool:
    hits = 0
    alpha_tokens = 0
    for t in texts:
        tt = _norm(t)
        if not tt:
            continue
        if any(k in tt for k in HEADER_KEYS):
            hits += 1
        if any(ch.isalpha() for ch in t):
            alpha_tokens += 1
    return hits >= 2 and alpha_tokens >= 2

def _looks_numeric(s: str) -> bool:
    s = str(s).strip().replace(",", "")
    return bool(re.fullmatch(r"\d+(?:\.\d+)?", s))

def _looks_partish(s: str) -> bool:
    s = str(s).strip()
    if any(ch.isdigit() for ch in s) and (("-" in s) or ("/" in s)):
        return True
    if re.fullmatch(r"\d{4,}", s):
        return True
    return False

def cleanup_row_ids(
    df: pd.DataFrame,
    *,
    min_tokens_per_row: int = 3,
    glue_max_gap_factor: float = 1.6,
) -> pd.DataFrame:
    out = df.copy()
    out = out[out["row_id"] >= 0].copy()
    if out.empty:
        return df.copy()

    h_med = _median_f(out["h"].to_numpy(), default=12.0)
    glue_max_gap = glue_max_gap_factor * h_med

    row_ids = sorted(out["row_id"].unique().tolist())
    row_cy = {rid: float(out.loc[out["row_id"] == rid, "cy"].median()) for rid in row_ids}
    row_count = {rid: int((out["row_id"] == rid).sum()) for rid in row_ids}

    # 1) header-ish drop
    for rid in row_ids:
        texts = out.loc[out["row_id"] == rid, "text"].astype(str).tolist()
        if row_is_headerish_tokens(texts):
            out.loc[out["row_id"] == rid, "row_id"] = -1

    out2 = out[out["row_id"] >= 0].copy()
    if out2.empty:
        df2 = df.copy()
        df2["row_id"] = -1
        return df2

    # recompute
    row_ids = sorted(out2["row_id"].unique().tolist())
    row_cy = {rid: float(out2.loc[out2["row_id"] == rid, "cy"].median()) for rid in row_ids}
    row_count = {rid: int((out2["row_id"] == rid).sum()) for rid in row_ids}

    # 2) drop trash tiny rows
    for rid in row_ids:
        if row_count[rid] >= min_tokens_per_row:
            continue
        texts = out2.loc[out2["row_id"] == rid, "text"].astype(str).tolist()
        has_numeric = any(_looks_numeric(t) for t in texts)
        has_partish = any(_looks_partish(t) for t in texts)
        if (not has_numeric) and (not has_partish):
            out2.loc[out2["row_id"] == rid, "row_id"] = -1

    out3 = out2[out2["row_id"] >= 0].copy()
    if out3.empty:
        df3 = df.copy()
        df3["row_id"] = -1
        return df3

    # recompute
    row_ids = sorted(out3["row_id"].unique().tolist())
    row_cy = {rid: float(out3.loc[out3["row_id"] == rid, "cy"].median()) for rid in row_ids}
    row_count = {rid: int((out3["row_id"] == rid).sum()) for rid in row_ids}

    # 3) glue tiny rows
    for rid in row_ids:
        if row_count[rid] >= min_tokens_per_row:
            continue
        cy = row_cy[rid]
        candidates = [r2 for r2 in row_ids if r2 != rid]
        if not candidates:
            continue
        r_best = min(candidates, key=lambda r2: abs(row_cy[r2] - cy))
        gap = abs(row_cy[r_best] - cy)
        if gap <= glue_max_gap:
            out3.loc[out3["row_id"] == rid, "row_id"] = r_best

    # 4) renormalize
    kept = out3[out3["row_id"] >= 0].copy()
    new_ids = sorted(
        kept["row_id"].unique().tolist(),
        key=lambda r: float(kept.loc[kept["row_id"] == r, "cy"].median())
    )
    remap = {old: i for i, old in enumerate(new_ids)}
    kept["row_id"] = kept["row_id"].map(remap).astype(int)
    return kept


# ============================================================
# 7) COLS (KMeans 5)
# ============================================================

FINAL_FIELDS = ["part_no", "item_name", "brand", "quantity", "unit_price"]

def discover_cols_gmm(
    df: pd.DataFrame,
    n_cols: int = 5,
    use_conf_weights: bool = True,
    reg_covar: float = 1e-4,
) -> Tuple[pd.DataFrame, Dict[int, int]]:
    """
    Column clustering using Gaussian Mixture Model (GMM) on cx only.

    Why better than KMeans:
      - Columns can have different spreads (item_name wide, quantity narrow).
      - Still guarantees exactly n_cols clusters.

    Notes:
      - We cluster on cx only (1D).
      - We sort clusters left->right using means_ and remap to col_id 0..4.
      - sample_weight is supported only in newer sklearn versions;
        we try it, otherwise we gracefully ignore weights.
    """
    out = df.copy()

    # 1D feature: cx only
    X = out[["cx"]].to_numpy()

    weights = None
    if use_conf_weights and "conf" in out.columns:
        weights = out["conf"].astype(float).to_numpy()

    gmm = GaussianMixture(
        n_components=int(n_cols),
        covariance_type="full",
        reg_covar=float(reg_covar),
        random_state=0,
        n_init=3,
        init_params="kmeans",
    )

    # Fit (try weighted if supported)
    if weights is not None:
        try:
            gmm.fit(X, sample_weight=weights)  # sklearn >= newer versions
        except TypeError:
            gmm.fit(X)  # fallback if sample_weight unsupported
    else:
        gmm.fit(X)

    labels = gmm.predict(X)

    # Cluster "centers" in 1D are the means
    centers = gmm.means_.reshape(-1)  # shape (n_cols,)

    order = np.argsort(centers)  # left -> right
    remap = {int(cluster_idx): int(rank) for rank, cluster_idx in enumerate(order)}

    out["col_cluster"] = labels
    out["col_id"] = out["col_cluster"].map(lambda c: remap.get(int(c), -1))

    return out, remap


# ============================================================
# 8) PIVOT
# ============================================================

def build_table(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    work = df.copy()
    work = work[(work["row_id"] >= 0) & (work["col_id"] >= 0)].copy()
    if work.empty:
        return pd.DataFrame(columns=FINAL_FIELDS), []

    work = work.sort_values(["row_id", "col_id", "x1"], ascending=True)

    cell_text = (
        work.groupby(["row_id", "col_id"])["text"]
        .apply(lambda s: " ".join(s.astype(str).tolist()))
        .reset_index()
    )

    pivot = cell_text.pivot(index="row_id", columns="col_id", values="text")

    for c in range(5):
        if c not in pivot.columns:
            pivot[c] = None
    pivot = pivot[[0, 1, 2, 3, 4]].sort_index()
    pivot.columns = FINAL_FIELDS

    records: List[Dict[str, Any]] = pivot.reset_index(drop=True).to_dict(orient="records")
    records = [r for r in records if any(v not in (None, "", " ") for v in r.values())]
    table = pd.DataFrame(records, columns=FINAL_FIELDS)

    return table, records

#smart colmn asigment 


# ============================================================
# 8.5) POST-FIXES (quantity/brand drift + cleaning)
# ============================================================

def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() == "nan"

def fix_quantity_brand_swap(table_df: pd.DataFrame) -> pd.DataFrame:
    """
    Fix common column drift where quantity ends up inside brand cell:
      brand="1 KYB" -> quantity="1", brand="KYB"
      brand="2" and quantity empty -> quantity="2", brand=None
    """
    if table_df.empty:
        return table_df

    out = table_df.copy()

    for i in range(len(out)):
        brand = out.at[i, "brand"]
        qty = out.at[i, "quantity"]

        brand_s = "" if brand is None else str(brand).strip()
        qty_s = "" if qty is None else str(qty).strip()

        m = re.match(r"^\s*(\d+)\s+(.+?)\s*$", brand_s)
        if m and _is_empty(qty_s):
            out.at[i, "quantity"] = m.group(1)
            out.at[i, "brand"] = m.group(2).strip()
            continue

        if re.fullmatch(r"\d+", brand_s) and _is_empty(qty_s):
            out.at[i, "quantity"] = brand_s
            out.at[i, "brand"] = None
            continue

    return out

def post_clean_table(table_df: pd.DataFrame) -> pd.DataFrame:
    if table_df.empty:
        return table_df

    out = table_df.copy()

    # Remove leading "000 " in part_no
    out["part_no"] = out["part_no"].astype(str).str.replace(r"^\s*0{3,}\s+", "", regex=True)

    # Remove punctuation-only garbage tokens inside text fields
    def clean_cell(v: Any) -> Any:
        if v is None:
            return None
        s = str(v).strip()
        if s.lower() == "nan" or s == "":
            return None
        # remove standalone punctuation tokens
        s = re.sub(r"\b[>!.:,;]+\b", "", s)
        s = re.sub(r"\s{2,}", " ", s).strip()
        return s or None

    for col in ["brand", "quantity", "unit_price"]:
        out[col] = out[col].apply(clean_cell)

    return out


# ============================================================
# 9) FULL PIPELINE
# ============================================================
# ============================================================
# 10) MASTER RECONCILIATION (SIMPLE, FIXED COLUMNS, THRESH=70)
# Works ONLY on the table produced by your previous logic:
# col0 part_no, col1 item_name, col2 brand, col3 qty, col4 unit_price
# ============================================================

# Optional fuzzy matching (required for reconciliation)
try:
    from rapidfuzz import process, utils
    from rapidfuzz.distance import Levenshtein
    HAS_RAPIDFUZZ = True
except Exception:
    HAS_RAPIDFUZZ = False


MATCH_THRESHOLD = 70.0

def dp(v: Any) -> str:
    """Normalize using RapidFuzz default processor (your requirement)."""
    return utils.default_process("" if v is None else str(v))

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v).strip()

def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        s = str(v).strip()
        if not s or s.lower() == "nan":
            return None
        m = re.search(r"[-+]?\d+(?:\.\d+)?", s.replace(",", ""))
        return float(m.group(0)) if m else None
    except Exception:
        return None

def _is_pure_numeric(s: str) -> bool:
    """Check if string consists only of digits (no spaces, no hyphens)."""
    return bool(re.fullmatch(r"\d+", s))

def _hamming_distance(s1: str, s2: str) -> int:
    """Return Hamming distance if lengths equal, else a large number."""
    if len(s1) != len(s2):
        return len(s1) + len(s2)  # effectively infinite
    return sum(c1 != c2 for c1, c2 in zip(s1, s2))
def _normalize_brand(s: str) -> str:
    """Normalize brand: remove all whitespace, lowercase."""
    if s is None:
        return ""
    return re.sub(r'\s+', '', str(s)).lower()

def _build_master_indexes(master_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    part_choices: List[str] = []
    name_choices: List[str] = []
    brand_choices: List[str] = []                # normalized brand keys (space‑free)
    brand_norm_to_original: Dict[str, str] = {}  # normalized key -> original master brand

    part_choice_to_row: Dict[str, Dict[str, Any]] = {}
    name_choice_to_row: Dict[str, Dict[str, Any]] = {}
    itembrand_choice_to_row: Dict[str, Dict[str, Any]] = {}

    itembrand_choices: List[str] = []

    for m in master_items:
        mp = _safe_str(m.get("part_no"))
        mn = _safe_str(m.get("item_name"))
        mb = _safe_str(m.get("brand"))

        mp_k = dp(mp)
        mn_k = dp(mn)
        mb_norm = _normalize_brand(mb)

        if mp_k:
            part_choices.append(mp_k)
            part_choice_to_row[mp_k] = m

        if mn_k:
            name_choices.append(mn_k)
            name_choice_to_row.setdefault(mn_k, m)

        if mb_norm:
            brand_choices.append(mb_norm)
            if mb_norm not in brand_norm_to_original:
                brand_norm_to_original[mb_norm] = mb  # keep first occurrence

        if mn_k or mb_norm:
            ib_k = f"{mn_k}|{mb_norm}"
            itembrand_choices.append(ib_k)
            itembrand_choice_to_row[ib_k] = m

    return {
        "part_choices": sorted(set(part_choices)),
        "name_choices": sorted(set(name_choices)),
        "brand_choices": sorted(set(brand_choices)),
        "brand_norm_to_original": brand_norm_to_original,
        "itembrand_choices": sorted(set(itembrand_choices)),
        "part_choice_to_row": part_choice_to_row,
        "name_choice_to_row": name_choice_to_row,
        "itembrand_choice_to_row": itembrand_choice_to_row,
    }
# ============================================================
def reassign_columns_with_master(df: pd.DataFrame, master_items: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Reassign col_id based on content matching with master list.
    Input df has columns: text, row_id, col_cluster, col_id (initial spatial order).
    Output df with updated col_id (0..4) reflecting field types.
    """
    if df.empty or not master_items:
        return df

    # Build master lists (normalized with dp)
    master_parts = list(set(dp(m.get("part_no")) for m in master_items if m.get("part_no")))
    master_names = list(set(dp(m.get("item_name")) for m in master_items if m.get("item_name")))
    master_brands = list(set(dp(m.get("brand")) for m in master_items if m.get("brand")))

    # For each column cluster (by col_cluster, the raw GMM clusters)
    clusters = df["col_cluster"].unique()
    cluster_scores = {}  # cluster -> dict of scores

    for cl in clusters:
        cluster_df = df[df["col_cluster"] == cl]
        tokens = cluster_df["text"].astype(str).tolist()
        part_scores = []
        name_scores = []
        brand_scores = []
        numeric_count = 0
        for tok in tokens:
            tok_norm = dp(tok)
            # part score: best similarity to any master part
            if master_parts:
                part_best = max((Levenshtein.normalized_similarity(tok_norm, p) for p in master_parts), default=0)
                part_scores.append(part_best)
            # name score
            if master_names:
                name_best = max((Levenshtein.normalized_similarity(tok_norm, n) for n in master_names), default=0)
                name_scores.append(name_best)
            # brand score
            if master_brands:
                brand_best = max((Levenshtein.normalized_similarity(tok_norm, b) for b in master_brands), default=0)
                brand_scores.append(brand_best)
            # detect numeric (quantity or price)
            if re.match(r'^\d+$', tok.strip()) or re.match(r'^\d+\.?\d*$', tok.strip().replace(',','')):
                numeric_count += 1
        # Average scores (or we could use max; average is more robust)
        avg_part = sum(part_scores)/len(part_scores) if part_scores else 0
        avg_name = sum(name_scores)/len(name_scores) if name_scores else 0
        avg_brand = sum(brand_scores)/len(brand_scores) if brand_scores else 0
        numeric_frac = numeric_count / len(tokens) if tokens else 0
        cluster_scores[cl] = {
            "part": avg_part,
            "name": avg_name,
            "brand": avg_brand,
            "numeric": numeric_frac
        }

    # Get spatial order of clusters (left to right) using median cx
    cluster_cx = {cl: df[df["col_cluster"] == cl]["cx"].median() for cl in clusters}
    sorted_clusters = sorted(clusters, key=lambda cl: cluster_cx[cl])

    # Mapping from cluster to target field
    new_mapping = {}
    # First assign part, name, brand based on highest score among unassigned clusters
    # Use a threshold to avoid assigning weak matches
    threshold = 0.5  # similarity threshold (50%)

    # Helper to find best unassigned cluster for a given field
    def best_unassigned_for_field(field):
        best_cl = None
        best_score = 0
        for cl in sorted_clusters:
            if cl in new_mapping:
                continue
            score = cluster_scores[cl][field]
            if score > best_score:
                best_score = score
                best_cl = cl
        return best_cl, best_score

    # Assign part
    cl, score = best_unassigned_for_field("part")
    if cl is not None and score >= threshold:
        new_mapping[cl] = "part"
    # Assign name
    cl, score = best_unassigned_for_field("name")
    if cl is not None and score >= threshold:
        new_mapping[cl] = "name"
    # Assign brand
    cl, score = best_unassigned_for_field("brand")
    if cl is not None and score >= threshold:
        new_mapping[cl] = "brand"

    # Now the remaining clusters (should be 2 if we assigned 3, or more if some thresholds not met)
    # We'll assign quantity and price based on position and numeric content
    unassigned = [cl for cl in sorted_clusters if cl not in new_mapping]

    # Among unassigned, separate those that are strongly numeric
    numeric_clusters = [cl for cl in unassigned if cluster_scores[cl]["numeric"] > 0.5]

    if len(unassigned) == 2:
        # Exactly two left: leftmost -> quantity, rightmost -> price
        left, right = unassigned[0], unassigned[1]
        new_mapping[left] = "quantity"
        new_mapping[right] = "price"
    elif len(unassigned) == 1:
        # Only one left – maybe a numeric column, assign as quantity (or price based on position)
        # We'll need to infer; if it's numeric, assign as quantity, otherwise maybe brand? But we already assigned brand.
        # Fallback: use position in expected order
        target_fields = ["part", "name", "brand", "quantity", "price"]
        # Build list of already assigned fields
        assigned_fields = set(new_mapping.values())
        # Find the first field not assigned, in order
        for f in target_fields:
            if f not in assigned_fields:
                new_mapping[unassigned[0]] = f
                break
    else:
        # More than 2? Should not happen with 5 clusters, but just in case, assign by position
        target_fields = ["part", "name", "brand", "quantity", "price"]
        assigned_count = 0
        for cl in sorted_clusters:
            if cl not in new_mapping:
                while assigned_count < 5 and target_fields[assigned_count] in new_mapping.values():
                    assigned_count += 1
                if assigned_count < 5:
                    new_mapping[cl] = target_fields[assigned_count]
                    assigned_count += 1
                else:
                    new_mapping[cl] = "unknown"

    # Convert field names to col_id
    field_to_id = {"part": 0, "name": 1, "brand": 2, "quantity": 3, "price": 4, "unknown": -1}
    out = df.copy()
    out["col_id"] = out["col_cluster"].map(lambda cl: field_to_id.get(new_mapping.get(cl, "unknown"), -1))
    return out

def split_merged_records(records: List[Dict], master_items: List[Dict]) -> List[Dict]:
    """
    Split records where part_no contains multiple tokens that could be separate parts.
    For each token that matches a master part with score ≥ 70, create a new record.
    Assign other fields by index if they have enough tokens; otherwise leave empty.
    The new record uses the canonical part number and brand from the matched master,
    and tries to pick the corresponding item name, quantity, price from the token lists.
    """
    if not master_items:
        return records

    # Build list of normalized master parts for quick scoring
    master_parts = [dp(m.get("part_no")) for m in master_items if m.get("part_no")]

    new_records = []
    for rec in records:
        part_str = rec.get("part_no", "")
        if not isinstance(part_str, str):
            new_records.append(rec)
            continue
        part_tokens = part_str.split()
        if len(part_tokens) <= 1:
            new_records.append(rec)
            continue

        # For each token, see if it matches a master part well
        candidate_parts = []  # list of (token, master_item)
        for tok in part_tokens:
            best_key, score = _match_one(tok, master_parts)
            if score >= 70:
                # Find the master item with that part key
                for m in master_items:
                    if dp(m.get("part_no")) == best_key:
                        candidate_parts.append((tok, m))
                        break

        if len(candidate_parts) <= 1:
            new_records.append(rec)
            continue

        # Split other fields by whitespace
        name_tokens = rec.get("item_name", "").split() if isinstance(rec.get("item_name"), str) else []
        brand_tokens = rec.get("brand", "").split() if isinstance(rec.get("brand"), str) else []
        qty_tokens = rec.get("quantity", "").split() if isinstance(rec.get("quantity"), str) else []
        price_tokens = rec.get("unit_price", "").split() if isinstance(rec.get("unit_price"), str) else []

        # Create a new record for each candidate part
        for idx, (tok, master) in enumerate(candidate_parts):
            new_rec = {}
            # Use canonical part from master
            new_rec["part_no"] = master.get("part_no")

            # Item name: prefer the token at same index from name_tokens, else master name
            if idx < len(name_tokens):
                new_rec["item_name"] = name_tokens[idx]
            else:
                new_rec["item_name"] = master.get("item_name")

            # Brand: use master brand (canonical)
            new_rec["brand"] = master.get("brand")

            # Quantity: token at same index if available
            new_rec["quantity"] = qty_tokens[idx] if idx < len(qty_tokens) else ""

            # Unit price: token at same index if available
            new_rec["unit_price"] = price_tokens[idx] if idx < len(price_tokens) else ""

            # Placeholder scores – will be recalculated in reconciliation
            new_rec["match_scores"] = {"part_no": 0.0, "item_name": 0.0, "brand": 0.0}
            new_rec["needs_review"] = True
            new_records.append(new_rec)

    return new_records


def _match_one(query: Any, choices: List[str]) -> Tuple[Optional[str], float]:
    """
    Return (best_choice, score_0_100).
    Uses dp() before comparing and assumes choices are already dp()'d.
    """
    q = dp(query)
    if not q or not choices or not HAS_RAPIDFUZZ:
        return None, 0.0

    res = process.extractOne(
        q,
        choices,
        scorer=Levenshtein.normalized_similarity,  # returns 0..1
        processor=None,  # IMPORTANT: we already used dp()
    )
    if not res:
        return None, 0.0
    best_choice, score, _ = res
    # Convert to percentage (0..100)
    return str(best_choice), float(score) * 100.0


# --- Updated reconcile function ---
def reconcile_with_master(
    records: List[Dict[str, Any]],
    master_items: List[Dict[str, Any]],
    *,
    part_threshold: float = 70.0,
    name_threshold: float = 70.0,
    brand_threshold: float = 60.0,
    price_tolerance: float = 1000.0,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Rules:
      - Keep columns as-is.
      - Part number: correct if match score ≥ part_threshold; log only if pure‑numeric,
        same length, and Hamming distance ≤ 1.
      - Item name: correct if match score ≥ name_threshold; always silent.
      - Brand: correct if match score (using space‑free normalized strings) ≥ brand_threshold; always silent.
      - Price: if a master row is identified (by part number or item+brand), compare OCR price
        with master price; if |diff| > price_tolerance, snap to master price and log;
        otherwise keep OCR price.
      - `needs_review` is true if any original score is below its respective threshold.
    """
    if not master_items or not records or not HAS_RAPIDFUZZ:
        return records, []

    idx = _build_master_indexes(master_items)

    cleaned: List[Dict[str, Any]] = []
    corrections: List[Dict[str, Any]] = []

    for i, r in enumerate(records):
        rr = dict(r)

        # --- 1) match each field independently ---
        best_part_key, part_score = _match_one(rr.get("part_no"), idx["part_choices"])
        best_name_key, name_score = _match_one(rr.get("item_name"), idx["name_choices"])

        # Brand matching: normalize the query and compare against normalized choices
        brand_query = _normalize_brand(rr.get("brand"))
        best_brand_norm, brand_score = _match_one(brand_query, idx["brand_choices"])

        # --- 2) find a master row for price correction (fallback uses item+brand) ---
        master_row = None
        if best_part_key is not None and part_score >= part_threshold:
            master_row = idx["part_choice_to_row"].get(best_part_key)

        if master_row is None:
            ib_key = f"{dp(rr.get('item_name'))}|{_normalize_brand(rr.get('brand'))}"
            best_ib, ib_score = _match_one(ib_key, idx["itembrand_choices"])
            if best_ib is not None and ib_score >= part_threshold:  # use part_threshold for fallback
                master_row = idx["itembrand_choice_to_row"].get(best_ib)

        corr_list = []   # logged corrections (part_no special, price out-of-tolerance)

        # --- 3) apply part number correction (with logging rule) ---
        if best_part_key is not None and part_score >= part_threshold:
            m = idx["part_choice_to_row"].get(best_part_key)
            if m:
                new_part = m.get("part_no")
                orig_part = rr.get("part_no")
                if _safe_str(orig_part) != _safe_str(new_part):
                    log_part = False
                    if _is_pure_numeric(str(orig_part)) and _is_pure_numeric(str(new_part)):
                        if len(str(orig_part)) == len(str(new_part)):
                            hd = _hamming_distance(str(orig_part), str(new_part))
                            if hd <= 1:
                                log_part = True
                    rr["part_no"] = new_part
                    if log_part:
                        corr_list.append({
                            "field": "part_no",
                            "original": orig_part,
                            "corrected": new_part,
                            "confidence": part_score / 100.0,
                            "reason": "rewrite_to_master_by_similarity",
                        })

        # --- 4) apply item name correction (silent) ---
        if best_name_key is not None and name_score >= name_threshold:
            m = idx["name_choice_to_row"].get(best_name_key)
            if m:
                new_name = m.get("item_name")
                if _safe_str(rr.get("item_name")) != _safe_str(new_name):
                    rr["item_name"] = new_name
                    # no correction entry

        # --- 5) apply brand correction (silent) using space‑free normalized match ---
        if best_brand_norm is not None and brand_score >= brand_threshold:
            # Retrieve the original brand string from the mapping
            original_brand = idx["brand_norm_to_original"].get(best_brand_norm)
            if original_brand is not None:
                if _safe_str(rr.get("brand")) != _safe_str(original_brand):
                    rr["brand"] = original_brand
                    # no correction entry

        # --- 6) price correction with tolerance, using master_row if available ---
        if master_row is not None:
            master_price = master_row.get("unit_price")
            master_price_float = _safe_float(master_price)
            if master_price_float is not None:
                ocr_price_str = rr.get("unit_price")
                ocr_price_float = _safe_float(ocr_price_str)
                if ocr_price_float is not None:
                    diff = abs(ocr_price_float - master_price_float)
                    if diff > price_tolerance:
                        # Snap to master price and log
                        rr["unit_price"] = master_price
                        corr_list.append({
                            "field": "unit_price",
                            "original": ocr_price_str,
                            "corrected": master_price,
                            "confidence": 1.0,
                            "reason": "price_outside_tolerance",
                        })
                    # else keep OCR price (no change, no notification)
                # else OCR price not numeric – leave as is

        # --- 7) flag rows that need review based on original scores ---
        rr["match_scores"] = {
            "part_no": round(part_score, 1),
            "item_name": round(name_score, 1),
            "brand": round(brand_score, 1),
        }

        rr["needs_review"] = (
            (part_score < part_threshold) or
            (name_score < name_threshold) or
            (brand_score < brand_threshold)
        )

        if corr_list:
            corrections.append({"item_index": i, "corrections": corr_list})

        cleaned.append(rr)

    return cleaned, corrections
# ============================================================
# 9) FULL PIPELINE (your previous logic) + NEW MASTER RECONCILE
# ============================================================

def extract_table_hybrid(
    words: List[Word],
    conf_min: float = 0.0,
    y_stretch: float = 5.0,
    hdb_min_cluster_size: int = 3,
    hdb_min_samples: int = 2,
    hdb_epsilon: float = 0.0,
    row_conf_min: float = 0.0,
    punct_conf_max: float = 0.55,
    split_factor: float = 1.25,
    deskew: bool = True,
    rotate_90: bool = True,
    use_conf_weights: bool = True,
    max_deskew_deg: float = 8.0,
    master_items: Optional[List[Dict[str, Any]]] = None,
    match_threshold: float = 70.0,
) -> Dict[str, Any]:
    df = words_to_dataframe(words)

    if conf_min > 0.0:
        df = df[df["conf"] >= conf_min].copy()

    df = drop_lowconf_punct(df, punct_conf_max=punct_conf_max)

    if df.empty:
        return {
            "df_tokens": df,
            "table_df": pd.DataFrame(columns=FINAL_FIELDS),
            "records": [],
            "corrections": [],
            "debug": {"rotated_90": False, "deskew_angle_rad": 0.0},
        }

    rotated_90 = False
    if rotate_90 and detect_needs_rotate_90(df):
        df = rotate_90_ccw_df(df)
        rotated_90 = True

    angle = 0.0
    if deskew:
        df, angle = deskew_df(df, max_deskew_deg=max_deskew_deg)

    df = discover_rows_hdbscan(
        df,
        y_stretch=y_stretch,
        min_cluster_size=hdb_min_cluster_size,
        min_samples=hdb_min_samples,
        cluster_selection_epsilon=hdb_epsilon,
        row_conf_min=row_conf_min,
    )
    df = normalize_row_ids(df)

    df = split_fat_rows(df, sep_factor=0.45, min_side=2)

    df_clean = cleanup_row_ids(df, min_tokens_per_row=4, glue_max_gap_factor=1.6)
    if df_clean.empty:
        return {
            "df_tokens": df,
            "table_df": pd.DataFrame(columns=FINAL_FIELDS),
            "records": [],
            "corrections": [],
            "debug": {"rotated_90": rotated_90, "deskew_angle_rad": angle},
        }

    df_clean, col_remap = discover_cols_gmm(df_clean, n_cols=5, use_conf_weights=use_conf_weights)

    # Reassign columns using master list if available
    reassign_performed = False
    if master_items:
        df_clean = reassign_columns_with_master(df_clean, master_items)
        reassign_performed = True

    table_df, _ = build_table(df_clean)

    table_df = fix_quantity_brand_swap(table_df)
    table_df = post_clean_table(table_df)

    records = table_df.to_dict(orient="records")

    # NEW: attempt to split merged rows using master‑guided part detection
    if master_items:
        records = split_merged_records(records, master_items)
        table_df = pd.DataFrame(records)

    corrections: List[Dict[str, Any]] = []
    if master_items and records and "reconcile_with_master" in globals():
        try:
            records, corrections = reconcile_with_master(
                records,
                master_items,
                part_threshold=float(match_threshold),
                name_threshold=float(match_threshold),
                brand_threshold=60.0,
                price_tolerance=1000.0,
            )
            table_df = pd.DataFrame(records)
        except Exception as e:
            print(f"[WARN] reconcile_with_master failed: {e}", file=sys.stderr)
            corrections = []

    return {
        "df_tokens": df_clean,
        "table_df": table_df,
        "records": records,
        "corrections": corrections,
        "debug": {
            "rotated_90": rotated_90,
            "deskew_angle_rad": angle,
            "col_cluster_to_col_id": col_remap,
            "reassign_performed": reassign_performed,
            "hdbscan": {
                "min_cluster_size": int(hdb_min_cluster_size),
                "min_samples": int(hdb_min_samples),
                "epsilon": float(hdb_epsilon),
                "row_conf_min": float(row_conf_min),
                "y_stretch_effective": float(_auto_y_stretch_from_heights(df_clean))
                if y_stretch <= 0 else float(y_stretch),
            },
            "postfix": {
                "split_factor": float(split_factor),
                "punct_conf_max": float(punct_conf_max),
            },
            "master_reconcile": {
                "enabled": bool(master_items),
                "part_threshold": float(match_threshold),
                "name_threshold": float(match_threshold),
                "brand_threshold": 60.0,
                "price_tolerance": 1000.0,
            },
        },
    }
# ============================================================
# 11) MAKE ITEMS (helper for output)
# ============================================================
def make_items(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert reconciled records into the final item list.
    Here we simply return the records as they are.
    If you need to strip extra fields (like match_scores, needs_review),
    you can filter them out here.
    """
    return records


# ============================================================
# 12) MAIN: argv -> JSON stdout ONLY
# ============================================================
def main() -> None:
    def _json_safe(v):
        if v is None:
            return None
        if isinstance(v, (float, np.floating)):
            if math.isnan(v) or math.isinf(v):
                return None
            return float(v)
        if isinstance(v, (int, np.integer)):
            return int(v)
        if isinstance(v, dict):
            return {k: _json_safe(val) for k, val in v.items()}
        if isinstance(v, (list, tuple)):
            return [_json_safe(x) for x in v]
        return v

    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing image_path", "items": []}, ensure_ascii=False))
        return

    image_path = sys.argv[1]
    master_path = sys.argv[2] if len(sys.argv) > 2 else None

    master_items = None
    if master_path:
        try:
            with open(master_path, "r", encoding="utf-8") as f:
                master_items = json.load(f)
            if not isinstance(master_items, list):
                master_items = None
        except Exception as e:
            print(f"[WARN] Could not load master items from {master_path}: {e}", file=sys.stderr)

    try:
        words = vision_words_from_image(image_path)

        result = extract_table_hybrid(
            words,
            master_items=master_items,
            match_threshold=70.0,
        )

        records = result.get("records", []) or []
        items = make_items(records)

        payload = {
            "success": True,
            "items": _json_safe(items),
            "debug": _json_safe(result.get("debug", {})),
            "corrections": _json_safe(result.get("corrections", [])),
        }

        print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    except Exception as e:
        err_payload = {"success": False, "error": str(e), "items": []}
        print(json.dumps(err_payload, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()