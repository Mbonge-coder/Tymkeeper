const pool = require('../../config/db');

// ─── Fetch sessions for export ───
async function fetchSessions(companyId, userId, role, { from, to, all }) {
  let where = `s.company_id = $1 AND s.deleted_at IS NULL AND s.end_time IS NOT NULL`;
  const params = [companyId];
  let idx = 2;

  if (role !== 'admin' || !all) {
    where += ` AND s.user_id = $${idx}`;
    params.push(userId);
    idx++;
  }
  if (from) { where += ` AND s.start_time >= $${idx}::date`; params.push(from); idx++; }
  if (to) { where += ` AND s.start_time < ($${idx}::date + INTERVAL '1 day')`; params.push(to); idx++; }

  const result = await pool.query(`
    SELECT
      s.id, s.start_time, s.end_time, s.work_seconds, s.break_seconds, s.status,
      u.first_name, u.last_name, u.email,
      COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='tea'),0) AS tea_seconds,
      COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='lunch'),0) AS lunch_seconds,
      COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='toilet'),0) AS toilet_seconds,
      COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='meeting'),0) AS meeting_seconds
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE ${where}
    ORDER BY s.start_time DESC
  `, params);

  return result.rows;
}

function fmt(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString('en-ZA') : '—';
}

// ─── Export Excel ───
const exportExcel = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { from, to, all } = req.query;
    const { id: userId, company_id, role } = req.user;

    const sessions = await fetchSessions(company_id, userId, role, { from, to, all: all === 'true' });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TymKeeper';
    const ws = wb.addWorksheet('Sessions', { views: [{ state: 'frozen', ySplit: 1 }] });

    // Header style
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };

    ws.columns = [
      { header: 'Employee', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Start Time', key: 'start', width: 20 },
      { header: 'End Time', key: 'end', width: 20 },
      { header: 'Work Hours', key: 'work', width: 14 },
      { header: 'Tea Break', key: 'tea', width: 12 },
      { header: 'Lunch Break', key: 'lunch', width: 12 },
      { header: 'Toilet Break', key: 'toilet', width: 12 },
      { header: 'Meeting', key: 'meeting', width: 12 },
      { header: 'Total Break', key: 'totalBreak', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    ws.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
    ws.getRow(1).height = 28;

    sessions.forEach((s, i) => {
      const row = ws.addRow({
        name: `${s.first_name} ${s.last_name}`,
        email: s.email,
        date: s.start_time ? new Date(s.start_time).toLocaleDateString('en-ZA') : '—',
        start: fmtDate(s.start_time),
        end: fmtDate(s.end_time),
        work: fmt(s.work_seconds),
        tea: fmt(s.tea_seconds),
        lunch: fmt(s.lunch_seconds),
        toilet: fmt(s.toilet_seconds),
        meeting: fmt(s.meeting_seconds),
        totalBreak: fmt(s.break_seconds),
        status: s.status,
      });
      if (i % 2 === 1) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
        });
      }
      // Colour status cell
      const statusCell = row.getCell('status');
      const colors = { approved: 'FF10B981', pending: 'FFF59E0B', rejected: 'FFEF4444' };
      statusCell.font = { color: { argb: colors[s.status] || 'FF64748B' }, bold: true };
    });

    // Totals row
    ws.addRow({});
    const totalWork = sessions.reduce((acc, s) => acc + (s.work_seconds || 0), 0);
    const totalBreak = sessions.reduce((acc, s) => acc + (s.break_seconds || 0), 0);
    const totRow = ws.addRow({ name: 'TOTALS', work: fmt(totalWork), totalBreak: fmt(totalBreak) });
    totRow.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tymkeeper_sessions_${from || 'all'}_${to || 'all'}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

// ─── Export PDF ───
const exportPdf = async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const { from, to, all } = req.query;
    const { id: userId, company_id, role } = req.user;

    const sessions = await fetchSessions(company_id, userId, role, { from, to, all: all === 'true' });

    const companyRow = await pool.query('SELECT name FROM companies WHERE id = $1', [company_id]);
    const companyName = companyRow.rows[0]?.name || 'Company';

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tymkeeper_sessions_${from || 'all'}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 70).fill('#2563EB');
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('TymKeeper', 40, 20);
    doc.fontSize(11).font('Helvetica').text(`Session Report — ${companyName}`, 40, 46);
    doc.fillColor('#BFDBFE').fontSize(9).text(`Generated: ${new Date().toLocaleString('en-ZA')}  |  Period: ${from || '—'} to ${to || '—'}`, 40, 58);

    doc.moveDown(3);

    // Column headers
    const colX = [40, 145, 250, 310, 370, 430, 475, 520, 565, 610, 660];
    const headers = ['Employee', 'Email', 'Date', 'Start', 'End', 'Work', 'Tea', 'Lunch', 'Toilet', 'Mtg', 'Status'];
    let y = 90;

    doc.rect(40, y, doc.page.width - 80, 18).fill('#EFF6FF');
    doc.fillColor('#1D4ED8').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: 100 }));
    y += 22;

    // Rows
    doc.font('Helvetica').fontSize(7.5);
    sessions.forEach((s, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        y = 40;
      }
      if (idx % 2 === 0) doc.rect(40, y - 2, doc.page.width - 80, 16).fill('#F8FAFF');
      doc.fillColor('#0F172A');
      const vals = [
        `${s.first_name} ${s.last_name}`,
        s.email,
        s.start_time ? new Date(s.start_time).toLocaleDateString('en-ZA') : '—',
        s.start_time ? new Date(s.start_time).toLocaleTimeString('en-ZA',{timeStyle:'short'}) : '—',
        s.end_time ? new Date(s.end_time).toLocaleTimeString('en-ZA',{timeStyle:'short'}) : '—',
        fmt(s.work_seconds), fmt(s.tea_seconds), fmt(s.lunch_seconds), fmt(s.toilet_seconds),
        fmt(s.meeting_seconds), s.status,
      ];
      vals.forEach((v, i) => doc.text(v, colX[i], y, { width: 100 }));
      y += 16;
    });

    // Summary
    y += 10;
    doc.rect(40, y, doc.page.width - 80, 24).fill('#EFF6FF');
    const totalWork = sessions.reduce((a, s) => a + (s.work_seconds || 0), 0);
    doc.fillColor('#1D4ED8').fontSize(9).font('Helvetica-Bold')
      .text(`Total Sessions: ${sessions.length}   |   Total Work: ${fmt(totalWork)}`, 44, y + 8);

    doc.end();
  } catch (err) { next(err); }
};

module.exports = { exportExcel, exportPdf };
