#!/usr/bin/env python3
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional
import json
import math
import re
import sys
import warnings
from sklearn.exceptions import ConvergenceWarning

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
import hdbscan
from google.cloud import vision

# Optional fuzzy matching
try:
    from rapidfuzz import fuzz, process
    HAS_FUZZY = True
except ImportError:
    HAS_FUZZY = False
    print("[INFO] rapidfuzz not installed; fuzzy matching disabled.", file=sys.stderr)


def _warn_to_stderr(message, category, filename, lineno, file=None, line=None):
    print(f"{filename}:{lineno}: {category.__name__}: {message}", file=sys.stderr)


warnings.showwarning = _warn_to_stderr
warnings.filterwarnings("ignore", category=ConvergenceWarning)

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
    df: pd.DataFrame, *, max_pairs: int = 6000, dy_factor: float = 0.6, min_dx: float = 5.0
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
    min_cluster_size: int = 4,                # increased to avoid splitting
    min_samples: int = 2,
    cluster_selection_epsilon: float = 1.0,   # small epsilon to prevent over‑splitting
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
def split_fat_rows(df: pd.DataFrame, *, sep_factor: float = 0.45, min_side: int = 2) -> pd.DataFrame:
    if df.empty or "row_id" not in df.columns:
        return df
    out = df.copy()
    max_row = out["row_id"].max()
    next_row_id = int(max_row) + 1 if pd.notna(max_row) and max_row >= 0 else 0

    row_ids = sorted(
        [r for r in out["row_id"].unique().tolist() if r >= 0],
        key=lambda r: float(out.loc[out["row_id"] == r, "cy"].median()),
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
        if sep < (sep_factor * h_med_row):
            continue

        low_label = int(np.argmax(centers))  # larger cy = lower on page
        lower = [i for i, lab in zip(idx, labels) if int(lab) == low_label]
        upper = [i for i, lab in zip(idx, labels) if int(lab) != low_label]

        if len(lower) < min_side or len(upper) < min_side:
            continue

        out.loc[lower, "row_id"] = next_row_id
        next_row_id += 1

    kept = out[out["row_id"] >= 0].copy()
    if kept.empty:
        return out
    new_ids = sorted(
        kept["row_id"].unique().tolist(),
        key=lambda r: float(kept.loc[kept["row_id"] == r, "cy"].median()),
    )
    remap = {old: i for i, old in enumerate(new_ids)}
    out.loc[out["row_id"] >= 0, "row_id"] = out.loc[out["row_id"] >= 0, "row_id"].map(remap).astype(int)
    return out
def split_rows_by_internal_cy_gaps(
    df: pd.DataFrame,
    *,
    gap_factor: float = 0.85,   # smaller = more aggressive splitting
    min_tokens_side: int = 3
) -> pd.DataFrame:
    """
    If a single row_id contains two (or more) horizontal lines of text,
    split it into separate row_ids by looking at gaps in cy inside that row.

    This is safer than global 'glue' logic and fixes cases like:
    "Front Belt arm Lamp brush ..." all in one row.
    """
    if df.empty or "row_id" not in df.columns:
        return df

    out = df.copy()

    # global median height for a reasonable gap threshold
    h_med = float(np.median(out["h"].to_numpy())) if "h" in out.columns and len(out) else 12.0
    gap_thresh = gap_factor * max(h_med, 8.0)

    # we will assign new ids after the current max
    current_max = int(out["row_id"].max()) if (out["row_id"] >= 0).any() else -1
    next_id = current_max + 1

    for rid in sorted([r for r in out["row_id"].unique().tolist() if r >= 0]):
        idx = out.index[out["row_id"] == rid].tolist()
        if len(idx) < (min_tokens_side * 2):
            continue

        sub = out.loc[idx].copy().sort_values("cy")
        cys = sub["cy"].to_numpy()

        # differences between consecutive cy's
        diffs = np.diff(cys)
        if diffs.size == 0:
            continue

        # find the biggest gap
        k = int(np.argmax(diffs))
        biggest_gap = float(diffs[k])

        # if biggest gap is large enough => split
        if biggest_gap >= gap_thresh:
            upper_idx = sub.index[: k + 1]
            lower_idx = sub.index[k + 1 :]

            if len(upper_idx) < min_tokens_side or len(lower_idx) < min_tokens_side:
                continue

            out.loc[lower_idx, "row_id"] = next_id
            next_id += 1

    # re-normalize row ids by vertical order
    kept = out[out["row_id"] >= 0].copy()
    if kept.empty:
        return out

    new_ids = sorted(
        kept["row_id"].unique().tolist(),
        key=lambda r: float(kept.loc[kept["row_id"] == r, "cy"].median()),
    )
    remap = {old: i for i, old in enumerate(new_ids)}
    out.loc[out["row_id"] >= 0, "row_id"] = out.loc[out["row_id"] >= 0, "row_id"].map(remap).astype(int)
    return out

# ============================================================
# 6.3) DROP ONLY PUNCTUATION JUNK TOKENS (keep digits!)
# ============================================================
def drop_lowconf_punct(df: pd.DataFrame, *, punct_conf_max: float = 0.55) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    t = out["text"].astype(str).str.strip()
    is_punct = t.str.fullmatch(r"[^\w\s]+", na=False)
    low_conf = out["conf"].astype(float) <= float(punct_conf_max)
    return out.loc[~(is_punct & low_conf)].copy()


# ============================================================
# 6.5) ROW CLEANUP – now with vertical merging
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
    min_tokens_per_row: int = 4,
    glue_max_gap_factor: float = 1.6,
    merge_vertical_threshold: float = 0.5,    # new: merge rows closer than 0.5 * median height
) -> pd.DataFrame:
    out = df.copy()
    out = out[out["row_id"] >= 0].copy()
    if out.empty:
        return pd.DataFrame(columns=df.columns)

    h_med = _median_f(out["h"].to_numpy(), default=12.0)
    glue_max_gap = glue_max_gap_factor * h_med
    merge_thresh = merge_vertical_threshold * h_med

    row_ids = sorted(out["row_id"].unique().tolist())
    row_cy = {rid: float(out.loc[out["row_id"] == rid, "cy"].median()) for rid in row_ids}
    row_count = {rid: int((out["row_id"] == rid).sum()) for rid in row_ids}

    # 1) drop header-ish
    for rid in row_ids:
        texts = out.loc[out["row_id"] == rid, "text"].astype(str).tolist()
        if row_is_headerish_tokens(texts):
            out.loc[out["row_id"] == rid, "row_id"] = -1

    out2 = out[out["row_id"] >= 0].copy()
    if out2.empty:
        return pd.DataFrame(columns=df.columns)

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
        return pd.DataFrame(columns=df.columns)

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

    # 4) NEW: merge rows that are vertically very close and horizontally overlapping
    #    (fixes duplicate rows from HDBSCAN over‑splitting)
    row_ids = sorted(out3["row_id"].unique().tolist())
    for i in range(len(row_ids)-1):
        r1 = row_ids[i]
        r2 = row_ids[i+1]
        # vertical gap
        y1 = out3.loc[out3["row_id"] == r1, "cy"].median()
        y2 = out3.loc[out3["row_id"] == r2, "cy"].median()
        if abs(y2 - y1) > merge_thresh:
            continue
        # horizontal overlap
        xmin1 = out3.loc[out3["row_id"] == r1, "x1"].min()
        xmax1 = out3.loc[out3["row_id"] == r1, "x2"].max()
        xmin2 = out3.loc[out3["row_id"] == r2, "x1"].min()
        xmax2 = out3.loc[out3["row_id"] == r2, "x2"].max()
        if not (xmax1 < xmin2 or xmax2 < xmin1):
            # merge r2 into r1
            out3.loc[out3["row_id"] == r2, "row_id"] = r1

    # 5) renormalize
    kept = out3[out3["row_id"] >= 0].copy()
    new_ids = sorted(
        kept["row_id"].unique().tolist(),
        key=lambda r: float(kept.loc[kept["row_id"] == r, "cy"].median()),
    )
    remap = {old: i for i, old in enumerate(new_ids)}
    kept["row_id"] = kept["row_id"].map(remap).astype(int)
    return kept


