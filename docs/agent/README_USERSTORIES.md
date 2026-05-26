# Olist User Stories — UI & Agent 1 Test Catalog

**Dataset:** [Brazilian E-Commerce (Olist)](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)  
**Purpose:** Feed these into the **local landing app**, **Lovable UI**, or `POST /stories` to test **Agent 1 (Task Breakdown)** and **Evaluation Agent**.  
**Total stories:** 22 (14 valid + 8 invalid; minimum 6 invalid as required)

| UI | URL | Notes |
|----|-----|-------|
| **Local landing** (Cursor dev) | `http://localhost:5173/intake` | [landing/README.md](../../landing/README.md) — refine + structured editor |
| **Lovable hosted** | [etl-spark-entry.lovable.app/#intake](https://etl-spark-entry.lovable.app/#intake) | Legacy components in `src/components/landing/` |
| **API** | `POST /stories/refine`, `POST /stories` | [autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent) on port 8000 |

**GitHub:** [MamtaVenugopal/etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry) · [MamtaVenugopal/autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent)

---

## Valid tables & columns (what exists in Olist)

Use these names in **valid** stories. In Databricks/Unity Catalog you may use `_raw` suffix (bronze) as in the capstone README.

| Logical table | Typical bronze name | Key columns you can reference |
|---------------|---------------------|-------------------------------|
| Orders | `olist_orders_raw` | `order_id`, `customer_id`, `order_status`, `order_purchase_timestamp`, delivery timestamps |
| Customers | `olist_customers_raw` | `customer_id`, `customer_unique_id`, `customer_city`, `customer_state` |
| Order items | `olist_order_items_raw` | `order_id`, `product_id`, `seller_id`, `price`, `freight_value` |
| Payments | `olist_order_payments_raw` | `order_id`, `payment_type`, `payment_installments`, `payment_value` |
| Reviews | `olist_order_reviews_raw` | `order_id`, `review_score`, `review_comment_title`, `review_comment_message` |
| Products | `olist_products_raw` | `product_id`, `product_category_name`, dimensions, weight |
| Sellers | `olist_sellers_raw` | `seller_id`, `seller_city`, `seller_state` |
| Geolocation | `olist_geolocation_raw` | `geolocation_zip_code_prefix`, `geolocation_lat`, `geolocation_lng`, `geolocation_city`, `geolocation_state` |
| Category translation | `olist_category_translation_raw` | `product_category_name`, `product_category_name_english` |

**Join path (valid):** orders → customers, order_items → products → category_translation, sellers; payments & reviews on order_id; geolocation via zip prefixes.

**Not in Olist (use only in invalid stories):** returns, inventory, subscriptions, marketing campaigns, profit_margin column, NPS, competitor pricing, Amazon/Walmart data, EU warehouse tables.

---

## How Agent 1 should react today

| Story type | Expected `evaluations.task_breakdown.passed` | Typical failure message |
|------------|-----------------------------------------------|-------------------------|
| **Valid** (14 stories) | `true` | Spec passed policy checks |
| **Invalid table** (wrong name / prefix) | `false` | `Disallowed source tables: [...]` (policy allowlist) |
| **Invalid target** (not `gold.*`) | `false` | `target_table must start with 'gold.'` |
| **Invalid column / category** (in YAML) | `false` if table listed is invalid; column-only issues may need catalog enhancement* | See story notes |

\*Stories **US-INV-005** and **US-INV-006** are written to test **non-existent columns/categories**. Today’s `SpecEvaluator` checks **table allowlist** and **gold target**. For strict column/category validation, add `config/olist_catalog.yaml` to the evaluator (recommended before demo). Until then, invalid **tables** will fail reliably; invalid **columns** may still parse but should be caught in a follow-up evaluator rule.

---

## How to submit in the UI

### Local landing (`landing/`)

1. Start backend: `docker compose up -d redis api worker` in `autonomous-etl-agent`
2. Start UI: `npm run dev` in `landing/`
3. Open `/intake` → paste free text or YAML → **Refine with AI** (optional) → edit fields → **Ship to Agent**
4. Run tracker opens in a new tab: `/runs/{runId}` — poll until Agent 4 delivery (table, chart, YData, PDF)

### Lovable hosted

Paste YAML at [etl-spark-entry.lovable.app/#intake](https://etl-spark-entry.lovable.app/#intake). Set `VITE_API_BASE_URL` to your API (ngrok or localhost tunnel).

### API / YAML fields

For each story, use **Ship to Agent** with:

- `story_id` — as below  
- `title` — as below  
- `input_mode` — `yaml` if copying the YAML block; `text` for free-text  
- `content` — the YAML or paragraph  

Or use structured YAML files under `config/stories/` (valid + `config/stories/invalid/`).

---

# Part A — Valid user stories (14) — should PASS Agent 1

### US-001 — Monthly revenue by category (capstone)

**Title:** Monthly Revenue Summary by Product Category  
**Expected:** PASS

```yaml
story_id: US-001
title: Monthly Revenue Summary by Product Category
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_items_raw
  - olist_products_raw
  - olist_category_translation_raw
target_table: gold.monthly_revenue_summary
key_transformations:
  - join orders to order_items to products to category_translation
  - filter order_status to delivered
  - derive order_year and order_month from order_purchase_timestamp
  - aggregate sum of price and count of orders by month and product_category_name_english
acceptance_criteria:
  - total_revenue > 0
  - no nulls in product_category_name_english
  - order_month between 1 and 12
```

---

### US-002 — Seller performance scorecard (capstone)

**Title:** Seller Performance Scorecard with Review Scores  
**Expected:** PASS

```yaml
story_id: US-002
title: Seller Performance Scorecard with Review Scores
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_items_raw
  - olist_order_reviews_raw
  - olist_sellers_raw
target_table: gold.seller_performance_scorecard
key_transformations:
  - join order_items to orders to reviews to sellers
  - compute avg review_score and total revenue per seller
  - derive cancellation_rate and performance_tier Gold Silver Bronze
acceptance_criteria:
  - avg_review_score between 1.0 and 5.0
  - cancellation_rate between 0 and 1
  - performance_tier is never null
```

---

### US-003 — Customer RFM segmentation (capstone)

**Title:** Customer RFM Segmentation for Marketing  
**Expected:** PASS

```yaml
story_id: US-003
title: Customer RFM Segmentation for Marketing
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_items_raw
  - olist_customers_raw
  - olist_order_payments_raw
target_table: gold.customer_rfm_segments
key_transformations:
  - join orders customers payments and items
  - filter to delivered orders only
  - compute recency frequency monetary per customer_unique_id
  - assign rfm_segment Champion Loyal Potential At Risk Lost
acceptance_criteria:
  - recency_days >= 0
  - frequency >= 1
  - monetary > 0
  - rfm_segment in Champion Loyal Potential At Risk Lost
```

---

### US-004 — Payment mix by state

**Title:** Payment Method Mix by Customer State  
**Expected:** PASS

```yaml
story_id: US-004
title: Payment Method Mix by Customer State
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_customers_raw
  - olist_order_payments_raw
target_table: gold.payment_mix_by_state
key_transformations:
  - join orders to customers and payments
  - group by customer_state and payment_type
  - sum payment_value and count orders
acceptance_criteria:
  - payment_value > 0
  - payment_type in credit_card boleto voucher debit_card
```

---

### US-005 — Delivery latency SLA

**Title:** Order Delivery Latency and Late Flag  
**Expected:** PASS

```yaml
story_id: US-005
title: Order Delivery Latency and Late Flag
intent: transform
source_tables:
  - olist_orders_raw
target_table: gold.order_delivery_sla
key_transformations:
  - compute delivery_days from order_delivered_customer_date minus order_purchase_timestamp
  - flag is_late when delivered after estimated_delivery_date
  - filter orders with non-null delivery dates
acceptance_criteria:
  - delivery_days >= 0
  - is_late is boolean
```

---

### US-006 — Top product categories by freight

**Title:** Average Freight Cost by Product Category  
**Expected:** PASS

```yaml
story_id: US-006
title: Average Freight Cost by Product Category
intent: aggregate
source_tables:
  - olist_order_items_raw
  - olist_products_raw
  - olist_category_translation_raw
target_table: gold.freight_by_category
key_transformations:
  - join items to products to category translation
  - group by product_category_name_english
  - avg freight_value and avg price
acceptance_criteria:
  - avg_freight_value >= 0
  - category count >= 1
```

---

### US-007 — Geographic order density

**Title:** Order Count by Seller State and City  
**Expected:** PASS

```yaml
story_id: US-007
title: Order Count by Seller State and City
intent: aggregate
source_tables:
  - olist_order_items_raw
  - olist_sellers_raw
  - olist_geolocation_raw
target_table: gold.orders_by_seller_geography
key_transformations:
  - join items to sellers on seller_id
  - enrich seller zip with geolocation lat lng
  - count distinct order_id by seller_state
acceptance_criteria:
  - order_count > 0
  - seller_state length equals 2
```

---

### US-008 — Review score distribution

**Title:** Weekly Review Score Distribution  
**Expected:** PASS

```yaml
story_id: US-008
title: Weekly Review Score Distribution
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_reviews_raw
target_table: gold.weekly_review_distribution
key_transformations:
  - join reviews to orders
  - bucket review_creation_date by week
  - count reviews per review_score per week
acceptance_criteria:
  - review_score between 1 and 5
  - weekly_review_count >= 0
```

---

### US-009 — Installment behavior

**Title:** Average Installments by Payment Type  
**Expected:** PASS

```yaml
story_id: US-009
title: Average Installments by Payment Type
intent: aggregate
source_tables:
  - olist_order_payments_raw
target_table: gold.installments_by_payment_type
key_transformations:
  - group by payment_type
  - avg payment_installments and sum payment_value
acceptance_criteria:
  - payment_installments >= 1
  - row count equals number of payment types
```

---

### US-010 — Product weight vs price outliers

**Title:** Product Weight and Price Outlier Flags  
**Expected:** PASS

```yaml
story_id: US-010
title: Product Weight and Price Outlier Flags
intent: transform
source_tables:
  - olist_products_raw
  - olist_order_items_raw
target_table: gold.product_price_weight_flags
key_transformations:
  - join products to order_items
  - flag price_outlier and weight_outlier using percentiles
  - drop null product_id
acceptance_criteria:
  - product_weight_g >= 0
  - price > 0
```

---

### US-011 — Customer repeat purchase rate

**Title:** Customer Repeat Purchase Rate  
**Expected:** PASS

```yaml
story_id: US-011
title: Customer Repeat Purchase Rate
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_customers_raw
target_table: gold.customer_repeat_rate
key_transformations:
  - count orders per customer_unique_id
  - label repeat_customer when order_count > 1
  - aggregate repeat rate by customer_state
acceptance_criteria:
  - repeat_rate between 0 and 1
```

---

### US-012 — Free-text valid story (OpenAI path)

**Title:** Delayed Deliveries in São Paulo  
**Input mode:** `text` (not YAML)  
**Expected:** PASS (requires `OPENAI_API_KEY`)

**Content to paste:**

```text
As a logistics analyst I want a pipeline that filters olist orders and customers to São Paulo state (SP), computes days between purchase and delivery, and loads a gold table gold.sp_delivery_delays with columns order_id, delivery_days, and is_late. Acceptance: delivery_days non-negative; only delivered orders included.
```

---

### US-013 — Basket size per order

**Title:** Average Items per Order (Basket Size)  
**Expected:** PASS

```yaml
story_id: US-013
title: Average Items per Order Basket Size
intent: aggregate
source_tables:
  - olist_order_items_raw
target_table: gold.order_basket_size
key_transformations:
  - count items per order_id
  - compute avg items per order and max items per order
acceptance_criteria:
  - basket_size >= 1
```

---

### US-014 — Revenue by payment type and month

**Title:** Monthly Revenue by Payment Type  
**Expected:** PASS

```yaml
story_id: US-014
title: Monthly Revenue by Payment Type
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_payments_raw
  - olist_order_items_raw
target_table: gold.monthly_revenue_by_payment_type
key_transformations:
  - join orders payments items
  - derive order_year order_month
  - sum payment_value by month and payment_type
acceptance_criteria:
  - payment_value > 0
```

---

# Part B — Invalid user stories (8) — should FAIL Agent 1

These reference **tables, columns, or categories that do not exist** in Olist (or break policy). Use them to prove the agent/evaluator rejects bad requests.

---

### US-INV-001 — Returns table (does not exist)

**Title:** Return and Refund Analysis  
**Why invalid:** No returns/refunds table in Olist.  
**Expected:** FAIL — `olist_returns_raw` not allowed / not in catalog

```yaml
story_id: US-INV-001
title: Return and Refund Analysis
intent: aggregate
source_tables:
  - olist_returns_raw
  - olist_orders_raw
target_table: gold.return_rate_summary
key_transformations:
  - join returns to orders on return_id
  - compute return_rate by month
acceptance_criteria:
  - return_rate between 0 and 1
```

---

### US-INV-002 — Inventory stock table (does not exist)

**Title:** Warehouse Inventory Snapshot  
**Why invalid:** Olist has no inventory/stock feed.  
**Expected:** FAIL

```yaml
story_id: US-INV-002
title: Warehouse Inventory Snapshot
intent: ingest
source_tables:
  - olist_inventory_stock_raw
  - olist_products_raw
target_table: gold.inventory_daily
key_transformations:
  - join inventory to products
  - snapshot stock_level by warehouse_id
acceptance_criteria:
  - stock_level >= 0
```

---

### US-INV-003 — Marketing campaigns (does not exist)

**Title:** Marketing Campaign Attribution  
**Why invalid:** No campaign/marketing tables in Olist.  
**Expected:** FAIL

```yaml
story_id: US-INV-003
title: Marketing Campaign Attribution
intent: aggregate
source_tables:
  - olist_marketing_campaigns_raw
  - olist_orders_raw
target_table: gold.campaign_roi
key_transformations:
  - attribute orders to campaign_id
  - compute ROI per campaign
acceptance_criteria:
  - roi >= 0
```

---

### US-INV-004 — Competitor / wrong prefix (not Olist)

**Title:** Amazon Brazil Price Comparison  
**Why invalid:** `amazon_brazil_orders_raw` is outside allowed `olist_` / bronze / silver prefixes.  
**Expected:** FAIL — Disallowed source tables

```yaml
story_id: US-INV-004
title: Amazon Brazil Price Comparison
intent: aggregate
source_tables:
  - amazon_brazil_orders_raw
  - olist_products_raw
target_table: gold.competitor_price_gap
key_transformations:
  - join amazon orders to olist products on sku
  - compute price_gap
acceptance_criteria:
  - price_gap is not null
```

---

### US-INV-005 — Non-existent column profit_margin

**Title:** Profit Margin by Category  
**Why invalid:** Olist order/items have `price` and `freight_value`, **not** `profit_margin` or `cost_of_goods`.  
**Expected:** FAIL (table list valid; recommend catalog rule on columns — may FAIL if model invents invalid table; document for evaluator upgrade)

```yaml
story_id: US-INV-005
title: Profit Margin by Category
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_items_raw
  - olist_products_raw
target_table: gold.profit_margin_by_category
key_transformations:
  - compute profit_margin as price minus cost_of_goods divided by price
  - group by product_category_name
acceptance_criteria:
  - profit_margin between 0 and 1
```

---

### US-INV-006 — Fake product category

**Title:** Revenue for Luxury Yachts Category  
**Why invalid:** Category `luxury_yachts` does not exist in Olist (71 real categories; e.g. health_beauty, computers).  
**Expected:** FAIL (recommend category allowlist from `product_category_name_translation`)

```yaml
story_id: US-INV-006
title: Revenue for Luxury Yachts Category
intent: aggregate
source_tables:
  - olist_orders_raw
  - olist_order_items_raw
  - olist_products_raw
target_table: gold.luxury_yacht_revenue
key_transformations:
  - filter product_category_name to luxury_yachts
  - sum price as revenue
acceptance_criteria:
  - revenue > 0
```

---

### US-INV-007 — Invalid target schema (not gold)

**Title:** Silver-Only Staging Copy of Orders  
**Why invalid:** Policy requires `target_table` to start with `gold.`  
**Expected:** FAIL — target must start with `gold.`

```yaml
story_id: US-INV-007
title: Silver-Only Staging Copy of Orders
intent: transform
source_tables:
  - olist_orders_raw
target_table: silver.orders_copy_only
key_transformations:
  - copy all columns from orders
acceptance_criteria:
  - row count > 0
```

---

### US-INV-008 — Subscriptions table (does not exist)

**Title:** Olist Prime Subscription Churn  
**Why invalid:** No subscription table in the dataset.  
**Expected:** FAIL

```yaml
story_id: US-INV-008
title: Olist Prime Subscription Churn
intent: aggregate
source_tables:
  - olist_subscriptions_raw
  - olist_customers_raw
target_table: gold.subscription_churn
key_transformations:
  - compute churn_flag per customer_unique_id
acceptance_criteria:
  - churn_rate between 0 and 1
```

---

# Quick reference matrix

| ID | Valid / Invalid | Primary test |
|----|-----------------|--------------|
| US-001 | Valid | Capstone revenue |
| US-002 | Valid | Capstone seller |
| US-003 | Valid | Capstone RFM |
| US-004 | Valid | Payments + geo |
| US-005 | Valid | Delivery SLA |
| US-006 | Valid | Freight by category |
| US-007 | Valid | Seller geography |
| US-008 | Valid | Reviews |
| US-009 | Valid | Installments |
| US-010 | Valid | Product outliers |
| US-011 | Valid | Repeat customers |
| US-012 | Valid | Free-text / OpenAI |
| US-013 | Valid | Basket size |
| US-014 | Valid | Revenue by payment |
| US-INV-001 | Invalid | Returns table |
| US-INV-002 | Invalid | Inventory table |
| US-INV-003 | Invalid | Marketing table |
| US-INV-004 | Invalid | Amazon / wrong prefix |
| US-INV-005 | Invalid | profit_margin column |
| US-INV-006 | Invalid | Fake category |
| US-INV-007 | Invalid | Non-gold target |
| US-INV-008 | Invalid | Subscriptions table |

---

# Schema validation (RAG)

Agent 1 uses **FAISS + `data/olist_schema/schema_chunks.json`**. Flow diagrams: **`README_FAISS.md`**. Technical detail: **`ARCHITECTURE_RAG.md`**.

Invalid stories should return evaluation errors such as:

- `Table(s) do not exist in Olist schema: [...]`
- `Column(s) do not exist in Olist schema: [...]`
- `Product category/categories do not exist in Olist: [...]`

Build index once: `python scripts/build_schema_index.py` (needs `OPENAI_API_KEY`).

---

*Last updated: May 2026 — for Lovable UI and Agent 1 evaluation testing.*
