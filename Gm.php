<?php
header('Content-Type: application/json');

ini_set('log_errors', 1);
ini_set('error_log', '/tmp/gm_php_error.log');

$PYTHON_BIN = "/home/daniel/Documents/PROJECT/GM/venv/bin/python";
$PY_SCRIPT  = "/home/daniel/Documents/PROJECT/GM/expt.py";
$TMP_DIR    = "/tmp/gm_uploads/";

@mkdir($TMP_DIR, 0777, true);

/* =========================
   Helpers
========================= */

function respond($arr) {
    if (ob_get_length()) ob_clean();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail($msg, $extra = []) {
    respond(array_merge(["success" => false, "error" => $msg], $extra));
}

function db_conn() {
    $db = new mysqli("localhost", "root", "D1a2n3i4e5l6.", "GM_AUTO");
    if ($db->connect_error) fail("DB error: " . $db->connect_error);
    $db->set_charset("utf8mb4");
    return $db;
}

function is_nullish($v) {
    if ($v === null) return true;
    $s = trim((string)$v);
    if ($s === "") return true;
    if (strtolower($s) === "nan") return true;
    return false;
}

function norm_part_no($s) {
    if ($s === null) return null;
    $s = trim((string)$s);
    if ($s === "" || strtolower($s) === "nan") return null;
    $s = strtoupper($s);
    $s = preg_replace('/\s+/', '', $s);
    $s = str_replace(['—','–'], '-', $s);
    return $s;
}

function norm_brand($s) {
    if ($s === null) return null;
    $s = trim((string)$s);
    if ($s === "" || strtolower($s) === "nan") return null;
    $s = preg_replace('/\s+/', ' ', $s);
    return mb_strtolower($s);
}

function decode_python_json($output) {
    $output = trim((string)$output);
    if ($output === "") return [null, "empty_output"];

    $json = json_decode($output, true);
    if ($json !== null) return [$json, null];

    $start = strpos($output, '{"success"');
    if ($start === false) $start = strpos($output, '{ "success"');
    if ($start === false) return [null, "no_json_marker_found"];

    $tail = substr($output, $start);
    $end  = strrpos($tail, "}");
    if ($end === false) return [null, "no_json_end_brace_found"];

    $candidate = substr($tail, 0, $end + 1);
    $json2 = json_decode($candidate, true);
    if ($json2 === null) return [null, "invalid_json_candidate"];

    return [$json2, null];
}

/* =========================
   STATS ACTIONS
========================= */
function handle_stats_top8_by_day() {
    $db = db_conn();

    $day = $_GET["day"] ?? null;  // expected YYYY-MM-DD
    if (!$day || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        fail("Invalid or missing 'day' (expected YYYY-MM-DD)");
    }

    // Top 8 by quantity for that day
    $sql = "
        SELECT
            CONCAT(item_name, ' (', part_no, ')') AS label,
            SUM(quantity) AS qty
        FROM sales
        WHERE DATE(created_at) = ?
        GROUP BY item_id, item_name, part_no
        ORDER BY qty DESC
        LIMIT 8
    ";

    $stmt = $db->prepare($sql);
    if (!$stmt) fail("Prepare failed: " . $db->error);

    $stmt->bind_param("s", $day);
    $stmt->execute();
    $res = $stmt->get_result();

    $labels = [];
    $qty = [];
    while ($row = $res->fetch_assoc()) {
        $labels[] = $row["label"];
        $qty[] = (int)$row["qty"];
    }

    $stmt->close();
    $db->close();

    respond([
        "success" => true,
        "action"  => "stats_top8_by_day",
        "day"     => $day,
        "labels"  => $labels,
        "qty"     => $qty
    ]);
}

function handle_stats() {
    $db = db_conn();
    $action = $_GET["action"] ?? "";

    if ($action === "stats_top8_by_day") {
        handle_stats_top8_by_day();
        // after that, exit
    }

    // Dynamic threshold tiers using "days with sales in last 30 days"
    // - fast movers (>= 6 days) => threshold 2
    // - normal (2..5 days)      => threshold 1
    // - slow (0..1 days)        => threshold 0  (qty=1 is OK)
    if ($action === "stats_low_stock") {
        $sql = "
            SELECT
              il.item_name,
              il.part_no,
              il.brand,
              s.quantity,
              s.updated_at,
              COALESCE(v.days_sold_30d, 0) AS days_sold_30d,
              CASE
                WHEN COALESCE(v.days_sold_30d,0) >= 6 THEN 2
                WHEN COALESCE(v.days_sold_30d,0) >= 2 THEN 1
                ELSE 0
              END AS dyn_threshold
            FROM stock s
            JOIN item_list il ON il.id = s.item_id
            LEFT JOIN (
              SELECT item_id, COUNT(DISTINCT DATE(created_at)) AS days_sold_30d
              FROM sales
              WHERE created_at >= (CURDATE() - INTERVAL 30 DAY)
              GROUP BY item_id
            ) v ON v.item_id = s.item_id
            WHERE s.quantity <= (
              CASE
                WHEN COALESCE(v.days_sold_30d,0) >= 6 THEN 2
                WHEN COALESCE(v.days_sold_30d,0) >= 2 THEN 1
                ELSE 0
              END
            )
            ORDER BY s.quantity ASC, il.item_name ASC
        ";

        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $items = [];
        while ($row = $res->fetch_assoc()) $items[] = $row;

        respond(["success" => true, "action" => $action, "items" => $items]);
    }

    // Weekly growing chart (Mon -> Sat) current week: revenue per day
    if ($action === "stats_weekly_current") {
        $sql = "
            SELECT
              DATE(created_at) AS d,
              SUM(total) AS revenue
            FROM sales
            WHERE created_at >= (CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY)
              AND created_at <  (CURDATE() + INTERVAL 1 DAY)
            GROUP BY d
            ORDER BY d
        ";

        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $labels = [];
        $revenue = [];
        while ($r = $res->fetch_assoc()) {
            $labels[] = $r["d"];
            $revenue[] = (float)$r["revenue"];
        }

        respond([
            "success" => true,
            "action" => $action,
            "labels" => $labels,
            "revenue" => $revenue
        ]);
    }

    // Top 8 most sold goods yesterday by quantity
    if ($action === "stats_top8_by_date") {
        $date = $_GET["date"] ?? null;
        if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            fail("Invalid date. Expected YYYY-MM-DD");
        }

        $sql = "
            SELECT
              il.item_name,
              il.part_no,
              SUM(s.quantity) AS qty_sold
            FROM sales s
            JOIN item_list il ON il.id = s.item_id
            WHERE DATE(s.created_at) = ?
            GROUP BY s.item_id
            ORDER BY qty_sold DESC
            LIMIT 8
        ";

        $stmt = $db->prepare($sql);
        if (!$stmt) fail("Prepare failed: " . $db->error);
        $stmt->bind_param("s", $date);
        $stmt->execute();
        $res = $stmt->get_result();

        $labels = [];
        $qty = [];
        while ($r = $res->fetch_assoc()) {
            $labels[] = $r["item_name"] . " (" . $r["part_no"] . ")";
            $qty[] = (int)$r["qty_sold"];
        }

        respond(["success" => true, "action" => $action, "labels" => $labels, "qty" => $qty]);
    }

    if ($action === "stats_monthly_lastmonth_daily") {
        $sql = "
            SELECT
              DATE(created_at) AS d,
              SUM(total) AS revenue
            FROM sales
            WHERE created_at >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
              AND created_at <  DATE_FORMAT(CURDATE(), '%Y-%m-01')
            GROUP BY d
            ORDER BY d
        ";
        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $labels = [];
        $revenue = [];
        while ($r = $res->fetch_assoc()) {
            $labels[] = $r["d"];
            $revenue[] = (float)$r["revenue"];
        }

        respond(["success" => true, "action" => $action, "labels" => $labels, "revenue" => $revenue]);
    }

    // Monthly chart: revenue per ISO week (Monday-based) in current month
    if ($action === "stats_monthly_weeks") {
        $sql = "
            SELECT
              YEARWEEK(created_at, 1) AS yw,
              MIN(DATE(created_at)) AS week_start,
              SUM(total) AS revenue
            FROM sales
            WHERE YEAR(created_at) = YEAR(CURDATE())
              AND MONTH(created_at) = MONTH(CURDATE())
            GROUP BY yw
            ORDER BY yw
        ";

        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $labels = [];
        $revenue = [];
        while ($r = $res->fetch_assoc()) {
            $labels[] = "Week of " . $r["week_start"];
            $revenue[] = (float)$r["revenue"];
        }

        respond([
            "success" => true,
            "action" => $action,
            "labels" => $labels,
            "revenue" => $revenue
        ]);
    }

    // Yearly chart: revenue per month for current year
    if ($action === "stats_yearly_months") {
        $sql = "
            SELECT
              MONTH(created_at) AS m,
              SUM(total) AS revenue
            FROM sales
            WHERE YEAR(created_at) = YEAR(CURDATE())
            GROUP BY m
            ORDER BY m
        ";
        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $monthNames = [1=>"Jan",2=>"Feb",3=>"Mar",4=>"Apr",5=>"May",6=>"Jun",7=>"Jul",8=>"Aug",9=>"Sep",10=>"Oct",11=>"Nov",12=>"Dec"];

        $labels = [];
        $revenue = [];
        while ($r = $res->fetch_assoc()) {
            $m = (int)$r["m"];
            $labels[] = $monthNames[$m] ?? ("M" . $m);
            $revenue[] = (float)$r["revenue"];
        }

        respond([
            "success" => true,
            "action" => $action,
            "labels" => $labels,
            "revenue" => $revenue
        ]);
    }

    // Flags: show yearly chart only first 7 days of each quarter (Jan/Apr/Jul/Oct)
    if ($action === "stats_flags") {
        $sql = "
          SELECT
            MONTH(CURDATE()) AS m,
            DAY(CURDATE()) AS d,
            DAY(LAST_DAY(CURDATE())) AS last_day
        ";
        $res = $db->query($sql);
        if (!$res) fail("Stats query failed: " . $db->error);

        $row = $res->fetch_assoc();
        $m = (int)$row["m"];
        $d = (int)$row["d"];
        $lastDay = (int)$row["last_day"];

        // show_yearly: first 7 days of each quarter (Jan/Apr/Jul/Oct)
        $showYearly = in_array($m, [1,4,7,10], true) && ($d >= 1 && $d <= 7);

        // show_monthly: 7 days before month ends OR first 7 days of month
        $showMonthly = ($d <= 7) || ($d >= ($lastDay - 6));

        respond([
            "success" => true,
            "action" => $action,
            "show_yearly" => $showYearly,
            "show_monthly" => $showMonthly
        ]);
    }

    fail("Unknown stats action");
}

