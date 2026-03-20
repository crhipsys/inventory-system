'use strict';

const router = require('express').Router();
const { getDB } = require('../db/database');
const auth = require('../middleware/auth');

// GET /api/sales/summary  ── editor 이상
router.get('/summary', auth('editor'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = getDB();
    let where = 'WHERE o.is_deleted = 0';
    const params = [];
    if (from) { where += ' AND o.outbound_date >= ?'; params.push(from); }
    if (to)   { where += ' AND o.outbound_date <= ?'; params.push(to); }

    const summary = await db.getAsync(
      `SELECT
         COUNT(*)               AS total_orders,
         SUM(o.quantity)        AS total_quantity,
         SUM(o.total_price)     AS total_sales,
         SUM(o.total_profit)    AS total_profit,
         AVG(o.profit_per_unit) AS avg_profit_per_unit
       FROM outbound o ${where}`,
      params
    );
    res.json(summary);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sales/by-model  ── editor 이상
router.get('/by-model', auth('editor'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = getDB();
    let where = 'WHERE o.is_deleted = 0';
    const params = [];
    if (from) { where += ' AND o.outbound_date >= ?'; params.push(from); }
    if (to)   { where += ' AND o.outbound_date <= ?'; params.push(to); }

    const rows = await db.allAsync(
      `SELECT
         o.manufacturer, o.model_name,
         SUM(o.quantity)           AS total_quantity,
         SUM(o.total_price)        AS total_sales,
         SUM(o.total_profit)       AS total_profit,
         AVG(o.sale_price)         AS avg_sale_price,
         AVG(o.avg_purchase_price) AS avg_purchase_price
       FROM outbound o ${where}
       GROUP BY o.manufacturer, o.model_name
       ORDER BY total_profit DESC`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sales/by-vendor  ── editor 이상
router.get('/by-vendor', auth('editor'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = getDB();
    let where = 'WHERE o.is_deleted = 0';
    const params = [];
    if (from) { where += ' AND o.outbound_date >= ?'; params.push(from); }
    if (to)   { where += ' AND o.outbound_date <= ?'; params.push(to); }

    const rows = await db.allAsync(
      `SELECT
         v.company_name,
         SUM(o.quantity)     AS total_quantity,
         SUM(o.total_price)  AS total_sales,
         SUM(o.total_profit) AS total_profit
       FROM outbound o
       LEFT JOIN vendors v ON o.vendor_id = v.id
       ${where}
       GROUP BY o.vendor_id, v.company_name
       ORDER BY total_sales DESC`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