# ============================================================
# 7) COLS (GMM 5) – with outlier reassignment
# ============================================================
FINAL_FIELDS = ["part_no", "item_name", "brand", "quantity", "unit_price"]


def discover_cols_gmm(
    df: pd.DataFrame,
    n_cols: int = 5,
    use_conf_weights: bool = True,
    reg_covar: float = 1e-3,                  # slightly higher for stability
) -> Tuple[pd.DataFrame, Dict[int, int]]:
    out = df.copy()
    X = out[["cx"]].to_numpy()
    weights = None
    if use_conf_weights and "conf" in out.columns:
        weights = out["conf"].astype(float).to_numpy()

    gmm = GaussianMixture(
        n_components=int(n_cols),
        covariance_type="full",
        reg_covar=float(reg_covar),
        random_state=0,
        n_init=10,                             # increased for stability
        init_params="kmeans",
    )
    if weights is not None:
        try:
            gmm.fit(X, sample_weight=weights)
        except TypeError:
            gmm.fit(X)
    else:
        gmm.fit(X)

    labels = gmm.predict(X)
    centers = gmm.means_.reshape(-1)

    # ---- NEW: reassign outliers based on horizontal position ----
    # compute allowed range per column
    col_ranges = []
    for col in range(n_cols):
        mask = (labels == col)
        if np.any(mask):
            left = X[mask].min()
            right = X[mask].max()
            col_ranges.append((left, right))
        else:
            col_ranges.append((centers[col], centers[col]))
    # for each token, if it lies far outside its assigned column, move to nearest
    for i in range(len(X)):
        cx = X[i, 0]
        assigned = labels[i]
        left, right = col_ranges[assigned]
        if cx < left - 20 or cx > right + 20:   # outlier threshold
            # find nearest column center
            dists = [abs(cx - c) for c in centers]
            new_col = np.argmin(dists)
            labels[i] = new_col
    # --------------------------------------------------------------

    order = np.argsort(centers)
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