/* =========================
   ACTION 1: OCR
========================= */
function handle_ocr() {
    global $PYTHON_BIN, $PY_SCRIPT, $TMP_DIR;

    if (!isset($_FILES["images"])) {
        $cl = isset($_SERVER["CONTENT_LENGTH"]) ? (int)$_SERVER["CONTENT_LENGTH"] : 0;
        if ($cl > 0) {
            fail("Upload too large for server limits", [
                "action" => "ocr",
                "warnings" => [
                    "Request size ($cl bytes) exceeded server post_max_size. Increase post_max_size/upload_max_filesize or compress images client-side."
                ],
                "items" => []
            ]);
        }
        fail("No images uploaded", ["action" => "ocr", "items" => [], "warnings" => []]);
    }

    // Fetch master items for Python matcher
    $masterItems = [];
    $masterJsonPath = null;

    try {
        $db = db_conn();
        $sql = "
            SELECT
                part_no,
                item_name,
                brand,
                unit_price,
                norm_part_no
            FROM item_list
            WHERE part_no IS NOT NULL AND TRIM(part_no) != ''
        ";
        $res = $db->query($sql);
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $masterItems[] = [
                    "part_no"      => $row["part_no"],
                    "item_name"    => $row["item_name"],
                    "brand"        => $row["brand"],
                    "unit_price"   => $row["unit_price"],
                    "norm_part_no" => $row["norm_part_no"],
                ];
            }
        }
        $db->close();
    } catch (Throwable $e) {
        error_log("Failed to fetch master items: " . $e->getMessage());
        $masterItems = [];
    }

    if (!empty($masterItems)) {
        $masterJsonPath = $TMP_DIR . uniqid("master_") . ".json";
        @file_put_contents($masterJsonPath, json_encode($masterItems, JSON_UNESCAPED_UNICODE));
    }

    $allItems = [];
    $allCorrections = [];
    $allDropped = [];
    $itemOffset = 0;
    $pythonWarnings = [];

    foreach ($_FILES["images"]["tmp_name"] as $i => $tmp) {
        $err = $_FILES["images"]["error"][$i] ?? UPLOAD_ERR_NO_FILE;

        if ($err !== UPLOAD_ERR_OK) {
            $msg = "Upload error index $i (code=$err)";
            if ($err === UPLOAD_ERR_INI_SIZE)  $msg = "File too large (exceeds upload_max_filesize) at index $i";
            if ($err === UPLOAD_ERR_FORM_SIZE) $msg = "File too large (exceeds MAX_FILE_SIZE) at index $i";
            if ($err === UPLOAD_ERR_PARTIAL)   $msg = "Upload partially received at index $i";
            if ($err === UPLOAD_ERR_NO_FILE)   $msg = "No file uploaded at index $i";
            $pythonWarnings[] = $msg;
            continue;
        }

        $mime = @mime_content_type($tmp);
        $allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!$mime || !in_array($mime, $allowed, true)) {
            $pythonWarnings[] = "Unsupported image type (" . ($mime ?: "unknown") . ") at index $i";
            continue;
        }

        $ext = "jpg";
        if ($mime === "image/png")  $ext = "png";
        if ($mime === "image/webp") $ext = "webp";

        $imagePath = $TMP_DIR . uniqid("img_") . "." . $ext;

        if (!move_uploaded_file($tmp, $imagePath)) {
            $pythonWarnings[] = "Failed to move uploaded file for index $i";
            continue;
        }

        $cmd = escapeshellarg($PYTHON_BIN) . " " . escapeshellarg($PY_SCRIPT) . " " . escapeshellarg($imagePath);
        if ($masterJsonPath) $cmd .= " " . escapeshellarg($masterJsonPath);
        $cmd .= " 2>&1";

        $outputLines = [];
        $exitCode = 0;
        exec($cmd, $outputLines, $exitCode);
        $output = trim(implode("\n", $outputLines));

        @file_put_contents(
            "/tmp/python_debug.txt",
            "\n\n==== IMG INDEX $i | exit=$exitCode | " . date("c") . " ====\n" . $output . "\n",
            FILE_APPEND
        );

        if ($output === "") {
            $pythonWarnings[] = "Python returned empty output (image index $i). Exit code=$exitCode";
            @unlink($imagePath);
            continue;
        }

        list($json, $jerr) = decode_python_json($output);
        if ($json === null) {
            $pythonWarnings[] = "Python output not valid JSON (image index $i, $jerr): " . substr($output, 0, 500);
            @unlink($imagePath);
            continue;
        }

        if (isset($json["success"]) && $json["success"] === false) {
            $pythonWarnings[] = "Python error (image index $i): " . ($json["error"] ?? "unknown error");
            @unlink($imagePath);
            continue;
        }

        $items = $json["items"] ?? [];
        $corrections = $json["corrections"] ?? [];
        $dropped = $json["dropped_candidates"] ?? [];

        foreach ($corrections as &$corr) {
            if (isset($corr["item_index"])) $corr["item_index"] = (int)$corr["item_index"] + $itemOffset;
        }
        unset($corr);

        $allItems = array_merge($allItems, is_array($items) ? $items : []);
        $allCorrections = array_merge($allCorrections, is_array($corrections) ? $corrections : []);
        $allDropped = array_merge($allDropped, is_array($dropped) ? $dropped : []);

        $itemOffset += is_array($items) ? count($items) : 0;

        @unlink($imagePath);
    }

    if ($masterJsonPath && file_exists($masterJsonPath)) @unlink($masterJsonPath);

    if (!$allItems) {
        respond([
            "success" => false,
            "action"  => "ocr",
            "items"   => [],
            "warnings"=> $pythonWarnings
        ]);
    }

    // Flag part_no changes
    $partnoChanges = [];
    foreach ($allCorrections as $c) {
        if (!isset($c["corrections"]) || !is_array($c["corrections"])) continue;
        foreach ($c["corrections"] as $one) {
            if (($one["field"] ?? "") === "part_no") {
                $partnoChanges[] = [
                    "item_index" => $c["item_index"] ?? null,
                    "original"   => $one["original"] ?? null,
                    "corrected"  => $one["corrected"] ?? null,
                    "confidence" => $one["confidence"] ?? null,
                    "reason"     => $one["reason"] ?? null,
                ];
            }
        }
    }

    $draftId = bin2hex(random_bytes(16));

    respond([
        "success"  => true,
        "action"   => "ocr",
        "draft_id" => $draftId,
        "count"    => count($allItems),
        "items"    => $allItems,
        "corrections" => $allCorrections,
        "dropped_candidates" => $allDropped,
        "has_partno_changes" => !empty($partnoChanges),
        "partno_changes" => $partnoChanges,
        "warnings" => $pythonWarnings
    ]);
}