# ============================================================
# 8.5) POST-FIXES
# ============================================================
def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() == "nan"


def fix_quantity_brand_swap(table_df: pd.DataFrame) -> pd.DataFrame:
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
    out["part_no"] = out["part_no"].astype(str).str.replace(r"^\s*0{3,}\s+", "", regex=True)

    def clean_cell(v: Any) -> Any:
        if v is None:
            return None
        s = str(v).strip()
        if s.lower() == "nan" or s == "":
            return None
        s = re.sub(r"\b[>!.:,;]+\b", "", s)
        s = re.sub(r"\s{2,}", " ", s).strip()
        return s or None

    for col in ["brand", "quantity", "unit_price", "item_name", "part_no"]:
        out[col] = out[col].apply(clean_cell)
    return out


def remap_records_by_column_roles(
    records: List[Dict[str, Any]],
    field_to_col: Dict[str, str],
) -> List[Dict[str, Any]]:
    """
    field_to_col: {"part_no":"item_name", ...}
    means: output["part_no"] = input_row["item_name"]
    """
    out = []
    for r in records:
        nr = {}
        for field in FINAL_FIELDS:
            src = field_to_col.get(field, field)
            nr[field] = r.get(src)
        out.append(nr)
    return out

def _count_master_parts_in_cell(v: Any, master_part_norms: set) -> int:
    if v is None:
        return 0
    s = str(v).strip()
    if not s:
        return 0
    hits = 0
    for tok in re.split(r"\s+", s):
        if _norm_part_alnum(tok) in master_part_norms:
            hits += 1
    # also whole cell
    if _norm_part_alnum(s) in master_part_norms:
        hits += 1
    return hits


def table_looks_healthy_for_role_resolution(table_df: pd.DataFrame, master_items: List[Dict[str, Any]]) -> bool:
    # build master part norms
    master_part_norms = set()
    for m in master_items:
        pn = _pick_master_part_norm(m)
        if pn:
            master_part_norms.add(pn)

    if table_df.empty:
        return False

    # If many cells contain MULTIPLE master parts -> rows merged -> unsafe
    multi_part_cells = 0
    total_cells = 0

    for col in FINAL_FIELDS:
        if col not in table_df.columns:
            continue
        for v in table_df[col].tolist():
            total_cells += 1
            if _count_master_parts_in_cell(v, master_part_norms) >= 2:
                multi_part_cells += 1

    if total_cells == 0:
        return False

    # If >= 10% cells have 2+ parts, it’s merged rows -> skip remap
    if (multi_part_cells / total_cells) >= 0.10:
        return False

    return True
# ============================================================
# 9) MATCH AND CLEAN – updated with currency stripping & price fix
# ============================================================
def resolve_column_roles_global(
    table_df: pd.DataFrame,
    master_items: Optional[List[Dict[str, Any]]],
) -> Dict[str, str]:
    """
    Decide which extracted column is which FIELD using:
    - master part numbers (strong signal)
    - master brands (medium signal)
    - numeric patterns for qty and unit_price

    Returns mapping: field -> existing_column_name
    Example: {"part_no":"item_name", "item_name":"part_no", ...}
    meaning: take values from column "item_name" and treat them as part_no.
    """
    if table_df.empty:
        return {c: c for c in FINAL_FIELDS}

    cols = [c for c in FINAL_FIELDS if c in table_df.columns]

    # Build master sets
    master_part_norms = set()
    master_brands_norm = set()
    if master_items:
        for m in master_items:
            pn = _pick_master_part_norm(m)
            if pn:
                master_part_norms.add(pn)
            b = str(m.get("brand", "") or "").strip()
            if b:
                master_brands_norm.add(_norm(b))

    def cell_part_hit(v: Any) -> int:
        if v is None:
            return 0
        s = str(v).strip()
        if not s:
            return 0
        # try multiple tokens inside the cell
        tokens = re.split(r"\s+", s)
        for t in tokens:
            if _norm_part_alnum(t) in master_part_norms:
                return 1
        # also try whole cell
        if _norm_part_alnum(s) in master_part_norms:
            return 1
        return 0

    def cell_brand_hit(v: Any) -> int:
        if v is None:
            return 0
        s = str(v).strip()
        if not s:
            return 0
        return 1 if _norm(s) in master_brands_norm else 0

    def cell_is_qty_like(v: Any) -> int:
        if v is None:
            return 0
        s = str(v).strip()
        if not s:
            return 0
        # qty is usually a small integer
        if re.fullmatch(r"\d{1,3}", s):
            n = int(s)
            return 1 if 1 <= n <= 999 else 0
        return 0

    def cell_is_price_like(v: Any) -> int:
        if v is None:
            return 0
        s = str(v).strip().replace(",", "")
        if not s:
            return 0
        # accept "12 000" too
        s2 = s.replace(" ", "")
        if re.fullmatch(r"\d{2,7}(?:\.\d+)?", s2):
            try:
                x = float(s2)
                # price range heuristic (tune if needed)
                return 1 if 10 <= x <= 5000000 else 0
            except Exception:
                return 0
        return 0

    # Score each column for each role
    scores = {}
    for col in cols:
        col_vals = table_df[col].tolist()
        n = max(1, len(col_vals))

        part_score = sum(cell_part_hit(v) for v in col_vals) / n
        brand_score = sum(cell_brand_hit(v) for v in col_vals) / n
        qty_score = sum(cell_is_qty_like(v) for v in col_vals) / n
        price_score = sum(cell_is_price_like(v) for v in col_vals) / n

        # item_name: not numeric, not part, not brand => leftover
        numericish = sum((cell_is_qty_like(v) or cell_is_price_like(v)) for v in col_vals) / n
        item_score = 1.0 - max(part_score, brand_score, numericish)

        scores[col] = {
            "part_no": part_score,
            "brand": brand_score,
            "quantity": qty_score,
            "unit_price": price_score,
            "item_name": item_score,
        }

    # Greedy assignment: pick best column per role without reuse
    remaining_cols = set(cols)
    mapping_field_to_col: Dict[str, str] = {}

    # priority: part_no strongest, then brand, then unit_price, then quantity, then item_name
    for field in ["part_no", "brand", "unit_price", "quantity", "item_name"]:
        best_col = None
        best_score = -1.0
        for col in remaining_cols:
            sc = scores[col][field]
            if sc > best_score:
                best_score = sc
                best_col = col

        if best_col is None:
            continue

        mapping_field_to_col[field] = best_col
        remaining_cols.remove(best_col)

    # Fallbacks if anything missing
    for field in FINAL_FIELDS:
        if field not in mapping_field_to_col:
            # pick any leftover
            mapping_field_to_col[field] = remaining_cols.pop() if remaining_cols else field

    return mapping_field_to_col
def remap_table_df_by_column_roles(table_df: pd.DataFrame, field_to_src: Dict[str, str]) -> pd.DataFrame:
    """
    field_to_src: {"part_no":"item_name", "item_name":"part_no", ...}
    Returns a new DF with columns FINAL_FIELDS, values taken from the chosen source columns.
    """
    out = pd.DataFrame()
    for field in FINAL_FIELDS:
        src = field_to_src.get(field, field)
        out[field] = table_df[src] if (src in table_df.columns) else None
    return out


def recollect_after_role_resolution(
    table_df: pd.DataFrame,
    master_items: List[Dict[str, Any]],
) -> Tuple[pd.DataFrame, Optional[Dict[str, str]]]:
    """
    1) resolve which current column corresponds to which final FIELD
    2) rebuild DF in correct order
    3) run post_clean_table again (so part_no cleanup & price cleanup sees correct fields)
    """
    role_map = resolve_column_roles_global(table_df, master_items)
    new_df = remap_table_df_by_column_roles(table_df, role_map)
    new_df = post_clean_table(new_df)   # important: re-clean after roles swap
    return new_df, role_map