/* =========================
   ACTION 2: CONFIRM (also handles manual_save)
   - item_list master
   - stock upsert + sale subtract
   - sale price updates item_list if abs(diff) >= 1000
========================= */
function handle_confirm() {
    $db = db_conn();

    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);

    if (!$data || !isset($data["items"]) || !is_array($data["items"])) {
        fail("Invalid JSON payload");
    }

    $items = $data["items"];
    $draftId = $data["draft_id"] ?? null;
    $uploadType = $data["upload_type"] ?? null;

    if ($uploadType !== "sale" && $uploadType !== "stock") {
        fail("Invalid upload_type. Must be 'sale' or 'stock'.");
    }

    $table = ($uploadType === "sale") ? "sales" : "stock";

    // Find item_list row by part_no + brand (brand may be NULL/empty)
    $sqlFindItem = "
        SELECT id, item_name, unit_price, brand
        FROM item_list
        WHERE part_no = ?
          AND (
              (? IS NULL AND (brand IS NULL OR brand = ''))
              OR brand = ?
          )
        LIMIT 1
    ";
    $stmtFindItem = $db->prepare($sqlFindItem);
    if (!$stmtFindItem) fail("Prepare failed (find item): " . $db->error);

    // Insert item into item_list
    $sqlInsertItem = "
        INSERT INTO item_list (part_no, item_name, brand, unit_price, norm_part_no, norm_item_name, norm_brand)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ";
    $stmtInsertItem = $db->prepare($sqlInsertItem);
    if (!$stmtInsertItem) fail("Prepare failed (insert item): " . $db->error);

    // Update item_list price
    $sqlUpdateItemPrice = "UPDATE item_list SET unit_price = ? WHERE id = ?";
    $stmtUpdateItemPrice = $db->prepare($sqlUpdateItemPrice);
    if (!$stmtUpdateItemPrice) fail("Prepare failed (update item price): " . $db->error);

    // Find stock row by item_id
    $sqlFindStock = "SELECT id, quantity FROM stock WHERE item_id = ? LIMIT 1";
    $stmtFindStock = $db->prepare($sqlFindStock);
    if (!$stmtFindStock) fail("Prepare failed (find stock): " . $db->error);

    // Insert stock row
    $sqlInsertStock = "
        INSERT INTO stock (item_id, item_name, part_no, brand, quantity, unit_price, total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ";
    $stmtInsertStock = $db->prepare($sqlInsertStock);
    if (!$stmtInsertStock) fail("Prepare failed (insert stock): " . $db->error);

    // Add stock quantity
    $sqlAddStock = "UPDATE stock SET quantity = quantity + ? WHERE id = ?";
    $stmtAddStock = $db->prepare($sqlAddStock);
    if (!$stmtAddStock) fail("Prepare failed (add stock): " . $db->error);

    // Subtract stock quantity (no negative)
    $sqlSubStock = "UPDATE stock SET quantity = GREATEST(0, quantity - ?) WHERE id = ?";
    $stmtSubStock = $db->prepare($sqlSubStock);
    if (!$stmtSubStock) fail("Prepare failed (sub stock): " . $db->error);

    // Insert sale (needs sales.item_id column)
    $sqlInsertSale = "
        INSERT INTO sales (item_id, item_name, part_no, brand, quantity, unit_price, total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ";
    $stmtInsertSale = $db->prepare($sqlInsertSale);
    if (!$stmtInsertSale) fail("Prepare failed (insert sale): " . $db->error);

    $inserted = 0;
    $skipped = 0;

    $db->begin_transaction();

    try {
        foreach ($items as $i) {
            $item_name_in  = $i["item_name"] ?? null;
            $part_no_in    = $i["part_no"] ?? null;
            $brand_in      = $i["brand"] ?? null;
            $quantity_in   = $i["quantity"] ?? null;
            $unit_price_in = $i["unit_price"] ?? null;

            if (is_nullish($part_no_in) || is_nullish($quantity_in) || !is_numeric($quantity_in)) { $skipped++; continue; }
            $qty = (int)$quantity_in;
            if ($qty <= 0) { $skipped++; continue; }

            $part_no = norm_part_no($part_no_in);
            if (is_nullish($part_no)) { $skipped++; continue; }

            $brand_raw = is_nullish($brand_in) ? null : trim((string)$brand_in);
            $brand     = is_nullish($brand_raw) ? null : $brand_raw;
            $name      = is_nullish($item_name_in) ? "" : trim((string)$item_name_in);

            // 1) Ensure item exists in item_list
            $stmtFindItem->bind_param("sss", $part_no, $brand, $brand);
            $stmtFindItem->execute();
            $res = $stmtFindItem->get_result();
            $itemRow = $res ? $res->fetch_assoc() : null;

            if (!$itemRow) {
                // initial master price for new item
                $masterPriceNew = 0.0;
                if ($uploadType === "stock") {
                    if (is_nullish($unit_price_in) || !is_numeric($unit_price_in)) { $skipped++; continue; }
                    $masterPriceNew = (float)$unit_price_in;
                } else {
                    $masterPriceNew = (is_numeric($unit_price_in) ? (float)$unit_price_in : 0.0);
                }

                $np = norm_part_no($part_no);
                $nb = norm_brand($brand);
                $nn = is_nullish($name) ? null : mb_strtolower(preg_replace('/\s+/', ' ', $name));

                $stmtInsertItem->bind_param("sssdsss", $part_no, $name, $brand, $masterPriceNew, $np, $nn, $nb);
                $stmtInsertItem->execute(); // ignore duplicate errors; will refetch

                $stmtFindItem->bind_param("sss", $part_no, $brand, $brand);
                $stmtFindItem->execute();
                $res = $stmtFindItem->get_result();
                $itemRow = $res ? $res->fetch_assoc() : null;

                if (!$itemRow) { $skipped++; continue; }
            }

            $itemId = (int)$itemRow["id"];
            $masterPrice = is_numeric($itemRow["unit_price"]) ? (float)$itemRow["unit_price"] : 0.0;
            $masterName  = $itemRow["item_name"] ?? $name;

            // 2) Ensure stock row exists
            $stmtFindStock->bind_param("i", $itemId);
            $stmtFindStock->execute();
            $resS = $stmtFindStock->get_result();
            $stockRow = $resS ? $resS->fetch_assoc() : null;

            if (!$stockRow) {
                $initQty = 0;
                $initPrice = $masterPrice > 0 ? $masterPrice : (is_numeric($unit_price_in) ? (float)$unit_price_in : 0.0);
                $initTotal = $initQty * $initPrice;

                $stmtInsertStock->bind_param("isssidd", $itemId, $masterName, $part_no, $brand, $initQty, $initPrice, $initTotal);
                $stmtInsertStock->execute();

                $stmtFindStock->bind_param("i", $itemId);
                $stmtFindStock->execute();
                $resS = $stmtFindStock->get_result();
                $stockRow = $resS ? $resS->fetch_assoc() : null;
            }

            if (!$stockRow) { $skipped++; continue; }
            $stockId = (int)$stockRow["id"];

            // 3) Apply flow
            if ($uploadType === "stock") {
                if (is_nullish($unit_price_in) || !is_numeric($unit_price_in)) { $skipped++; continue; }
                $stockPrice = (float)$unit_price_in;

                // if master is missing, set it
                if ($masterPrice <= 0 && $stockPrice > 0) {
                    $stmtUpdateItemPrice->bind_param("di", $stockPrice, $itemId);
                    $stmtUpdateItemPrice->execute();
                    $masterPrice = $stockPrice;
                }

                $stmtAddStock->bind_param("ii", $qty, $stockId);
                if ($stmtAddStock->execute()) $inserted++;
                else $skipped++;

            } else { // sale
                $salePrice = (is_numeric($unit_price_in) ? (float)$unit_price_in : null);
                $unitPrice = ($salePrice !== null && $salePrice > 0) ? $salePrice : $masterPrice;

                // Update item_list price ONLY if abs(diff) >= 1000
                if ($salePrice !== null && $salePrice > 0) {
                    $diff = abs($salePrice - $masterPrice);
                    if ($masterPrice <= 0 || $diff >= 1000.0) {
                        $stmtUpdateItemPrice->bind_param("di", $salePrice, $itemId);
                        $stmtUpdateItemPrice->execute();
                        $unitPrice = $salePrice;
                    }
                }

                $total = $qty * $unitPrice;

                $stmtInsertSale->bind_param("isssidd", $itemId, $masterName, $part_no, $brand, $qty, $unitPrice, $total);
                if (!$stmtInsertSale->execute()) { $skipped++; continue; }

                $stmtSubStock->bind_param("ii", $qty, $stockId);
                if (!$stmtSubStock->execute()) throw new Exception("Failed to subtract stock for item_id=$itemId");

                $inserted++;
            }
        }

        $db->commit();

    } catch (Throwable $e) {
        $db->rollback();
        fail("Confirm failed: " . $e->getMessage());
    }

    respond([
        "success" => true,
        "action" => "confirm",
        "upload_type" => $uploadType,
        "table" => $table,
        "draft_id" => $draftId,
        "inserted" => $inserted,
        "skipped" => $skipped
    ]);
}

/* =========================
   DEBT MANAGEMENT
========================= */
function ensure_debt_tables() {
    $db = db_conn();
    $db->query("CREATE TABLE IF NOT EXISTS debtors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        repay_rate VARCHAR(20) DEFAULT 'monthly',
        due_date DATE DEFAULT NULL,
        blacklisted TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS debt_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        debtor_id INT NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        part_no VARCHAR(255) DEFAULT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        paid TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS debt_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        debtor_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->close();
}

function handle_debt() {
    ensure_debt_tables();

    $db = db_conn();
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);

    $action = $_GET["action"] ?? ($data["action"] ?? null);

    // =====================  LIST  =====================
    if ($action === "debt_list") {
    // Auto blacklist overdue debtors
    $db->query("
        UPDATE debtors d
        SET d.blacklisted = 1
        WHERE d.due_date IS NOT NULL
          AND d.due_date < CURDATE()
          AND d.blacklisted = 0
          AND (
            SELECT COALESCE(SUM(di.quantity * di.unit_price), 0)
            FROM debt_items di
            WHERE di.debtor_id = d.id AND di.paid = 0
          ) > 0
    ");

    // Show ALL debtors – even those fully paid
    $sql = "
        SELECT d.id, d.name, d.phone, d.repay_rate, d.due_date, d.blacklisted,
               COALESCE(SUM(di.quantity * di.unit_price * (1 - di.paid)), 0) AS total_owed,
               COALESCE(dp_sum.total_paid, 0) AS total_paid
        FROM debtors d
        LEFT JOIN debt_items di ON di.debtor_id = d.id
        LEFT JOIN (
            SELECT debtor_id, SUM(amount) AS total_paid
            FROM debt_payments
            GROUP BY debtor_id
        ) dp_sum ON dp_sum.debtor_id = d.id
        GROUP BY d.id
        ORDER BY d.name
    ";
    $res = $db->query($sql);
    if (!$res) fail("Debt list query failed: " . $db->error);

    $debtors = [];
    while ($row = $res->fetch_assoc()) {
        $did        = (int)$row["id"];
        $total_owed = (float)$row["total_owed"];
        $total_paid = (float)$row["total_paid"];
        $balance    = max(0, $total_owed - $total_paid);

        // Unpaid items
        $items_sql = "SELECT id, item_name, part_no, quantity, unit_price FROM debt_items WHERE debtor_id = $did AND paid = 0 ORDER BY id";
        $items_res = $db->query($items_sql);
        $items = [];
        while ($it = $items_res->fetch_assoc()) {
            $items[] = [
                "id"        => (int)$it["id"],
                "item_name" => $it["item_name"],
                "part_no"   => $it["part_no"],
                "qty"       => (int)$it["quantity"],
                "price"     => (float)$it["unit_price"]
            ];
        }

        // Payment ledger
        $pay_sql = "SELECT id, amount, payment_date FROM debt_payments WHERE debtor_id = $did ORDER BY payment_date DESC";
        $pay_res = $db->query($pay_sql);
        $payments = [];
        while ($p = $pay_res->fetch_assoc()) {
            $payments[] = [
                "id"     => (int)$p["id"],
                "amount" => (float)$p["amount"],
                "date"   => $p["payment_date"]
            ];
        }

        $debtors[] = [
            "id"          => $did,
            "name"        => $row["name"],
            "phone"       => $row["phone"],
            "repay_rate"  => $row["repay_rate"],
            "due_date"    => $row["due_date"],
            "blacklisted" => (bool)$row["blacklisted"],
            "balance"     => $balance,
            "total_owed"  => $total_owed,
            "total_paid"  => $total_paid,
            "items"       => $items,
            "payments"    => $payments
        ];
    }
    respond(["success" => true, "debtors" => $debtors]);
}
    // =====================  ADD DEBTOR  =====================
   // =====================  ADD DEBTOR (with items)  =====================
if ($action === "debt_add") {
    $name  = $_GET["name"] ?? ($data["name"] ?? "");
    $phone = $_GET["phone"] ?? ($data["phone"] ?? null);
    $rate  = $_GET["rate"] ?? ($data["rate"] ?? "monthly");
    $due   = $_GET["due"] ?? ($data["due"] ?? null);
    $items_json = $_GET["items"] ?? ($data["items"] ?? "[]");
    $items = json_decode($items_json, true);
    if (!is_array($items)) $items = [];

    if (empty($name)) fail("Name required");

    $db->begin_transaction();
    try {
        // Insert debtor
        $stmt = $db->prepare("INSERT INTO debtors (name, phone, repay_rate, due_date, blacklisted) VALUES (?,?,?,?,?)");
        $stmt->bind_param("ssssi", $name, $phone, $rate, $due, $blacklisted);
        $blacklisted = 0;
        $stmt->execute();
        $debtor_id = $db->insert_id;

        // Insert each item
        if (!empty($items)) {
            $stmt_item = $db->prepare("INSERT INTO debt_items (debtor_id, item_name, part_no, quantity, unit_price) VALUES (?,?,?,?,?)");
            foreach ($items as $item) {
                $it_name = $item["item_name"] ?? "";
                $part    = $item["part_no"] ?? null;
                $qty     = (int)($item["qty"] ?? 0);
                $price   = (float)($item["price"] ?? 0);
                if (empty($it_name) || $qty <= 0 || $price <= 0) continue;

                // Optional stock deduction (same logic as before)
                if ($part) {
                    $st = $db->prepare("SELECT id FROM item_list WHERE part_no = ? LIMIT 1");
                    $st->bind_param("s", $part);
                } else {
                    $st = $db->prepare("SELECT id FROM item_list WHERE item_name = ? LIMIT 1");
                    $st->bind_param("s", $it_name);
                }
                $st->execute();
                $res_st = $st->get_result();
                if ($row_st = $res_st->fetch_assoc()) {
                    $item_id = (int)$row_st["id"];
                    $deduct = $db->prepare("UPDATE stock SET quantity = GREATEST(0, quantity - ?) WHERE item_id = ?");
                    $deduct->bind_param("ii", $qty, $item_id);
                    $deduct->execute();
                    $deduct->close();
                }
                $st->close();

                $stmt_item->bind_param("issid", $debtor_id, $it_name, $part, $qty, $price);
                $stmt_item->execute();
            }
        }

        $db->commit();
        respond(["success" => true, "debtor_id" => $debtor_id, "items_count" => count($items)]);
    } catch (Exception $e) {
        $db->rollback();
        fail("Failed to add debtor: " . $e->getMessage());
    }
}

    // =====================  ADD ITEM  =====================
    if ($action === "debt_add_item") {
        $debtor_id = (int)($_GET["debtor_id"] ?? $data["debtor_id"] ?? 0);
        $item_name = $_GET["item_name"] ?? ($data["item_name"] ?? "");
        $qty       = (int)($_GET["qty"] ?? ($data["qty"] ?? 0));
        $price     = (float)($_GET["price"] ?? ($data["price"] ?? 0));
        $part_no   = $_GET["part_no"] ?? ($data["part_no"] ?? null);

        if ($debtor_id <= 0 || empty($item_name) || $qty <= 0) fail("Missing required fields");

        // stock deduction
        if ($part_no) {
            $stmt_item = $db->prepare("SELECT id FROM item_list WHERE part_no = ? LIMIT 1");
            $stmt_item->bind_param("s", $part_no);
        } else {
            $stmt_item = $db->prepare("SELECT id FROM item_list WHERE item_name = ? LIMIT 1");
            $stmt_item->bind_param("s", $item_name);
        }
        if ($stmt_item) {
            $stmt_item->execute();
            $res_item = $stmt_item->get_result();
            $item = $res_item->fetch_assoc();
            if ($item) {
                $item_id = (int)$item["id"];
                $stmt_deduct = $db->prepare("UPDATE stock SET quantity = GREATEST(0, quantity - ?) WHERE item_id = ?");
                $stmt_deduct->bind_param("ii", $qty, $item_id);
                $stmt_deduct->execute();
                $stmt_deduct->close();
            }
            $stmt_item->close();
        }

        $stmt = $db->prepare("INSERT INTO debt_items (debtor_id, item_name, part_no, quantity, unit_price) VALUES (?,?,?,?,?)");
        $stmt->bind_param("issid", $debtor_id, $item_name, $part_no, $qty, $price);
        $stmt->execute();
        respond(["success" => true]);
    }

    // =====================  RECORD PAYMENT  =====================
    if ($action === "debt_payment") {
        $debtor_id = (int)($_GET["debtor_id"] ?? $data["debtor_id"] ?? 0);
        $amount    = (float)($_GET["amount"] ?? ($data["amount"] ?? 0));

        if ($debtor_id <= 0 || $amount <= 0) fail("Invalid parameters");

        $stmt = $db->prepare("INSERT INTO debt_payments (debtor_id, amount) VALUES (?,?)");
        $stmt->bind_param("id", $debtor_id, $amount);
        $stmt->execute();

        $check = $db->query("
            SELECT
                (SELECT COALESCE(SUM(quantity * unit_price), 0)
                 FROM debt_items
                 WHERE debtor_id = $debtor_id AND paid = 0
                ) AS owed,
                (SELECT COALESCE(SUM(amount), 0)
                 FROM debt_payments
                 WHERE debtor_id = $debtor_id
                ) AS paid
        ")->fetch_assoc();

        if ((float)$check["paid"] >= (float)$check["owed"]) {
            $db->query("UPDATE debt_items SET paid = 1 WHERE debtor_id = $debtor_id");
            $db->query("UPDATE debtors SET blacklisted = 0 WHERE id = $debtor_id");
        }

        respond(["success" => true]);
    }

    // =====================  CLEAR DEBT (manual) =====================
    if ($action === "debt_clear") {
        $debtor_id = (int)($_GET["debtor_id"] ?? $data["debtor_id"] ?? 0);
        if ($debtor_id <= 0) fail("Invalid debtor_id");
        $db->query("UPDATE debt_items SET paid = 1 WHERE debtor_id = $debtor_id");
        $db->query("UPDATE debtors SET blacklisted = 0 WHERE id = $debtor_id");
        respond(["success" => true]);
    }

    fail("Unknown debt action");
}
/* =========================
   ROUTER
========================= */
try {
    $action = $_POST["action"] ?? $_GET["action"] ?? null;

    if (!$action) {
        $raw = file_get_contents("php://input");
        $json = json_decode($raw, true);
        if ($json && isset($json["action"])) {
            $action = $json["action"];
        }
    }

    if (!$action) {
        $ct = $_SERVER["CONTENT_TYPE"] ?? "";
        if (stripos($ct, "application/json") !== false) $action = "confirm";
        else $action = "ocr";
    }

    if ($action === "confirm" || $action === "manual_save") {
        handle_confirm();
    } elseif (strpos($action, "stats_") === 0) {
        handle_stats();
    } elseif (in_array($action, ["debt_list", "debt_add", "debt_add_item", "debt_clear", "debt_payment"])) {
        handle_debt();
    } else {
        handle_ocr();
    }

} catch (Throwable $e) {
    fail($e->getMessage());
}