def salvage_dropped_candidates(
    dropped_candidates: List[Dict[str, Any]],
    master_items: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    if not dropped_candidates or not master_items:
        return []

    # Build master lookup by normalized part
    master_by_part = {}
    for m in master_items:
        pn = _pick_master_part_norm(m)
        if pn:
            master_by_part[pn] = m

    possible = []

    for dc in dropped_candidates:
        texts = [str(t).strip() for t in (dc.get("texts") or []) if str(t).strip()]
        if not texts:
            continue

        joined = " ".join(texts)

        # Find any token that matches a master part
        found_master = None
        found_part_raw = None
        for t in texts:
            pnorm = _norm_part_alnum(t)
            if pnorm in master_by_part:
                found_master = master_by_part[pnorm]
                found_part_raw = t
                break

        # Find price-ish number in the row text
        nums = re.findall(r"\d+(?:\.\d+)?", joined.replace(",", ""))
        price_guess = float(nums[-1]) if nums else None

        if found_master:
            # Create a low-confidence suggested row from master
            possible.append({
                "source": "dropped_candidate_salvage",
                "part_no": str(found_master.get("part_no", "") or "").strip(),
                "item_name": str(found_master.get("item_name", "") or "").strip(),
                "brand": str(found_master.get("brand", "") or "").strip(),
                "quantity": None,
                "unit_price": _safe_float(found_master.get("unit_price")) or _safe_float(found_master.get("typical_price")) or price_guess,
                "reason": "row_dropped_but_contains_master_part",
                "raw_texts": texts,
                "bbox": {k: dc.get(k) for k in ("x1","y1","x2","y2")},
            })

    return possible

def _strip_currency(s: str) -> str:
    return re.sub(r"[￥$€£]", "", str(s)).strip()

def _fix_common_part_confusions(s: str) -> str:
    s = str(s).strip().upper()
    s = _strip_currency(s).upper()

    # NEV -> NCV when followed by digits
    if re.match(r"^\s*NEV[\s\-]*\d+", s):
        s = re.sub(r"^\s*NEV", "NCV", s, count=1)

    return s

def _norm_part_alnum(s: str) -> str:
    s = _fix_common_part_confusions(s)
    return "".join(ch for ch in s if ch.isalnum())

def _pick_master_part_norm(m: Dict[str, Any]) -> str:
    db_norm = str(m.get("norm_part_no", "") or "").strip()
    if db_norm:
        return _norm_part_alnum(db_norm)
    return _norm_part_alnum(m.get("part_no", ""))

def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        s = str(v).strip()
        if not s or s.lower() == "nan":
            return None
        m = re.search(r"[-+]?\d+(?:\.\d+)?", s.replace(",", ""))
        if not m:
            return None
        return float(m.group(0))
    except Exception:
        return None

def _find_master_by_part_variants(
    part_in: str,
    master_by_part_norm: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Try common OCR part_no mistakes and see if any exact-match a master part.
    This fixes cases like:
      17 PK 1660  -> 7PK 1660 (leading '1' noise)
      B32-13008   -> KB32-13008K (missing leading K + trailing K)
    """
    base = _norm_part_alnum(part_in)
    if not base:
        return None

    candidates = set()
    candidates.add(base)

    # 1) Remove a single leading '1' (common OCR extra digit)
    if base.startswith("1") and len(base) >= 2:
        candidates.add(base[1:])

    # 2) Add missing leading 'K'
    if not base.startswith("K"):
        candidates.add("K" + base)

    # 3) Add missing trailing 'K'
    if not base.endswith("K"):
        candidates.add(base + "K")

    # 4) Combine K prefix + K suffix
    if not base.startswith("K") and not base.endswith("K"):
        candidates.add("K" + base + "K")

    # 5) Combine leading '1' removal with K fixes
    if base.startswith("1") and len(base) >= 2:
        b2 = base[1:]
        candidates.add(b2)
        if not b2.startswith("K"):
            candidates.add("K" + b2)
        if not b2.endswith("K"):
            candidates.add(b2 + "K")
        if not b2.startswith("K") and not b2.endswith("K"):
            candidates.add("K" + b2 + "K")

    # Return first exact master hit (deterministic: check shorter first)
    for cand in sorted(candidates, key=len):
        if cand in master_by_part_norm:
            return master_by_part_norm[cand]

    return None

def match_and_clean_items(
    extracted_items: List[Dict[str, Any]],
    master_items: List[Dict[str, Any]],
    price_tolerance: float = 0.3,
    part_score_cutoff: int = 70,
    name_score_cutoff: int = 60,
    part_change_conf: float = 0.95,
    price_autofix_conf: float = 0.80
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:

    if not master_items:
        return extracted_items, [], []

    # Build master indexes
    master_by_part_norm: Dict[str, Dict[str, Any]] = {}
    master_rows: List[Dict[str, Any]] = []
    master_choices_name_brand: List[str] = []
    master_part_norms: List[str] = []

    for m in master_items:
        if not isinstance(m, dict):
            continue

        pn = _pick_master_part_norm(m)
        if pn:
            master_by_part_norm.setdefault(pn, m)
            master_part_norms.append(pn)

        master_name = str(m.get("item_name", "") or "").strip()
        master_brand = str(m.get("brand", "") or "").strip()

        master_rows.append({"original": m})
        master_choices_name_brand.append(f"{master_name} {master_brand}".strip())

    cleaned_items: List[Dict[str, Any]] = []
    corrections: List[Dict[str, Any]] = []

    for idx, item in enumerate(extracted_items):
        cleaned = item.copy()
        item_corrections: List[Dict[str, Any]] = []

        part_in = str(item.get("part_no", "") or "").strip()
        part_norm = _norm_part_alnum(part_in)

        q_name = str(item.get("item_name", "") or "").strip()
        q_brand = str(item.get("brand", "") or "").strip()

        master = None
        match_conf = 0.0
        match_reason = None

        # (0) NEW: exact match by part variants (fix obvious OCR issues)
        if part_in:
            m0 = _find_master_by_part_variants(part_in, master_by_part_norm)
            if m0 is not None:
                master = m0
                match_conf = 1.0
                match_reason = "part_variant_exact"

        # (A) Exact match by normalized part
        if master is None and part_norm and part_norm in master_by_part_norm:
            master = master_by_part_norm[part_norm]
            match_conf = 1.0
            match_reason = "exact_part_norm"

        # (B) Fuzzy part match
        elif master is None and HAS_FUZZY and part_norm and master_part_norms:
            res = process.extractOne(
                part_norm,
                master_part_norms,
                scorer=fuzz.ratio,
                score_cutoff=part_score_cutoff
            )
            if res:
                best_part_norm, score, _ = res
                master = master_by_part_norm.get(best_part_norm)
                match_conf = score / 100.0
                match_reason = "fuzzy_part_norm"

        # (C) Fuzzy name+brand fallback
        elif master is None and HAS_FUZZY and master_choices_name_brand and (q_name or q_brand):
            query = f"{part_norm} {q_name} {q_brand}".strip() if part_norm else f"{q_name} {q_brand}".strip()
            res = process.extractOne(
                query,
                master_choices_name_brand,
                scorer=fuzz.token_set_ratio,
                score_cutoff=name_score_cutoff
            )
            if res:
                _best_text, score, idx_match = res
                master = master_rows[idx_match]["original"]
                match_conf = score / 100.0
                match_reason = "fuzzy_name_brand"

        # Apply if matched
        if master is not None:
            master_name = str(master.get("item_name", "") or "").strip()
            master_brand = str(master.get("brand", "") or "").strip()
            master_part_out = str(master.get("part_no", "") or "").strip().upper()

            # SILENT overwrite item_name + brand (no flags)
            if master_name and master_name.strip():
                cleaned["item_name"] = master_name
            if master_brand and master_brand.strip():
                cleaned["brand"] = master_brand

            # Force NEV->NCV visible fix (flag part_no)
            original_part_up = str(item.get("part_no", "") or "").strip().upper()
            fixed_part_up = _fix_common_part_confusions(original_part_up)

            # If the displayed string changed OR we variant-matched, rewrite to master part_no & flag
            if master_part_out:
                if fixed_part_up != original_part_up or match_reason == "part_variant_exact":
                    if master_part_out != original_part_up:
                        cleaned["part_no"] = master_part_out
                        item_corrections.append({
                            "field": "part_no",
                            "original": item.get("part_no"),
                            "corrected": master_part_out,
                            "confidence": match_conf,
                            "reason": "part_cleaned_to_master",
                        })

                # Existing strict rewrite logic (keep it)
                master_part_norm = _pick_master_part_norm(master)
                if match_reason == "exact_part_norm" and _norm_part_alnum(master_part_out) != part_norm:
                    cleaned["part_no"] = master_part_out
                    item_corrections.append({
                        "field": "part_no",
                        "original": item.get("part_no"),
                        "corrected": master_part_out,
                        "confidence": 1.0,
                        "reason": "exact_part_norm_format_fix",
                    })
                elif match_reason == "fuzzy_part_norm" and match_conf >= part_change_conf:
                    if master_part_norm and master_part_norm != part_norm:
                        cleaned["part_no"] = master_part_out
                        item_corrections.append({
                            "field": "part_no",
                            "original": item.get("part_no"),
                            "corrected": master_part_out,
                            "confidence": match_conf,
                            "reason": "fuzzy_part_high_conf",
                        })

            # Price handling (unchanged)
            master_price = _safe_float(master.get("unit_price", None))
            if master_price is None:
                master_price = _safe_float(master.get("typical_price", None))

            extracted_price = _safe_float(item.get("unit_price", None))

            if master_price is not None and extracted_price is not None and master_price > 0:
                strong_id = (
                    match_reason in ("exact_part_norm", "part_variant_exact")
                    or (match_reason == "fuzzy_part_norm" and match_conf >= price_autofix_conf)
                )

                if strong_id:
                    if extracted_price <= 0 or extracted_price < 0.1 * master_price:
                        cleaned["unit_price"] = master_price
                        item_corrections.append({
                            "field": "unit_price",
                            "original": item.get("unit_price"),
                            "corrected": master_price,
                            "confidence": match_conf,
                            "reason": "price_zero_or_low_autofix",
                        })
                    else:
                        ratio = extracted_price / master_price
                        if ratio < 1 - price_tolerance or ratio > 1 + price_tolerance:
                            cleaned["price_anomaly"] = True
                else:
                    ratio = extracted_price / master_price
                    if ratio < 1 - price_tolerance or ratio > 1 + price_tolerance:
                        cleaned["price_anomaly"] = True

        # Only return corrections for part_no + unit_price (your UI rule)
        item_corrections = [c for c in item_corrections if c.get("field") in ("part_no", "unit_price")]

        if item_corrections:
            corrections.append({"item_index": idx, "corrections": item_corrections})

        cleaned_items.append(cleaned)

    return cleaned_items, corrections, []

# ============================================================
# 9) FULL PIPELINE (returns table records + optional corrections)
# ============================================================
def extract_table_hybrid(
    words: List[Word],
    conf_min: float = 0.0,
    y_stretch: float = 5.0,
    hdb_min_cluster_size: int = 4,
    hdb_min_samples: int = 2,
    hdb_epsilon: float = 1.0,
    row_conf_min: float = 0.0,
    punct_conf_max: float = 0.55,
    deskew: bool = True,
    rotate_90: bool = True,
    use_conf_weights: bool = True,
    max_deskew_deg: float = 8.0,
    master_items: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    df = words_to_dataframe(words)
    if conf_min > 0.0:
        df = df[df["conf"] >= conf_min].copy()
    df = drop_lowconf_punct(df, punct_conf_max=punct_conf_max)

    if df.empty:
        return {
            "table_df": pd.DataFrame(columns=FINAL_FIELDS),
            "records": [],
            "debug": {"rotated_90": False, "deskew_angle_rad": 0.0},
            "dropped_candidates": [],
            "possible_rows": [],
            "corrections": [],
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
    df = split_rows_by_internal_cy_gaps(df, gap_factor=0.85, min_tokens_side=3)
    # Before cleanup, remember which rows had row_id = -1 (already dropped)
    dropped_before_cleanup = df[df["row_id"] == -1].copy() if not df.empty else pd.DataFrame()

    df_clean = cleanup_row_ids(df, min_tokens_per_row=4, glue_max_gap_factor=1.15)

    # Collect dropped candidates: rows that were removed during cleanup
    if not df.empty and not df_clean.empty:
        kept_indices = df_clean.index
        dropped_mask = ~df.index.isin(kept_indices)
        dropped_df = df.loc[dropped_mask].copy()
    else:
        dropped_df = pd.DataFrame()

    # Combine with rows dropped earlier (row_id = -1)
    if not dropped_before_cleanup.empty:
        dropped_df = pd.concat([dropped_df, dropped_before_cleanup], ignore_index=True)

    # Convert dropped rows to a list of dicts for output
    dropped_candidates: List[Dict[str, Any]] = []
    if not dropped_df.empty:
        if "row_id" in dropped_df.columns:
            for rid, group in dropped_df.groupby("row_id"):
                texts = group["text"].tolist()
                if sum(1 for t in texts if re.search(r"\w", str(t))) >= 2:
                    dropped_candidates.append({
                        "row_id": int(rid) if rid is not None and rid >= 0 else None,
                        "texts": texts,
                        "x1": float(group["x1"].min()),
                        "y1": float(group["y1"].min()),
                        "x2": float(group["x2"].max()),
                        "y2": float(group["y2"].max()),
                        "reason": "removed_during_cleanup",
                    })
        else:
            for _, row in dropped_df.iterrows():
                if re.search(r"\w", str(row.get("text", ""))):
                    dropped_candidates.append({
                        "text": row["text"],
                        "x1": row["x1"],
                        "y1": row["y1"],
                        "x2": row["x2"],
                        "y2": row["y2"],
                        "reason": "dropped_word",
                    })

    # NEW: salvage dropped candidates into "possible rows" using master list
    possible_rows: List[Dict[str, Any]] = []
    if master_items:
        try:
            possible_rows = salvage_dropped_candidates(dropped_candidates, master_items)
        except Exception:
            possible_rows = []

    if df_clean.empty:
        return {
            "table_df": pd.DataFrame(columns=FINAL_FIELDS),
            "records": [],
            "debug": {"rotated_90": rotated_90, "deskew_angle_rad": angle},
            "dropped_candidates": dropped_candidates,
            "possible_rows": possible_rows,
            "corrections": [],
        }

    df_clean, col_remap = discover_cols_gmm(df_clean, n_cols=5, use_conf_weights=use_conf_weights)
    table_df, _ = build_table(df_clean)
    table_df = fix_quantity_brand_swap(table_df)
    table_df = post_clean_table(table_df)

    # ------------------------------------------------------------
    # ✅ NEW: GLOBAL column-role resolution (NO per-row swapping)
    # ------------------------------------------------------------
    records: List[Dict[str, Any]] = table_df.to_dict(orient="records")
    col_role_map: Optional[Dict[str, str]] = None

    if master_items and not table_df.empty:
        try:
            # field -> source_column mapping, e.g. {"part_no":"item_name", ...}
            col_role_map = resolve_column_roles_global(table_df, master_items)
            records = remap_records_by_column_roles(records, col_role_map)
        except Exception:
            col_role_map = None

    # Apply master-based cleaning if master_items provided
    corrections: List[Dict[str, Any]] = []
    if master_items:
        records, corrections, _ = match_and_clean_items(records, master_items)

        # Ensure only part_no + unit_price corrections leave backend
        filtered = []
        for corr in corrections:
            corr_list = corr.get("corrections") or []
            keep = [c for c in corr_list if c.get("field") in ("part_no", "unit_price")]
            if keep:
                filtered.append({"item_index": corr.get("item_index"), "corrections": keep})
        corrections = filtered

    debug_obj = {
        "rotated_90": rotated_90,
        "deskew_angle_rad": angle,
        "col_cluster_to_col_id": col_remap,
    }
    if col_role_map:
        debug_obj["col_role_map"] = col_role_map  # helpful for debugging in terminal

    return {
        "table_df": table_df,
        "records": records,
        "debug": debug_obj,
        "corrections": corrections,
        "dropped_candidates": dropped_candidates,
        "possible_rows": possible_rows,
    }
# ============================================================
# 10) PHP OUTPUT: make items numeric + NaN->None
# ============================================================
_NUM_RE_ALL = re.compile(r"[-+]?\d+(?:\.\d+)?")


def _to_int_or_none(v: Any) -> Optional[int]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    m = _NUM_RE_ALL.search(s.replace(",", ""))
    if not m:
        return None
    try:
        return int(float(m.group(0)))
    except Exception:
        return None


def _to_float_or_none(v: Any) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    m = _NUM_RE_ALL.search(s.replace(",", ""))
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _clean_str_or_none(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    return s


def _nan_to_none(x: Any) -> Any:
    if isinstance(x, float) and math.isnan(x):
        return None
    if x is pd.NA:
        return None
    return x


def _numbers_in_text(v: Any) -> List[float]:
    if v is None:
        return []
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return []
    nums = _NUM_RE_ALL.findall(s.replace(",", ""))
    out: List[float] = []
    for n in nums:
        try:
            out.append(float(n))
        except Exception:
            pass
    return out

def _extract_qty_and_price(qty_val: Any, price_val: Any) -> Tuple[Optional[int], Optional[float]]:
    """
    IMPORTANT (your requirement):
    - If quantity is NULL/empty, we keep it NULL
      UNLESS unit_price contains 2+ numbers (meaning quantity got merged into unit_price).
    Examples:
      qty=None, unit_price="22 800"  -> qty=22, price=800
      qty=None, unit_price="800"     -> qty=None, price=800   (keep qty empty)
      qty=4,    unit_price="2000"    -> qty=4, price=2000
    """
    qty = _to_int_or_none(qty_val)  # your existing function
    nums = _numbers_in_text(price_val)

    if not nums:
        return qty, None

    if len(nums) == 1:
        return qty, float(nums[0])

    # 2+ numbers: treat last as price; if qty missing, treat first as qty
    price = float(nums[-1])
    if qty is None:
        return int(nums[0]), price
    return qty, price

def make_items(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for r in records:
        item_name = _clean_str_or_none(r.get("item_name"))
        part_no   = _clean_str_or_none(r.get("part_no"))
        brand     = _clean_str_or_none(r.get("brand"))

        # ✅ quantity preserved / recovered only when clearly merged into unit_price
        quantity, unit_price = _extract_qty_and_price(r.get("quantity"), r.get("unit_price"))

        total = None
        if quantity is not None and unit_price is not None:
            total = float(quantity) * float(unit_price)

        items.append({
            "item_name": item_name,
            "part_no": part_no,
            "brand": brand,
            "quantity": quantity,
            "unit_price": unit_price,
            "total": total,
        })

    # remove fully empty rows
    items = [
        it for it in items
        if any(it[k] is not None for k in ["item_name", "part_no", "brand", "quantity", "unit_price", "total"])
    ]

    # ensure no NaN survives
    cleaned = []
    for it in items:
        cleaned.append({k: _nan_to_none(v) for k, v in it.items()})
    return cleaned
# ============================================================
# 11) MAIN: argv -> JSON stdout ONLY
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
        result = extract_table_hybrid(words, master_items=master_items)
        records = result.get("records", []) or []
        items = make_items(records)

        payload = {
            "success": True,
            "items": _json_safe(items),
            "debug": _json_safe(result.get("debug", {})),
        }
        if "corrections" in result:
            payload["corrections"] = _json_safe(result["corrections"])
        if "dropped_candidates" in result:
            payload["dropped_candidates"] = _json_safe(result["dropped_candidates"])

        print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    except Exception as e:
        err_payload = {"success": False, "error": str(e), "items": []}
        print(json.dumps(err_payload, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()