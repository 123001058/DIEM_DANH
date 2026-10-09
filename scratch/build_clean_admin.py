import re

# Read current backup or admin.html to extract the original backend javascript
with open('admin.html.bak', 'r', encoding='utf-8') as f:
    bak_content = f.read()

orig_script_idx = bak_content.find('<script>')
orig_js = bak_content[orig_script_idx:] # contains all Supabase logic, RPCs, attendanceMap, etc.

# Let's define the complete pristine HTML head, CSS, markup, and modals
full_template = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LH-NaviX — Quản Lý Điểm Danh</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/theme.css">
<style>
/* ==========================================================
   LH-NaviX — Design System & Layout
   ========================================================== */
body {
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  padding: 0;
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-wrapper {
  max-width: 1360px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 20px 40px;
  box-sizing: border-box;
  flex: 1;
}

/* TOP BAR */
.topbar-compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px;
  margin-bottom: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  position: sticky;
  top: 12px;
  z-index: 100;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  gap: 12px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-hamburger {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4.5px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  padding: 0;
  flex: none;
}
.btn-hamburger:hover {
  background: var(--text);
  color: #fff;
  border-color: var(--text);
  transform: translateY(-1px);
}
.btn-hamburger span {
  display: block;
  width: 16px;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  display: grid;
  place-items: center;
  flex: none;
  object-fit: contain;
  box-shadow: 0 4px 12px -3px rgba(59,130,246,0.5);
}
.brand-titles { display: flex; flex-direction: column; }
.brand-title { font-size: 15.5px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.brand-section-badge { font-size: 11px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 5px; }
.brand-section-badge::before { content: "•"; color: var(--info); }

.topbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.net-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.net-online { background: var(--ok-bg); color: var(--ok); border: 1px solid rgba(15,122,74,.25); }
.net-offline { background: var(--err-bg); color: var(--err); border: 1px solid rgba(194,56,46,.25); }
.net-dot { width: 6.5px; height: 6.5px; border-radius: 50%; background: currentColor; }
.net-online .net-dot { animation: pulse 1.6s ease-out infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(15,122,74,.45); } 100% { box-shadow: 0 0 0 7px rgba(15,122,74,0); } }

.session-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.pill-on { background: var(--ok-bg); color: var(--ok); border: 1px solid rgba(15,122,74,.25); }
.pill-off { background: var(--surface-2); color: var(--muted); border: 1px solid var(--border); }

.user-profile-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 5px;
  border-radius: 99px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}
.user-avatar-mini {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--text);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
}

.btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.16s cubic-bezier(0.22, 1, 0.36, 1);
  text-decoration: none;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--surface-2); transform: translateY(-1px); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--text); color: #fff; border-color: var(--text); }
.btn-primary:hover:not(:disabled) { background: #2b2f37; }
.btn-danger { background: var(--err-bg); color: var(--err); border-color: rgba(194,56,46,.28); }
.btn-danger:hover:not(:disabled) { background: rgba(194,56,46,.15); }
.btn-success { background: var(--ok-bg); color: var(--ok); border-color: rgba(15,122,74,.28); }
.btn-success:hover:not(:disabled) { background: rgba(15,122,74,.15); }
.btn-secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.btn-icon { padding: 8px; width: 34px; height: 34px; justify-content: center; }
.btn-sm { padding: 5px 10px; font-size: 11.5px; }

/* SIDEBAR DRAWER */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 26, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 900;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
.sidebar-overlay.show { opacity: 1; pointer-events: auto; }

.sidebar-drawer {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 290px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  box-shadow: 10px 0 35px -10px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  transform: translateX(-100%);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-drawer.open { transform: translateX(0); }

.sidebar-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sidebar-brand { display: flex; align-items: center; gap: 10px; }
.sidebar-close-btn {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface-2);
  color: var(--muted); display: grid; place-items: center; cursor: pointer;
}
.sidebar-nav {
  padding: 14px 12px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  color: var(--muted);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: all 0.15s ease;
  width: 100%;
  text-align: left;
}
.sidebar-nav-item:hover { background: var(--surface-2); color: var(--text); }
.sidebar-nav-item.active { background: var(--text); color: #fff; }
.sidebar-nav-item .nav-icon { font-size: 16px; width: 22px; text-align: center; }
.sidebar-nav-item .nav-label { flex: 1; }
.sidebar-nav-item .nav-badge {
  font-size: 10.5px; font-weight: 800; padding: 2px 7px;
  border-radius: 99px; background: rgba(0, 0, 0, 0.08); color: var(--muted);
}
.sidebar-nav-item.active .nav-badge { background: rgba(255, 255, 255, 0.2); color: #fff; }

.sidebar-footer {
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar-admin-info { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
.sidebar-footer-link {
  font-size: 12px; font-weight: 600; color: var(--muted); text-decoration: none;
  display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 6px;
}
.sidebar-footer-link:hover { background: var(--border); color: var(--text); }

/* APP VIEWS */
.app-view { display: none; animation: viewFade 0.2s cubic-bezier(0.22, 1, 0.36, 1); }
.app-view.active { display: block; }
@keyframes viewFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* Offline Banner */
.offline-banner {
  padding: 11px 18px; margin-bottom: 14px; background: var(--warn-bg); color: var(--warn);
  border: 1px solid rgba(161,92,0,.28); border-radius: var(--radius-sm); font-size: 13px;
  font-weight: 600; display: none; align-items: center; gap: 10px;
}
.offline-banner.show { display: flex; }

/* ==========================================================
   KPI CARDS (Exact match to User's image)
   ========================================================== */
.overview-layout { display: flex; flex-direction: column; gap: 16px; }

.hero-session-card {
  padding: 18px 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.hero-session-left { display: flex; align-items: center; gap: 14px; }
.hero-session-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: #eff6ff; color: #2563eb; display: grid; place-items: center; font-size: 20px;
}
.hero-session-title { font-size: 16px; font-weight: 800; }
.hero-session-sub { font-size: 12.5px; color: var(--muted); }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
@media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .kpi-grid { grid-template-columns: 1fr; } }

.kpi-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #e7e9ee;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.08);
}
.kpi-top { display: flex; justify-content: space-between; align-items: center; }
.kpi-label {
  font-size: 11.5px; font-weight: 800; letter-spacing: 0.06em;
  text-transform: uppercase; color: #64748b;
}
.kpi-icon-badge {
  width: 34px; height: 34px; border-radius: 10px;
  display: grid; place-items: center; font-size: 15px; flex: none;
}
.kpi-icon-badge.purple-box { background: #ede9fe; color: #5b21b6; }
.kpi-icon-badge.green-box { background: #dcfce7; color: #15803d; }
.kpi-icon-badge.pink-box { background: #fee2e2; color: #b91c1c; }
.kpi-icon-badge.blue-box { background: #e0f2fe; color: #0369a1; }

.kpi-val {
  font-size: 34px; font-weight: 800; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums; line-height: 1.15; margin: 10px 0 4px;
}
.kpi-val.text-dark { color: #0f172a; }
.kpi-val.text-green { color: #16a34a; }
.kpi-val.text-red { color: #dc2626; }
.kpi-val.text-blue { color: #2563eb; }
.kpi-sub { font-size: 12.5px; color: #64748b; font-weight: 500; }

/* Robocon Rules Card */
.rules-widget-card {
  padding: 22px 24px; background: #ffffff;
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow);
}
.rules-head {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; flex-wrap: wrap; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;
}
.rules-title-wrap { display: flex; align-items: center; gap: 10px; }
.rules-icon {
  width: 36px; height: 36px; border-radius: 9px;
  background: #fef3c7; color: #b45309; display: grid; place-items: center; font-size: 17px;
}
.rules-title { font-size: 15.5px; font-weight: 800; color: var(--text); }
.rules-sub { font-size: 12px; color: var(--muted); margin-top: 1px; }
.rules-list { display: flex; flex-direction: column; gap: 10px; }
.rule-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; padding: 12px 14px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: 10px; transition: all 0.15s ease;
}
.rule-item:hover { background: #ffffff; border-color: var(--border-strong); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.rule-item-content { flex: 1; min-width: 0; }
.rule-item-title { font-size: 13.5px; font-weight: 800; color: var(--text); margin-bottom: 3px; }
.rule-item-desc { font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.rule-item-actions { display: flex; gap: 6px; flex: none; }

/* 2-Column Overview Grid */
.overview-main-grid {
  display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: start;
}
@media (max-width: 960px) { .overview-main-grid { grid-template-columns: 1fr; } }

.session-create-card { padding: 20px 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.scc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.scc-icon { width: 38px; height: 38px; border-radius: 10px; background: #eff6ff; color: #2563eb; display: grid; place-items: center; }
.scc-title { font-size: 15px; font-weight: 800; }
.scc-sub { font-size: 12px; color: var(--muted); }
.session-form { display: flex; flex-direction: column; gap: 12px; }
.form-field { display: flex; flex-direction: column; gap: 5px; }
.form-field label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.form-field input, .form-field select, .form-field textarea {
  width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-strong);
  font-size: 13px; outline: none; background: var(--surface); font-family: inherit; box-sizing: border-box;
}
.form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: var(--text); box-shadow: 0 0 0 4px #eceef2; }
.form-row-2 { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; align-items: end; }
@media (max-width: 500px) { .form-row-2 { grid-template-columns: 1fr; } }
.btn-open-session { padding: 11px 18px; font-size: 13.5px; font-weight: 800; justify-content: center; }

.schedule-widget-card, .history-widget-card { padding: 20px 22px; }
.widget-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
.widget-title-wrap { display: flex; align-items: center; gap: 8px; }
.widget-title { font-size: 14.5px; font-weight: 800; }
.widget-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.widget-link { font-size: 12px; font-weight: 700; color: var(--info); text-decoration: none; }
.widget-actions { display: flex; gap: 6px; }

.count-badge { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; background: rgba(0,0,0,0.06); }
.schedule-list-wrap, .history-list-wrap { max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; }
.schedule-loading { padding: 24px; text-align: center; color: var(--muted); font-size: 12.5px; }

.schedule-card-item {
  padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; font-size: 12.5px;
}
.sc-item-header { display: flex; justify-content: space-between; align-items: center; }
.sc-student-name { font-size: 13px; font-weight: 700; color: var(--text); }
.sc-student-mssv { font-size: 11px; font-family: monospace; color: var(--muted); }
.sc-item-subject { font-size: 12px; font-weight: 600; color: var(--info); }
.sc-item-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.room-chip { padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); font-weight: 700; font-size: 10.5px; }

/* ATTENDANCE VIEW STYLES */
.session-bar {
  padding: 12px 18px; margin-bottom: 14px; display: flex; justify-content: space-between;
  align-items: center; gap: 12px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
}
.session-bar-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.session-bar-name { font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px; }
.session-bar-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 11.5px; }
.session-bar-meta code { font-family: ui-monospace, monospace; font-size: 11px; background: var(--surface-2); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); }
.countdown-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 99px; font-size: 11.5px; font-weight: 800; font-variant-numeric: tabular-nums; background: var(--ok-bg); color: var(--ok); }
.countdown-chip.warn { background: var(--warn-bg); color: var(--warn); }
.countdown-chip.danger { background: var(--err-bg); color: var(--err); }

.main-grid { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
@media (max-width: 1020px) { .main-grid { grid-template-columns: 1fr; } }

.qr-panel { padding: 18px; text-align: center; position: sticky; top: 80px; }
.qr-panel-title { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
.qr-frame { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: inline-block; box-shadow: var(--shadow); }
#qrCanvas { width: 210px; height: 210px; display: flex; align-items: center; justify-content: center; background: #fff; }
#qrCanvas img, #qrCanvas canvas { width: 100%!important; height: 100%!important; display: block; image-rendering: crisp-edges; }
.qr-timestamp { margin-top: 10px; font-size: 11px; color: var(--muted); display: flex; justify-content: center; align-items: center; gap: 5px; }
.qr-timestamp b { color: var(--text); font-weight: 800; font-variant-numeric: tabular-nums; }
.qr-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.qr-actions .btn { width: 100%; justify-content: center; padding: 9px 8px; font-size: 12px; }
.btn-refresh { background: linear-gradient(135deg,#3b82f6,#1d4ed8); color: #fff; border: none; font-weight: 800; }
.qr-hint { margin-top: 10px; font-size: 11px; color: var(--muted); line-height: 1.45; text-align: left; padding: 8px 10px; background: var(--surface-2); border-radius: 8px; border: 1px dashed var(--border-strong); }
.qr-warning { margin-top: 10px; padding: 8px 10px; background: var(--warn-bg); color: var(--warn); border-radius: 8px; font-size: 11.5px; font-weight: 700; display: none; }
.qr-warning.show { display: flex; }

.main-panel { padding: 18px 20px; min-width: 0; }
.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
@media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
.stat { padding: 10px 8px; text-align: center; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.stat-label { font-size: 10px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.stat-num { font-size: 24px; font-weight: 800; line-height: 1.1; margin-top: 2px; font-variant-numeric: tabular-nums; }
.stat-num.blue { color: var(--info); }
.stat-num.green { color: var(--ok); }
.stat-num.red { color: var(--err); }
.stat-num.purple { color: #7c3aed; }
.stat-num.amber { color: #d97706; }
.stat-num.gray { color: var(--faint); }

.progress-wrap { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px; }
.progress-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.progress-lbl { font-size: 11.5px; font-weight: 600; color: var(--muted); }
.progress-pct { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.progress-track { height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg,#10b981,#059669); border-radius: 99px; transition: width .6s cubic-bezier(.22,1,.36,1); }

.feed-wrap { margin-bottom: 14px; padding: 10px 12px; background: linear-gradient(180deg,rgba(59,130,246,.04),rgba(59,130,246,.01)); border: 1px solid rgba(59,130,246,.15); border-radius: var(--radius-sm); }
.feed-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.feed-title { font-size: 10.5px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--info); display: flex; align-items: center; gap: 5px; }
.feed-live-dot { width: 6px; height: 6px; background: var(--info); border-radius: 50%; animation: pulse 1.4s ease-out infinite; }
.feed-list { display: flex; flex-direction: column; gap: 5px; max-height: 110px; overflow-y: auto; }
.feed-item { display: flex; align-items: center; gap: 8px; padding: 6px 9px; background: #fff; border: 1px solid var(--border); border-radius: 7px; }
.feed-avt { width: 22px; height: 22px; border-radius: 50%; flex: none; background: var(--ok-bg); color: var(--ok); display: grid; place-items: center; font-size: 10px; font-weight: 800; }
.feed-name { font-size: 12px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
.feed-empty { padding: 10px; text-align: center; font-size: 11.5px; color: var(--muted); font-style: italic; }

.session-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.session-tab { padding: 8px 14px; border: none; background: transparent; font-size: 12.5px; font-weight: 700; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; transition: .15s; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
.session-tab:hover { color: var(--text); }
.session-tab.active { color: var(--text); border-bottom-color: var(--text); }

.thead-block { margin-bottom: 12px; }
.thead-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.thead-title { font-size: 14.5px; font-weight: 800; }
.filters { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.filter { padding: 5px 10px; border-radius: 99px; font-size: 11.5px; font-weight: 700; background: var(--surface-2); border: 1px solid var(--border); color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit; }
.filter.active { background: var(--text); color: #fff; border-color: var(--text); }
.filter .count { font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 99px; background: rgba(0,0,0,.06); }
.filter.active .count { background: rgba(255,255,255,.2); }
.thead-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-wrap input { width: 190px; padding: 7px 10px 7px 28px; border-radius: 7px; border: 1px solid var(--border-strong); font-size: 12.5px; outline: none; background: var(--surface); }
.search-wrap input:focus { border-color: var(--text); box-shadow: 0 0 0 3px #eceef2; width: 220px; }
.search-wrap svg { position: absolute; left: 8px; color: var(--faint); pointer-events: none; }

.tbl-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); }
.tbl-scroll { max-height: 440px; overflow-y: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
thead th { position: sticky; top: 0; z-index: 2; text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); padding: 9px 12px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:hover td { background: var(--surface-2); }
tbody tr:last-child td { border-bottom: none; }
.student-cell { display: flex; align-items: center; gap: 8px; font-weight: 600; min-width: 0; }
.avt { width: 26px; height: 26px; border-radius: 50%; flex: none; background: var(--text); color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
.td-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-mono { font-variant-numeric: tabular-nums; color: var(--muted); font-family: ui-monospace, monospace; font-size: 11.5px; }

.status-select { padding: 4px 22px 4px 9px; border-radius: 99px; font-size: 11px; font-weight: 800; border: 1px solid var(--border); outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 6px center; background-size: 10px; }
.status-select.st-ok { background-color: var(--ok-bg); color: var(--ok); border-color: rgba(15,122,74,.28); }
.status-select.st-warn { background-color: #f5f3ff; color: #7c3aed; border-color: rgba(124,58,237,.28); }
.status-select.st-no { background-color: var(--err-bg); color: var(--err); border-color: rgba(194,56,46,.28); }
.status-select.st-late { background-color: #fef3c7; color: #b45309; border-color: rgba(217,119,6,.28); }
.status-select.st-none { background-color: var(--surface-2); color: var(--muted); }

.pager { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: var(--surface-2); border-top: 1px solid var(--border); flex-wrap: wrap; gap: 8px; }
.pager-info { font-size: 11.5px; color: var(--muted); font-weight: 600; }
.pager-ctrl { display: flex; align-items: center; gap: 6px; }
.pager-ctrl select, .pager-btn { padding: 5px 8px; font-size: 11.5px; font-weight: 700; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--surface); cursor: pointer; }

.danger-zone { margin-top: 14px; padding: 12px 16px; background: var(--err-bg); border: 1px solid rgba(194,56,46,.2); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.danger-zone-txt b { color: var(--err); font-size: 13px; display: flex; align-items: center; gap: 6px; }
.danger-zone-txt p { font-size: 11.5px; color: var(--muted); margin-top: 2px; }

/* TEAMS STYLES */
.team-admin { padding: 20px 22px; }
.team-admin-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.team-admin-title { font-size: 16px; font-weight: 800; }
.team-admin-sub { font-size: 12px; color: var(--muted); margin-top: 3px; }
.team-groups-list { display: flex; flex-direction: column; gap: 8px; }
.team-accordion { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; text-align: left; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; color: var(--text); cursor: pointer; transition: .15s; }
.team-accordion:hover { border-color: var(--border-strong); background: #fff; transform: translateY(-1px); box-shadow: var(--shadow); }
.team-accordion-main { min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.team-accordion-name { font-size: 13.5px; font-weight: 800; }
.team-accordion-meta { font-size: 12px; color: var(--muted); }
.team-accordion-counts { display: flex; align-items: center; gap: 6px; flex: none; }
.team-count-pill { padding: 4px 9px; border-radius: 99px; font-size: 11px; font-weight: 800; white-space: nowrap; }
.team-count-pill.free { background: var(--ok-bg); color: var(--ok); }
.team-count-pill.busy { background: var(--warn-bg); color: var(--warn); }

.team-modal-shell { width: min(760px,100%); max-height: 90vh; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 22px; }
.team-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.team-modal-title { font-size: 17px; font-weight: 800; }
.team-now { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.team-create-grid, .team-edit-grid { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr auto; gap: 9px; align-items: end; }
.team-field label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
.team-field input, .team-field select, .team-select { width: 100%; padding: 9px 11px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); font: inherit; font-size: 12.5px; box-sizing: border-box; }
.team-tools { display: grid; grid-template-columns: minmax(220px,1fr) auto auto; gap: 9px; align-items: end; margin-top: 14px; }
.team-members { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.team-member { padding: 11px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); }
.team-member-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.team-member-name { font-size: 12.5px; font-weight: 800; }
.team-availability { display: inline-flex; padding: 3px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 800; }
.team-availability.free { background: var(--ok-bg); color: var(--ok); }
.team-availability.busy { background: var(--warn-bg); color: var(--warn); }
.team-class { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
.team-modal-section { border-top: 1px solid var(--border); margin-top: 15px; padding-top: 14px; }
@media(max-width:700px){ .team-create-grid, .team-edit-grid, .team-tools { grid-template-columns: 1fr; } }

/* TASKS STYLES */
.tasks-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.tasks-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
.tasks-tab { padding: 10px 18px; border: none; background: transparent; font-size: 13.5px; font-weight: 700; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; transition: .15s; font-family: inherit; display: inline-flex; align-items: center; gap: 8px; }
.tasks-tab:hover { color: var(--text); }
.tasks-tab.active { color: var(--text); border-bottom-color: var(--text); }

.tasks-filter-bar {
  display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px;
  padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.tasks-filter-item { display: flex; align-items: center; gap: 6px; }
.tasks-filter-item label { font-size: 11px; font-weight: 700; color: var(--muted); margin: 0; text-transform: uppercase; }
.tasks-filter-item select, .tasks-filter-item input { padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--border-strong); background: var(--surface); }

.tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.task-card {
  padding: 16px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  display: flex; flex-direction: column; gap: 10px; transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s; position: relative;
}
.task-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--border-strong); }
.task-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.task-title { font-size: 14px; font-weight: 800; line-height: 1.35; color: var(--text); }
.task-badge-priority { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; text-transform: uppercase; flex: none; }
.priority-high { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }
.priority-med { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
.priority-low { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
.task-desc { font-size: 12.5px; color: var(--muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.task-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 11.5px; background: var(--surface-2); padding: 8px 10px; border-radius: 8px; }
.task-meta-row { display: flex; flex-direction: column; }
.task-meta-lbl { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
.task-meta-val { font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px; margin-top: auto; gap: 8px; flex-wrap: wrap; }
.task-status-chip { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px; }
.status-todo { background: var(--surface-2); color: var(--muted); border: 1px solid var(--border-strong); }
.status-doing { background: var(--info-bg); color: var(--info); border: 1px solid rgba(42,91,215,0.2); }
.status-done { background: var(--ok-bg); color: var(--ok); border: 1px solid rgba(15,122,74,0.2); }

/* FEEDBACK STYLES */
.fb-privacy-banner { padding: 12px 16px; background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 1px solid #c7d2fe; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 12px; margin-bottom: 16px; font-size: 12.5px; color: #3730a3; font-weight: 600; }
.fb-list { display: flex; flex-direction: column; gap: 10px; }
.fb-item { padding: 16px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 8px; }
.fb-item:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
.fb-item-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.fb-anon-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 800; color: var(--muted); background: var(--surface-2); padding: 3px 9px; border-radius: 99px; }
.fb-type-badge { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
.type-gopy { background: #e0f2fe; color: #0369a1; }
.type-suco { background: #fee2e2; color: #b91c1c; }
.type-muasam { background: #fef3c7; color: #b45309; }
.type-khac { background: #f3e8ff; color: #6b21a8; }
.fb-text { font-size: 13.5px; line-height: 1.55; color: var(--text); background: var(--surface-2); padding: 10px 14px; border-radius: 8px; border-left: 3px solid var(--text); }
.fb-item-bottom { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--muted); gap: 10px; flex-wrap: wrap; }

/* ZALO STYLES */
.zalo-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; }
@media (max-width: 960px) { .zalo-grid { grid-template-columns: 1fr; } }
.switch-wrap { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 14px; }
.switch-control { position: relative; display: inline-block; width: 46px; height: 24px; flex: none; }
.switch-control input { opacity: 0; width: 0; height: 0; }
.switch-slider { position: absolute; cursor: pointer; inset: 0; background-color: var(--border-strong); transition: .3s; border-radius: 99px; }
.switch-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
.switch-control input:checked + .switch-slider { background-color: var(--ok); }
.switch-control input:checked + .switch-slider:before { transform: translateX(22px); }
.zalo-bubble { background: #e8f3ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 16px 18px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; line-height: 1.6; color: #0f172a; box-shadow: 0 4px 14px -4px rgba(37,99,235,0.15); white-space: pre-wrap; }
.zalo-bubble-badge { display: inline-flex; align-items: center; gap: 6px; background: #0068ff; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; margin-bottom: 8px; }

/* TOAST & MODALS */
.toast-wrap { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; max-width: 360px; pointer-events: none; }
.toast { padding: 12px 16px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); display: flex; align-items: flex-start; gap: 11px; font-size: 13px; line-height: 1.5; pointer-events: auto; animation: toastIn .35s cubic-bezier(.22,1,.36,1) both; }
@keyframes toastIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
.toast.out { animation: toastOut .28s ease forwards; }
@keyframes toastOut { to { opacity: 0; transform: translateX(30px) scale(.96); } }
.toast-ic { width: 30px; height: 30px; flex: none; border-radius: 8px; display: grid; place-items: center; font-size: 13px; font-weight: 800; }
.toast.t-ok .toast-ic { background: var(--ok-bg); color: var(--ok); }
.toast.t-err .toast-ic { background: var(--err-bg); color: var(--err); }
.toast.t-warn .toast-ic { background: var(--warn-bg); color: var(--warn); }
.toast.t-info .toast-ic { background: var(--info-bg); color: var(--info); }
.toast-body { flex: 1; min-width: 0; }
.toast-title { font-weight: 800; font-size: 13px; color: var(--text); }
.toast-text { font-size: 12px; color: var(--muted); margin-top: 2px; word-break: break-word; }

.modal-bg { position: fixed; inset: 0; z-index: 9000; background: rgba(21,23,28,.5); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; padding: 20px; }
.modal-bg.show { display: flex; animation: fadeIn .2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); max-width: 440px; width: 100%; padding: 24px 22px; animation: modalIn .3s cubic-bezier(.22,1,.36,1) both; }
@keyframes modalIn { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
.modal-ic { width: 44px; height: 44px; margin-bottom: 12px; border-radius: 12px; display: grid; place-items: center; }
.modal-ic.err { background: var(--err-bg); color: var(--err); font-size: 20px; }
.modal-ic.warn { background: var(--warn-bg); color: var(--warn); font-size: 20px; }
.modal h3 { font-size: 16.5px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px; }
.modal p { font-size: 13px; color: var(--muted); line-height: 1.55; }
.modal-stats { margin: 14px 0 12px; display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.modal-stat { padding: 10px 8px; border-radius: 8px; text-align: center; background: var(--surface-2); border: 1px solid var(--border); }
.modal-stat b { display: block; font-size: 19px; font-weight: 800; line-height: 1.15; }
.modal-stat span { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; color: var(--muted); margin-top: 2px; }
.modal-actions { display: flex; gap: 8px; }
.modal-actions button { flex: 1; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 800; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); transition: .15s; font-family: inherit; cursor: pointer; }
.modal-actions button:hover { background: var(--surface-2); }
.modal-actions button.danger { background: var(--err); color: #fff; border-color: var(--err); }

/* Fullscreen QR */
.qr-panel:fullscreen, .qr-panel:-webkit-full-screen {
  padding: 0; border-radius: 0; position: static; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; height: 100vh; width: 100vw;
}
.qr-panel:fullscreen .qr-panel-title { font-size: 22px; letter-spacing: .15em; margin-bottom: 24px; }
.qr-panel:fullscreen .qr-frame { padding: 24px; border-radius: 20px; box-shadow: none; border: 2px solid #eee; }
.qr-panel:fullscreen #qrCanvas { width: min(70vh,80vw); height: min(70vh,80vw); }
.qr-panel:fullscreen .qr-timestamp { font-size: 16px; margin-top: 20px; }
.qr-panel:fullscreen .qr-timestamp b { font-size: 20px; }
.qr-panel:fullscreen .qr-actions { max-width: min(70vh,80vw); gap: 12px; }
.qr-panel:fullscreen .qr-actions .btn { padding: 14px; font-size: 15px; }

@media (max-width: 768px) {
  .app-wrapper { padding: 10px 12px 30px; }
  .topbar-compact { padding: 8px 12px; top: 6px; margin-bottom: 12px; }
  .brand-titles .brand-section-badge { display: none; }
  .user-profile-chip span { display: none; }
}
</style>
<script src="js/qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js?v=6"></script>
</head>
<body>

<div class="toast-wrap" id="toastWrap"></div>

<!-- SIDEBAR OVERLAY -->
<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

<!-- SIDEBAR DRAWER (Menu Ba Gạch - Đúng chuẩn 8 mục) -->
<aside class="sidebar-drawer" id="sidebarDrawer">
  <div class="sidebar-header">
    <div class="sidebar-brand">
      <div class="brand-logo">LH</div>
      <div>
        <div class="brand-title">LH-NaviX</div>
        <div style="font-size:11px;color:var(--muted);font-weight:600">Quản lý điểm danh xưởng</div>
      </div>
    </div>
    <button class="sidebar-close-btn" onclick="closeSidebar()" title="Đóng menu">✕</button>
  </div>

  <nav class="sidebar-nav">
    <button class="sidebar-nav-item active" id="nav-overview" onclick="navTo('overview')">
      <span class="nav-icon">📊</span>
      <span class="nav-label">Tổng quan</span>
    </button>
    <button class="sidebar-nav-item" id="nav-attendance" onclick="navTo('attendance')">
      <span class="nav-icon">📋</span>
      <span class="nav-label">Điểm danh</span>
      <span class="nav-badge" id="navAttendanceBadge">Phiên</span>
    </button>
    <button class="sidebar-nav-item" id="nav-teams" onclick="navTo('teams')">
      <span class="nav-icon">👥</span>
      <span class="nav-label">Quản lý nhóm</span>
    </button>
    <button class="sidebar-nav-item" id="nav-tasks" onclick="navTo('tasks')">
      <span class="nav-icon">📌</span>
      <span class="nav-label">Nhiệm vụ</span>
      <span class="nav-badge" id="navTasksBadge">5</span>
    </button>
    <button class="sidebar-nav-item" id="nav-schedules" onclick="navTo('schedules')">
      <span class="nav-icon">📅</span>
      <span class="nav-label">Lịch học & rảnh/bận</span>
    </button>
    <button class="sidebar-nav-item" id="nav-feedback" onclick="navTo('feedback')">
      <span class="nav-icon">💬</span>
      <span class="nav-label">Phản hồi ẩn danh</span>
    </button>
    <button class="sidebar-nav-item" id="nav-zalo" onclick="navTo('zalo')">
      <span class="nav-icon">🤖</span>
      <span class="nav-label">Lịch gửi Zalo</span>
    </button>
    <button class="sidebar-nav-item" id="nav-history" onclick="navTo('history')">
      <span class="nav-icon">🕒</span>
      <span class="nav-label">Lịch sử</span>
    </button>
  </nav>

  <div class="sidebar-footer">
    <div class="sidebar-admin-info">
      <div class="user-avatar-mini" id="sidebarAvatar">A</div>
      <div style="min-width:0;flex:1">
        <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="sidebarAdminName">Admin</div>
        <div style="font-size:11px;color:var(--muted)" id="sidebarAdminMssv">—</div>
      </div>
    </div>
    <div class="sidebar-footer-links">
      <a class="sidebar-footer-link" href="lichhoc.html">📅 Xem thời khóa biểu ME →</a>
      <a class="sidebar-footer-link" href="change-password.html">🔒 Đổi mật khẩu tài khoản</a>
      <a class="sidebar-footer-link" href="javascript:void(0)" onclick="logout()" style="color:var(--err)">🚪 Đăng xuất</a>
    </div>
  </div>
</aside>

<div class="app-wrapper">
  <!-- TOPBAR COMPACT -->
  <header class="topbar-compact">
    <div class="topbar-left">
      <button class="btn-hamburger" id="btnHamburger" onclick="toggleSidebar()" title="Mở menu (☰)">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div class="brand-wrap">
        <img src="images/logo.png" alt="" class="brand-logo" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'brand-logo',textContent:'LH'}))">
        <div class="brand-titles">
          <div class="brand-title">LH-NaviX</div>
          <div class="brand-section-badge" id="pageCurrentSection">Tổng quan hệ thống</div>
        </div>
      </div>
    </div>

    <div class="topbar-right">
      <span class="session-pill pill-off" id="topbarSessionPill"><span class="net-dot"></span><span>Đã đóng</span></span>
      <span class="net-badge net-online" id="netBadge"><span class="net-dot"></span><span>Online</span></span>
      <button class="btn" id="btnResetRequests" style="background:#fef3c7;border:none;color:#d97706;font-weight:700;display:none;padding:6px 11px;font-size:12px" onclick="openRequestsModal()">🔔 Yêu cầu (0)</button>
      
      <div class="user-profile-chip" title="Tài khoản Admin">
        <div class="user-avatar-mini" id="topbarAvatar">A</div>
        <span id="adminName">—</span>
        <span style="display:none" id="adminMssv">—</span>
      </div>

      <button class="btn btn-icon btn-danger" onclick="logout()" title="Đăng xuất">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
      </button>
    </div>
  </header>

  <div class="offline-banner" id="offlineBanner">
    <span>⚠️</span><span><b>Mất kết nối mạng.</b> Đang thử kết nối lại...</span>
  </div>

  <!-- MAIN VIEW CONTAINER -->
  <main class="content-area">

    <!-- ==========================================================
         VIEW 1: TỔNG QUAN (OVERVIEW)
         ========================================================== -->
    <section class="app-view active" id="view-overview">
      <div class="overview-layout">
        <!-- Hero Session Status Box -->
        <div class="card hero-session-card" id="heroSessionCard">
          <div class="hero-session-left">
            <div class="hero-session-icon" id="heroSessionIcon">⚡</div>
            <div>
              <div class="hero-session-title" id="heroSessionTitle">Phiên điểm danh hiện tại</div>
              <div class="hero-session-sub" id="heroSessionSubtitle">Đang kiểm tra trạng thái phiên điểm danh...</div>
            </div>
          </div>
          <div class="hero-session-actions" id="heroSessionActions">
            <button class="btn btn-primary" onclick="navTo('attendance')" id="btnHeroGoAttendance">Xem điểm danh →</button>
          </div>
        </div>

        <!-- Dải KPI Cards (Khớp chính xác giao diện ảnh mẫu) -->
        <div class="kpi-grid">
          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỔNG QUÂN SỐ</span>
              <span class="kpi-icon-badge purple-box">👥</span>
            </div>
            <div class="kpi-val text-dark" id="kpiTotalStudents">31</div>
            <div class="kpi-sub">Thành viên đội Robocon (23TD111)</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỈ LỆ CÓ MẶT</span>
              <span class="kpi-icon-badge green-box">📈</span>
            </div>
            <div class="kpi-val text-green" id="kpiPresentRate">57%</div>
            <div class="kpi-sub">Trung bình các phiên gần đây</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỈ LỆ VẮNG</span>
              <span class="kpi-icon-badge pink-box">📉</span>
            </div>
            <div class="kpi-val text-red" id="kpiAbsentRate">43%</div>
            <div class="kpi-sub">Cần cải thiện chuyên cần</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">LỊCH HỌC TRƯỜNG HÔM NAY</span>
              <span class="kpi-icon-badge blue-box">🏫</span>
            </div>
            <div class="kpi-val text-blue" id="kpiBusyCount">29</div>
            <div class="kpi-sub">SV có lịch học trên trường</div>
          </div>
        </div>

        <!-- LUẬT ĐIỂM DANH ROBOCON & GHI CHÚ (TẠO, SỬA, XÓA) -->
        <section class="card rules-widget-card" id="roboconRulesCard">
          <div class="rules-head">
            <div class="rules-title-wrap">
              <div class="rules-icon">📜</div>
              <div>
                <h3 class="rules-title">Luật điểm danh Robocon & Ghi chú xưởng</h3>
                <p class="rules-sub">Quy định giờ giấc, chấm công, trừ điểm chuyên cần và nội quy làm việc tại xưởng.</p>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="resetDefaultRoboconRules()">↻ Khôi phục mẫu</button>
              <button class="btn btn-primary btn-sm" onclick="openAddRuleModal()">＋ Thêm quy định / Ghi chú</button>
            </div>
          </div>

          <div class="rules-list" id="roboconRulesList">
            <!-- Dynamically populated from localStorage/default -->
          </div>
        </section>

        <!-- Bố cục 2 cột Tổng quan -->
        <div class="overview-main-grid">
          <!-- Cột Trái: Tạo phiên + Lịch học hôm nay -->
          <div style="display:flex;flex-direction:column;gap:16px">
            <section class="card session-create-card" id="overviewSessionCreateBox">
              <div class="scc-header">
                <div class="scc-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/></svg>
                </div>
                <div>
                  <h2 class="scc-title">Khởi tạo phiên điểm danh mới</h2>
                  <p class="scc-sub">Mã QR đứng yên — thuận tiện chiếu máy chiếu cả buổi.</p>
                </div>
              </div>

              <div class="session-form">
                <div class="form-field">
                  <label for="quickName">Tên phiên điểm danh *</label>
                  <input type="text" id="quickName" placeholder="VD: Buổi làm Robocon C503">
                </div>
                <div class="form-row-2">
                  <div class="form-field">
                    <label for="quickDuration">Thời lượng (phút)</label>
                    <input type="number" id="quickDuration" value="90" min="1">
                  </div>
                  <button class="btn btn-primary btn-open-session" onclick="openSession()">▶ Mở phiên điểm danh</button>
                </div>
              </div>
            </section>

            <!-- Widget: Lịch học trường hôm nay -->
            <section class="card schedule-widget-card">
              <div class="widget-head">
                <div class="widget-title-wrap">
                  <span class="widget-title">🏫 SV bận học trường hôm nay</span>
                  <span class="count-badge" id="todaySchoolScheduleCount">0 bạn</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="btn btn-secondary" id="btnSyncME" onclick="syncSchedulesFromME()" style="padding:4px 9px;font-size:11.5px;font-weight:700" title="Kéo dữ liệu thời khóa biểu mới nhất từ cổng thông tin ME của trường LHU">🔄 Đồng bộ ME</button>
                  <a href="lichhoc.html" class="widget-link" title="Xem thời khóa biểu chi tiết">Xem TKB →</a>
                </div>
              </div>
              <div class="schedule-list-wrap" id="todaySchoolScheduleList">
                <div class="schedule-loading">Đang tải lịch học hôm nay...</div>
              </div>
            </section>
          </div>

          <!-- Cột Phải: Lịch sử phiên gần đây -->
          <div style="display:flex;flex-direction:column;gap:16px">
            <section class="card history-widget-card">
              <div class="widget-head">
                <div>
                  <div class="widget-title">📋 Lịch sử phiên gần đây</div>
                  <p class="widget-sub">7 phiên gần nhất trong 7 ngày qua</p>
                </div>
                <div class="widget-actions">
                  <button class="btn btn-danger btn-icon" style="width:30px;height:30px" onclick="confirmDeleteHistory()" title="Xóa toàn bộ lịch sử các phiên đã đóng">🗑</button>
                  <button class="btn btn-icon" style="width:30px;height:30px" onclick="loadTodayHistory()" title="Làm mới">↻</button>
                </div>
              </div>
              <div class="history-list-wrap" id="emptyTodayHistoryList">
                <div class="schedule-loading">Đang tải lịch sử...</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 2: ĐIỂM DANH (ATTENDANCE)
         ========================================================== -->
    <section class="app-view" id="view-attendance">
      <div id="emptyState" class="empty-layout" style="display:none">
        <div class="card" style="padding:40px 24px;text-align:center">
          <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:18px;background:var(--surface-2);display:grid;place-items:center;font-size:28px">📋</div>
          <h2 style="font-size:18px;font-weight:800;margin-bottom:6px">Chưa có phiên điểm danh nào đang mở</h2>
          <p style="font-size:13px;color:var(--muted);max-width:420px;margin:0 auto 20px">Hãy quay lại trang Tổng quan để tạo phiên mới hoặc mở lại một phiên cũ từ lịch sử.</p>
          <button class="btn btn-primary" style="margin:0 auto;width:auto;padding:10px 22px" onclick="navTo('overview')">Quay lại Tổng quan để mở phiên</button>
        </div>
      </div>

      <div class="dashboard" id="dashboard" style="display:none">
        <div class="card session-bar">
          <div class="session-bar-left">
            <span class="session-pill pill-on" id="sessionBarPill"><span class="net-dot"></span>Đang mở</span>
            <div style="min-width:0">
              <div class="session-bar-name" id="sessionBarName">—</div>
              <div class="session-bar-meta">
                <span>📅 <span id="sessionStartTime">—</span></span>
                <span>🔑 ID: <code id="sessionIdDisplay">—</code></span>
                <span>⏱ <span id="sessionDurationDisplay">—</span></span>
              </div>
            </div>
            <div class="countdown-chip" id="countdownChip">⏱ <span id="countdownText">--:--</span></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="btnBackToActive" onclick="backFromPastSession()" style="display:none;background:var(--surface-2);border:1px solid var(--border);color:var(--text);font-weight:600">← Quay lại</button>
            <button class="btn btn-primary" id="btnReopenSession" onclick="confirmReopenSession()" style="display:none;background:var(--info);border:none;color:#fff;font-weight:700">🔄 Mở lại phiên</button>
            <button class="btn btn-danger" id="btnCloseSession" onclick="openCloseModal()">■ Đóng phiên</button>
          </div>
        </div>

        <div class="main-grid">
          <aside class="card qr-panel" id="qrPanel">
            <div class="qr-panel-title">Mã QR điểm danh</div>
            <div class="qr-frame"><div id="qrCanvas"></div></div>
            <div class="qr-timestamp">🔒 Sinh lúc <b id="qrBorn">—</b></div>
            <div class="qr-actions">
              <button class="btn btn-refresh" id="btnRefreshQr" onclick="regenerateQR()">🔄 Đổi QR</button>
              <button class="btn" onclick="toggleFullscreen()">⛶ Phóng to</button>
            </div>
            <div class="qr-hint">💡 QR này <b>đứng yên</b> cho đến khi bạn bấm "Đổi QR". Phù hợp chiếu máy chiếu.</div>
            <div class="qr-warning" id="qrWarning"><span>⚠️</span><span><b>Phiên sắp kết thúc.</b> Hãy nhắc sinh viên khẩn trương quét mã.</span></div>
          </aside>

          <section class="card main-panel">
            <div class="stats-grid">
              <div class="stat"><div class="stat-label">Tổng SV</div><div class="stat-num blue" id="statTotal">0</div></div>
              <div class="stat"><div class="stat-label">Có mặt</div><div class="stat-num green" id="statPresent">0</div></div>
              <div class="stat"><div class="stat-label">Đi muộn</div><div class="stat-num amber" id="statLate">0</div></div>
              <div class="stat"><div class="stat-label">Vắng K.phép</div><div class="stat-num red" id="statAbsent">0</div></div>
              <div class="stat"><div class="stat-label">Có phép</div><div class="stat-num purple" id="statExcused">0</div></div>
              <div class="stat" id="statUnmarkedCard" style="display:none"><div class="stat-label">Chưa quét</div><div class="stat-num gray" id="statUnmarked">0</div></div>
            </div>

            <div class="progress-wrap">
              <div class="progress-row">
                <span class="progress-lbl">Tỉ lệ điểm danh</span>
                <span class="progress-pct" id="progressPct">0%</span>
              </div>
              <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
            </div>

            <div class="feed-wrap">
              <div class="feed-header">
                <div class="feed-title"><span class="feed-live-dot"></span><span>Vừa điểm danh</span></div>
              </div>
              <div class="feed-list" id="feedList"><div class="feed-empty">Chưa có ai điểm danh</div></div>
            </div>

            <div class="session-tabs">
              <button class="session-tab active" id="tabBtnStudents" onclick="switchSessionTab('students')">📋 Danh sách điểm danh</button>
              <button class="session-tab" id="tabBtnAudit" onclick="switchSessionTab('audit')">🕒 Lịch sử thay đổi (Audit Log) <span id="auditLogCountBadge" style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:99px;background:rgba(0,0,0,.07)">0</span></button>
            </div>

            <div id="studentsTabPanel">
              <div class="thead-block">
                <div class="thead-top">
                  <div>
                    <div class="thead-title">Danh sách sinh viên</div>
                    <div class="filters" id="filters">
                      <button class="filter active" data-status="all">Tất cả <span class="count">0</span></button>
                      <button class="filter" data-status="present">Có mặt <span class="count">0</span></button>
                      <button class="filter" data-status="late">Đi muộn <span class="count">0</span></button>
                      <button class="filter" data-status="absent">Vắng K.phép <span class="count">0</span></button>
                      <button class="filter" data-status="excused">Có phép <span class="count">0</span></button>
                      <button class="filter" data-status="unmarked" id="filterUnmarked" style="display:none">Chưa điểm danh <span class="count">0</span></button>
                    </div>
                  </div>
                  <div class="thead-actions">
                    <div class="search-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input type="text" id="searchInput" placeholder="Tìm tên hoặc MSSV...">
                    </div>
                    <button class="btn" style="background:#0ea5e9;color:#fff;border:none" onclick="copyAttendanceList()">📋 Copy</button>
                    <button class="btn btn-danger" onclick="confirmMarkAllAbsent()">✗ Vắng tất cả</button>
                    <button class="btn btn-success" onclick="confirmMarkAllPresent()">✓ Có mặt tất cả</button>
                  </div>
                </div>
              </div>

              <div class="tbl-wrap">
                <div class="tbl-scroll">
                  <table>
                    <thead><tr><th style="width:40%">Sinh viên</th><th style="width:18%">MSSV</th><th style="width:24%">Trạng thái</th><th style="width:18%">Thời gian</th></tr></thead>
                    <tbody id="studentTbody"></tbody>
                  </table>
                </div>
                <div class="pager">
                  <div class="pager-info" id="pagerInfo">—</div>
                  <div class="pager-ctrl">
                    <select id="pagerSize">
                      <option value="10">10 / trang</option>
                      <option value="20" selected>20 / trang</option>
                      <option value="50">50 / trang</option>
                      <option value="100">100 / trang</option>
                    </select>
                    <button class="pager-btn" id="pagerPrev">‹ Trước</button>
                    <span class="pager-info" style="padding:0 4px" id="pagerNum"><b>1</b>/1</span>
                    <button class="pager-btn" id="pagerNext">Sau ›</button>
                  </div>
                </div>
              </div>
            </div>

            <div id="auditLogPanel" style="display:none">
              <div class="tbl-wrap" style="padding:16px;background:var(--surface)">
                <div id="auditLogList">
                  <div style="text-align:center;padding:24px;color:var(--muted);font-style:italic">Đang tải lịch sử thay đổi...</div>
                </div>
              </div>
            </div>

            <div class="today-history" id="todayHistoryWrap" style="display:none">
              <div class="today-history-head">
                <div>
                  <div class="thead-title">Lịch sử phiên gần đây</div>
                  <p style="font-size:12px;color:var(--muted);margin-top:2px">7 phiên gần nhất trong 7 ngày qua</p>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-danger" onclick="confirmDeleteHistory()" title="Xóa toàn bộ lịch sử điểm danh">🗑 Xóa lịch sử</button>
                  <button class="btn btn-icon" onclick="loadTodayHistory()" title="Làm mới">↻</button>
                </div>
              </div>
              <div id="todayHistoryList"></div>
            </div>

            <div class="danger-zone">
              <div class="danger-zone-txt">
                <b>⚠️ Đóng phiên điểm danh</b>
                <p>Sau khi đóng, sinh viên không thể điểm danh được nữa.</p>
              </div>
              <button class="btn btn-danger" style="padding:9px 18px;font-size:13px" onclick="openCloseModal()">■ Đóng phiên</button>
            </div>
          </section>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 3: QUẢN LÝ NHÓM (TEAMS)
         ========================================================== -->
    <section class="app-view" id="view-teams">
      <section class="card team-admin" id="teamManagement" style="margin:0">
        <div class="team-admin-head">
          <div>
            <div class="team-admin-title">👥 Danh sách nhóm & Phân ca</div>
            <div class="team-admin-sub">Tạo nhóm theo lĩnh vực, chọn đội trưởng và theo dõi lịch rảnh / bận của thành viên.</div>
          </div>
          <button class="btn btn-primary" onclick="openCreateTeamModal()">＋ Tạo nhóm mới</button>
        </div>
        <div id="teamGroupsList" class="team-groups-list"><div class="schedule-loading">Đang tải nhóm...</div></div>
      </section>
    </section>

    <!-- ==========================================================
         VIEW 4: NHIỆM VỤ (TASKS)
         ========================================================== -->
    <section class="app-view" id="view-tasks">
      <div class="tasks-header">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">📌 Quản lý nhiệm vụ xưởng & đội Robocon</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Phân công công việc theo nhóm hoặc cá nhân, theo dõi tiến độ và hạn hoàn thành.</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateTaskModal()">＋ Giao nhiệm vụ mới</button>
      </div>

      <div class="tasks-tabs">
        <button class="tasks-tab active" id="tabTaskGroup" onclick="switchTaskTab('group')">
          👥 Nhiệm vụ chung (Nhóm/Xưởng) <span class="count-badge" id="countGroupTasks">3</span>
        </button>
        <button class="tasks-tab" id="tabTaskPersonal" onclick="switchTaskTab('personal')">
          👤 Nhiệm vụ cá nhân <span class="count-badge" id="countPersonalTasks">2</span>
        </button>
      </div>

      <div class="tasks-filter-bar">
        <div class="tasks-filter-item">
          <label>Nhóm:</label>
          <select id="taskFilterGroup" onchange="applyTaskFilters()">
            <option value="all">Tất cả nhóm</option>
            <option value="Cơ khí">Đội Cơ khí</option>
            <option value="Lập trình">Đội Lập trình - AI</option>
            <option value="Mạch - Điện">Đội Phần cứng - Điện tử</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Trạng thái:</label>
          <select id="taskFilterStatus" onchange="applyTaskFilters()">
            <option value="all">Tất cả</option>
            <option value="todo">Chưa bắt đầu</option>
            <option value="doing">Đang làm</option>
            <option value="done">Hoàn thành</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Ưu tiên:</label>
          <select id="taskFilterPriority" onchange="applyTaskFilters()">
            <option value="all">Tất cả</option>
            <option value="high">Cao 🔥</option>
            <option value="med">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </div>

        <div class="search-wrap" style="margin-left:auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="taskSearchInput" placeholder="Tìm tên nhiệm vụ..." oninput="applyTaskFilters()">
        </div>
      </div>

      <div class="tasks-grid" id="tasksListGrid">
        <div class="task-card" data-type="group" data-group="Cơ khí" data-status="doing" data-priority="high">
          <div class="task-card-top">
            <span class="task-title">Gia công khung gầm Robot tự hành v2</span>
            <span class="task-badge-priority priority-high">Cao 🔥</span>
          </div>
          <p class="task-desc">Cắt nhôm định hình 2020, phay mặt bích động cơ bước và lắp ráp hoàn chỉnh hệ thống treo bánh omni.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin (Võ Duy Khang)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm / Lĩnh vực</span><span class="task-meta-val">Đội Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Toàn đội Cơ khí (4 SV)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val" style="color:var(--err)">12/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Gia công khung gầm Robot tự hành v2', 'Cắt nhôm định hình 2020, phay mặt bích động cơ bước và lắp ráp hoàn chỉnh hệ thống treo bánh omni.', 'Đội Cơ khí', 'Toàn đội Cơ khí', 'Cao', '12/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Hoàn tất</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="group" data-group="Lập trình" data-status="doing" data-priority="high">
          <div class="task-card-top">
            <span class="task-title">Tối ưu thuật toán quét LiDAR & Định vị SLAM</span>
            <span class="task-badge-priority priority-high">Cao 🔥</span>
          </div>
          <p class="task-desc">Xử lý lọc nhiễu pointcloud từ cảm biến LiDAR RPLIDAR A1 và kết hợp bộ lọc Kalman cho IMU 9 trục.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Đội trưởng (Huỳnh Tuấn Tú)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm / Lĩnh vực</span><span class="task-meta-val">Lập trình - AI</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Cả nhóm Lập trình</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">15/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Tối ưu thuật toán quét LiDAR & Định vị SLAM', 'Xử lý lọc nhiễu pointcloud từ cảm biến LiDAR RPLIDAR A1 và kết hợp bộ lọc Kalman cho IMU 9 trục.', 'Lập trình - AI', 'Cả nhóm Lập trình', 'Cao', '15/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Hoàn tất</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="personal" data-group="Cơ khí" data-status="doing" data-priority="med">
          <div class="task-card-top">
            <span class="task-title">Vẽ 3D cụm gắp bóng khí nén trên SolidWorks</span>
            <span class="task-badge-priority priority-med">Trung bình</span>
          </div>
          <p class="task-desc">Thiết kế ngàm kẹp 3 chấu ăn khớp xi lanh dẫn hướng SMC và xuất file in 3D nhựa PETG.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Đội trưởng Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val">Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Dương Công Mạnh (125001343)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">11/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Vẽ 3D cụm gắp bóng khí nén trên SolidWorks', 'Thiết kế ngàm kẹp 3 chấu ăn khớp xi lanh dẫn hướng SMC và xuất file in 3D nhựa PETG.', 'Cơ khí', 'Dương Công Mạnh (125001343)', 'Trung bình', '11/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Xong</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 5: LỊCH HỌC & RẢNH/BẬN (SCHEDULES)
         ========================================================== -->
    <section class="app-view" id="view-schedules">
      <section class="card schedule-widget-card" style="margin:0">
        <div class="widget-head">
          <div>
            <div class="widget-title">📅 Thời khóa biểu & Sinh viên bận học hôm nay</div>
            <p class="widget-sub">Đối chiếu ca học để tự động phân phép khi mở xưởng</p>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" onclick="syncSchedulesFromME()">🔄 Đồng bộ từ ME</button>
            <a href="lichhoc.html" class="btn btn-primary">Xem lưới TKB chi tiết →</a>
          </div>
        </div>
        <div class="schedule-list-wrap" style="max-height:600px" id="schedulesFullList"></div>
      </section>
    </section>

    <!-- ==========================================================
         VIEW 6: PHẢN HỒI ẨN DANH (FEEDBACK)
         ========================================================== -->
    <section class="app-view" id="view-feedback">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">💬 Hộp thư phản hồi & Đóng góp ý kiến ẩn danh</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Tiếp nhận ý kiến đóng góp, báo cáo hỏng hóc hoặc đề xuất thiết bị từ thành viên xưởng.</p>
        </div>
        <button class="btn btn-secondary" onclick="openStudentFeedbackModal()">📝 Thử gửi phản hồi ẩn danh (Demo SV)</button>
      </div>

      <div class="fb-privacy-banner">
        <span style="font-size:18px">🛡️</span>
        <div>
          <b>Cam kết bảo mật danh tính tuyệt đối:</b> Giao diện và hệ thống hoàn toàn <u>không lưu hay hiển thị</u> tên, MSSV, IP hay bất kỳ thông tin nhận diện nào của người gửi.
        </div>
      </div>

      <div class="tasks-filter-bar">
        <div class="tasks-filter-item">
          <label>Loại ý kiến:</label>
          <select id="fbFilterType" onchange="applyFeedbackFilters()">
            <option value="all">Tất cả loại</option>
            <option value="gopy">💡 Góp ý xưởng</option>
            <option value="suco">⚠️ Báo hỏng / Sự cố</option>
            <option value="muasam">🛠 Đề xuất thiết bị</option>
            <option value="khac">💬 Khác</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Trạng thái:</label>
          <select id="fbFilterStatus" onchange="applyFeedbackFilters()">
            <option value="all">Tất cả</option>
            <option value="new">Mới nhận</option>
            <option value="seen">Đã xem</option>
            <option value="resolved">Đã xử lý</option>
          </select>
        </div>
      </div>

      <div class="fb-list" id="feedbackList">
        <div class="fb-item" data-type="muasam" data-status="new">
          <div class="fb-item-top">
            <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-8842</span>
            <span class="fb-type-badge type-muasam">🛠 Đề xuất mua sắm</span>
          </div>
          <div class="fb-text">
            Xưởng đang thiếu mỏ hàn thiếc mũi nhọn và chì hàn không chì loại tốt. Đội mạch hàn IC dán rất khó thao tác vì mũi hàn cũ bị mòn. Nhờ Admin đề xuất trường cấp thêm 2 bộ hàn Hakko T12 ạ.
          </div>
          <div class="fb-item-bottom">
            <span>📅 Gửi lúc 10:15 hôm nay (09/10/2026)</span>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="task-status-chip status-doing">🔵 Mới nhận</span>
              <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
            </div>
          </div>
        </div>

        <div class="fb-item" data-type="suco" data-status="seen">
          <div class="fb-item-top">
            <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-8839</span>
            <span class="fb-type-badge type-suco">⚠️ Báo cáo sự cố</span>
          </div>
          <div class="fb-text">
            Ổ cắm điện ở góc bàn gia công cơ khí bị lỏng chân cắm và có hiện tượng xẹt tia lửa điện khi cắm máy cắt cầm tay. Các bạn cẩn thận khi sử dụng khu vực này.
          </div>
          <div class="fb-item-bottom">
            <span>📅 Gửi lúc 16:40 hôm qua (08/10/2026)</span>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="task-status-chip status-review">🟡 Đã xem</span>
              <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 7: LỊCH GỬI ZALO (ZALO AUTOMATION)
         ========================================================== -->
    <section class="app-view" id="view-zalo">
      <div style="margin-bottom:16px">
        <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">🤖 Cài đặt tự động gửi lịch rảnh ngày mai lên Zalo</h2>
        <p style="font-size:12px;color:var(--muted);margin-top:2px">Tự động tổng hợp danh sách thành viên rảnh vào ngày mai và gửi tin nhắn lên nhóm Zalo xưởng vào khung giờ cố định.</p>
      </div>

      <div class="zalo-grid">
        <div style="display:flex;flex-direction:column;gap:14px">
          <section class="card" style="padding:20px 22px">
            <div class="switch-wrap">
              <label class="switch-control">
                <input type="checkbox" id="zaloAutoToggle" checked onchange="toggleZaloAuto(this.checked)">
                <span class="switch-slider"></span>
              </label>
              <div>
                <b style="font-size:13.5px;display:block" id="zaloSwitchLabel">Tự động gửi lịch hàng ngày: ĐANG BẬT</b>
                <span style="font-size:11.5px;color:var(--muted)">Hệ thống sẽ quét thời khóa biểu ngày mai và tự động phát thông báo.</span>
              </div>
            </div>

            <div class="form-field" style="margin-bottom:12px">
              <label for="zaloSendHour">Khung giờ gửi hàng ngày:</label>
              <input type="time" id="zaloSendHour" value="20:00" style="font-weight:700;font-size:15px;width:160px">
            </div>

            <div class="form-field" style="margin-bottom:16px">
              <label for="zaloGroupSelect">Nhóm Zalo nhận thông báo:</label>
              <select id="zaloGroupSelect">
                <option value="g1">👥 Nhóm Zalo: Robocon 2026 - Xưởng C503 (Chính thức)</option>
                <option value="g2">👥 Nhóm Zalo: Đội Trọng Điểm LH-NaviX</option>
              </select>
            </div>

            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onclick="toast('ok', 'Đã lưu cài đặt', 'Lịch tự động Zalo được đặt lúc 20:00 hàng ngày.')">💾 Lưu cấu hình</button>
              <button class="btn btn-secondary" onclick="simulateZaloSend()">🧪 Gửi thử tin nhắn ngay</button>
            </div>
          </section>

          <section class="card" style="padding:20px 22px">
            <h3 style="font-size:14px;font-weight:800;margin-bottom:12px">📜 Lịch sử các lần tự động gửi tin</h3>
            <div class="tbl-wrap">
              <table>
                <thead><tr><th>Thời gian</th><th>Nhóm nhận</th><th>Trạng thái</th></tr></thead>
                <tbody id="zaloHistoryTbody">
                  <tr><td>Hôm nay 20:00</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (22 rảnh)</span></td></tr>
                  <tr><td>08/10 20:00</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (19 rảnh)</span></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div>
          <section class="card" style="padding:20px 22px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <div class="widget-title">📱 Khung xem trước tin nhắn Zalo</div>
              <button class="btn btn-sm" onclick="generateZaloPreviewText()">↻ Cập nhật mẫu</button>
            </div>
            
            <div class="zalo-bubble">
              <div class="zalo-bubble-badge">💬 Tin nhắn Zalo Bot</div>
<div id="zaloMessagePreview">[THÔNG BÁO LỊCH RẢNH NGÀY MAI - THỨ BẢY 10/10]
🤖 Xưởng Robocon LH-NaviX (Phòng C503)

✅ THÀNH VIÊN RẢNH CẢ NGÀY (18 bạn):
 • Võ Duy Khang (123001058)
 • Dương Công Mạnh (125001343)
 • Nguyễn Văn Trung (123000651)
 • Phan Nhật Nam (124000534)
 • ... và 14 thành viên khác

⚠️ THÀNH VIÊN CÓ LỊCH HỌC TRƯỜNG (4 bạn):
 • Huỳnh Tuấn Tú: Bận Tiết 1-4 (Phòng G306)

📌 Đề nghị các bạn có mặt đúng 07:30 tại xưởng!</div>
            </div>
          </section>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 8: LỊCH SỬ (HISTORY)
         ========================================================== -->
    <section class="app-view" id="view-history">
      <section class="card history-widget-card" style="margin:0">
        <div class="widget-head">
          <div>
            <div class="widget-title">🕒 Lịch sử các phiên điểm danh</div>
            <p class="widget-sub">Xem lại kết quả, sửa đổi và thống kê chuyên cần</p>
          </div>
          <div class="widget-actions">
            <button class="btn btn-danger" onclick="confirmDeleteHistory()">🗑 Xóa toàn bộ lịch sử</button>
            <button class="btn btn-icon" onclick="loadTodayHistory()">↻</button>
          </div>
        </div>
        <div class="history-list-wrap" style="max-height:650px" id="historyFullList"></div>
      </section>
    </section>

  </main>
</div>

<!-- ==========================================================
     ALL MODALS
     ========================================================== -->
<!-- Modal Thêm / Chỉnh Sửa Luật Điểm Danh & Ghi Chú -->
<div class="modal-bg" id="ruleEditModal" onclick="if(event.target===this)closeRuleEditModal()">
  <div class="modal" style="max-width:480px;text-align:left">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:10px;background:#fef3c7;color:#b45309;display:grid;place-items:center;font-size:18px">📜</div>
      <div>
        <h3 style="margin:0;font-size:16px" id="ruleModalHeading">Thêm quy định / ghi chú mới</h3>
        <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Quy định áp dụng cho toàn bộ thành viên xưởng Robocon</p>
      </div>
    </div>

    <input type="hidden" id="editRuleId" value="">

    <div class="form-field" style="margin-bottom:12px">
      <label for="ruleTitleInput">Tiêu đề quy định / Ghi chú *</label>
      <input type="text" id="ruleTitleInput" placeholder="VD: ⏰ Giờ điểm danh ca sáng" required>
    </div>

    <div class="form-field" style="margin-bottom:16px">
      <label for="ruleContentInput">Nội dung chi tiết & Mức phạt / Chế tài *</label>
      <textarea id="ruleContentInput" rows="3" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="Chi tiết quy định và hình thức xử lý khi vi phạm..."></textarea>
    </div>

    <div class="modal-actions">
      <button onclick="closeRuleEditModal()">Huỷ</button>
      <button class="btn btn-primary" onclick="saveRoboconRule()">💾 Lưu quy định</button>
    </div>
  </div>
</div>

<!-- Modal Giao Nhiệm Vụ Mới -->
<div class="modal-bg" id="taskCreateModal" onclick="if(event.target===this)closeTaskCreateModal()">
  <div class="team-modal-shell" style="max-width:540px">
    <div class="team-modal-head">
      <div>
        <div class="team-modal-title">Giao nhiệm vụ mới</div>
        <div class="team-now">Phân công công việc cho cả nhóm hoặc từng cá nhân</div>
      </div>
      <button class="btn btn-icon" onclick="closeTaskCreateModal()">✕</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">
      <div class="form-field">
        <label for="taskNewTitle">Tiêu đề nhiệm vụ *</label>
        <input type="text" id="taskNewTitle" placeholder="VD: Thiết kế ngàm kẹp khí nén..." required>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field">
          <label for="taskNewType">Phạm vi:</label>
          <select id="taskNewType" onchange="toggleTaskAssigneeSelect(this.value)">
            <option value="group">👥 Cho cả nhóm</option>
            <option value="personal">👤 Cho cá nhân</option>
          </select>
        </div>
        <div class="form-field">
          <label for="taskNewGroup">Nhóm / Lĩnh vực:</label>
          <select id="taskNewGroup">
            <option value="Cơ khí">Đội Cơ khí</option>
            <option value="Lập trình">Đội Lập trình - AI</option>
            <option value="Mạch - Điện">Đội Mạch - Điện tử</option>
          </select>
        </div>
      </div>

      <div class="form-field" id="taskAssigneeField" style="display:none">
        <label for="taskNewAssignee">Người nhận cụ thể:</label>
        <select id="taskNewAssignee">
          <option value="Dương Công Mạnh (125001343)">Dương Công Mạnh (125001343)</option>
          <option value="Huỳnh Tuấn Tú (123000078)">Huỳnh Tuấn Tú (123000078)</option>
          <option value="Nguyễn Văn Trung (123000651)">Nguyễn Văn Trung (123000651)</option>
        </select>
      </div>

      <div class="form-field">
        <label for="taskNewDesc">Mô tả & Yêu cầu kỹ thuật:</label>
        <textarea id="taskNewDesc" rows="3" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical" placeholder="Ghi chú chi tiết yêu cầu, thông số cần đạt..."></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field">
          <label for="taskNewPriority">Mức ưu tiên:</label>
          <select id="taskNewPriority">
            <option value="high">🔥 Cao</option>
            <option value="med" selected>🟡 Trung bình</option>
            <option value="low">⚪ Thấp</option>
          </select>
        </div>
        <div class="form-field">
          <label for="taskNewDueDate">Hạn hoàn thành:</label>
          <input type="date" id="taskNewDueDate">
        </div>
      </div>

      <div class="modal-actions" style="margin-top:10px">
        <button onclick="closeTaskCreateModal()">Huỷ</button>
        <button class="btn btn-primary" onclick="submitCreateTask()">✓ Tạo & Giao nhiệm vụ</button>
      </div>
    </div>
  </div>
</div>

<!-- Modal Chi Tiết Nhiệm Vụ -->
<div class="modal-bg" id="taskDetailModal" onclick="if(event.target===this)closeTaskDetailModal()">
  <div class="modal" style="max-width:500px;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
      <h3 id="taskDetailTitle" style="font-size:16px;margin:0">Tiêu đề nhiệm vụ</h3>
      <span id="taskDetailPriority" class="task-badge-priority priority-high">Cao</span>
    </div>
    
    <div id="taskDetailDesc" style="font-size:13px;line-height:1.6;color:var(--muted);background:var(--surface-2);padding:12px 14px;border-radius:8px;margin-bottom:14px">Mô tả</div>

    <div class="task-meta-grid" style="margin-bottom:16px">
      <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val" id="taskDetailGroup">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val" id="taskDetailAssignee">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val" id="taskDetailDue">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Trạng thái</span><span class="task-meta-val" id="taskDetailStatus">—</span></div>
    </div>

    <div class="modal-actions">
      <button onclick="closeTaskDetailModal()">Đóng</button>
      <button class="btn btn-primary" onclick="toast('ok', 'Đã đánh dấu', 'Đã lưu trạng thái'); closeTaskDetailModal()">Đánh dấu đã đọc</button>
    </div>
  </div>
</div>

<!-- Modal Gửi Phản Hồi Ẩn Danh (Sinh viên) -->
<div class="modal-bg" id="studentFeedbackModal" onclick="if(event.target===this)closeStudentFeedbackModal()">
  <div class="modal" style="max-width:480px;text-align:left">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:10px;background:#e0f2fe;color:#0369a1;display:grid;place-items:center;font-size:18px">💬</div>
      <div>
        <h3 style="margin:0;font-size:16px">Gửi phản hồi ẩn danh</h3>
        <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Ý kiến của bạn sẽ được ẩn danh hoàn toàn 100%.</p>
      </div>
    </div>

    <div class="form-field" style="margin-bottom:12px">
      <label for="fbSendType">Loại ý kiến / phản hồi:</label>
      <select id="fbSendType">
        <option value="gopy">💡 Góp ý xây dựng xưởng</option>
        <option value="suco">⚠️ Báo cáo hỏng hóc thiết bị / an toàn</option>
        <option value="muasam">🛠 Đề xuất mua sắm linh kiện / vật tư</option>
        <option value="khac">💬 Ý kiến đóng góp khác</option>
      </select>
    </div>

    <div class="form-field" style="margin-bottom:16px">
      <label for="fbSendContent">Nội dung phản hồi:</label>
      <textarea id="fbSendContent" rows="4" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="Nhập chi tiết ý kiến, phản ánh của bạn..."></textarea>
    </div>

    <div class="modal-actions">
      <button onclick="closeStudentFeedbackModal()">Huỷ</button>
      <button class="btn btn-primary" onclick="submitStudentFeedback()">🔒 Gửi ẩn danh ngay</button>
    </div>
  </div>
</div>

<!-- Modal Team Groups & Attendance Modals -->
<div class="modal-bg" id="teamCreateModal" onclick="if(event.target===this)closeTeamCreateModal()">
  <div class="team-modal-shell" style="max-width:500px">
    <div class="team-modal-head"><div><div class="team-modal-title">Tạo nhóm mới</div><div class="team-now">Chọn tên, lĩnh vực và đội trưởng.</div></div><button class="btn btn-icon" onclick="closeTeamCreateModal()">✕</button></div>
    <div class="team-create-grid" style="grid-template-columns:1fr;margin-top:12px">
      <div class="team-field"><label for="newTeamName">Tên nhóm</label><input id="newTeamName" maxlength="100" placeholder="VD: Đội cơ khí"></div>
      <div class="team-field"><label for="newTeamField">Lĩnh vực</label><input id="newTeamField" maxlength="120" placeholder="VD: Cơ khí"></div>
      <div class="team-field"><label for="newTeamLeader">Đội trưởng</label><select id="newTeamLeader"></select></div>
      <button class="btn btn-primary" onclick="createTeamGroup()">＋ Tạo nhóm</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="teamModal" onclick="if(event.target===this)closeTeamModal()">
  <div class="team-modal-shell">
    <div class="team-modal-head"><div><div class="team-modal-title" id="teamModalTitle">Quản lý nhóm</div><div class="team-now" id="teamNowLabel">Đang cập nhật lịch theo giờ Việt Nam</div></div><button class="btn btn-icon" onclick="closeTeamModal()">✕</button></div>
    <div class="team-edit-grid">
      <div class="team-field"><label for="editTeamName">Tên nhóm</label><input id="editTeamName" maxlength="100"></div>
      <div class="team-field"><label for="editTeamField">Lĩnh vực</label><input id="editTeamField" maxlength="120"></div>
      <div class="team-field"><label for="editTeamLeader">Đội trưởng</label><select id="editTeamLeader"></select></div>
      <div style="display:flex;gap:6px"><button class="btn btn-success" onclick="saveTeamGroup()">Lưu</button><button class="btn btn-danger" onclick="deleteTeamGroup()">Xóa</button></div>
    </div>
    <div class="team-modal-section">
      <div class="team-tools" style="margin-top:0">
        <div class="team-field"><label for="teamMemberPicker">Thêm thành viên</label><select class="team-select" id="teamMemberPicker"></select></div>
        <button class="btn btn-primary" onclick="addTeamMember()">＋ Thêm thành viên</button>
        <span class="team-admin-sub" id="teamMemberCount"></span>
      </div>
    </div>
    <div class="team-modal-section"><div class="team-modal-title" style="font-size:13px">Lịch hôm nay <span style="font-weight:500;color:var(--muted)">· giờ Việt Nam</span></div>
      <div id="teamMemberList" class="team-members"><div class="schedule-loading">Đang tải thành viên và lịch...</div></div>
    </div>
  </div>
</div>

<div class="modal-bg" id="closeModal">
  <div class="modal">
    <div class="modal-ic err">⚠</div>
    <h3>Đóng phiên điểm danh?</h3>
    <p>Sinh viên sẽ không thể điểm danh được nữa. Bạn vẫn xem được lịch sử trong mục "Lịch sử".</p>
    <div class="modal-stats">
      <div class="modal-stat"><b class="stat-num green" style="font-size:22px" id="modalPresent">0</b><span>Đã ĐD</span></div>
      <div class="modal-stat"><b class="stat-num red" style="font-size:22px" id="modalAbsent">0</b><span>Vắng</span></div>
      <div class="modal-stat"><b class="stat-num gray" style="font-size:22px" id="modalUnmarked">0</b><span>Chưa quét</span></div>
    </div>
    <p id="modalWarnText" style="font-size:12.5px;color:var(--err);background:var(--err-bg);padding:10px 12px;border-radius:8px;border:1px solid rgba(194,56,46,.18);display:none"></p>
    <div class="modal-actions" style="margin-top:16px">
      <button onclick="closeModalFn()">Huỷ</button>
      <button class="danger" onclick="confirmCloseSession()">■ Đóng phiên</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="bulkModal">
  <div class="modal">
    <div class="modal-ic warn">⚠</div>
    <h3 id="bulkTitle">Xác nhận</h3>
    <p id="bulkText">Bạn có chắc không?</p>
    <div class="modal-actions" style="margin-top:20px">
      <button onclick="closeBulkModal()">Huỷ</button>
      <button class="danger" id="bulkConfirmBtn">Xác nhận</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="reopenModal">
  <div class="modal">
    <div class="modal-ic" style="background:var(--info-bg);color:var(--info)">🔄</div>
    <h3>Mở lại phiên điểm danh</h3>
    <p>Bạn có chắc muốn mở lại phiên này? Phiên sẽ chuyển thành <b>Đang mở</b>, sinh viên có thể tiếp tục quét mã QR.</p>
    <div class="modal-actions" style="margin-top:20px">
      <button onclick="closeReopenModal()">Huỷ</button>
      <button class="primary" style="background:var(--info);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer" onclick="executeReopenSession()">✓ Mở lại phiên</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="resetPwdModal">
  <div class="modal">
    <div class="modal-ic" style="background:#dcfce7;color:#16a34a">🔑</div>
    <h3>Đã cấp mật khẩu mới</h3>
    <p style="color:var(--err); font-weight: 600;">⚠️ Chỉ gửi password này cho đúng sinh viên.</p>
    <div style="background:#f1f5f9;padding:12px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:1px;color:#0f172a;display:flex;justify-content:space-between;align-items:center;">
      <span id="tempPwdText"></span>
      <button class="btn" style="background:#e2e8f0;border:none;padding:6px 10px;border-radius:6px;font-size:13px;cursor:pointer" onclick="navigator.clipboard.writeText(document.getElementById('tempPwdText').innerText).then(()=>toast('ok','Đã copy','Mật khẩu tạm đã được copy'))">Copy</button>
    </div>
    <div class="modal-actions">
      <button class="btn-ok" onclick="document.getElementById('resetPwdModal').classList.remove('show')">Đóng</button>
      <button class="btn" style="background:#3b82f6;color:#fff;border:none;display:none" id="btnCompleteReset" onclick="completeResetRequest()">Đã gửi cho sinh viên</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="requestsModal" onclick="if(event.target===this)closeRequestsModal()">
  <div class="modal" style="max-width: 600px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <h3 style="margin:0;">🔔 Yêu cầu cấp mật khẩu</h3>
      <button class="btn btn-icon btn-sm" onclick="fetchResetRequests()" title="Làm mới">↻</button>
    </div>
    <div class="tbl-wrap">
      <div class="tbl-scroll" style="max-height:300px;">
        <table>
          <thead><tr><th style="width:40%">Sinh viên</th><th style="width:30%">MSSV</th><th style="width:30%; text-align:right;">Thao tác</th></tr></thead>
          <tbody id="requestsTbody">
            <tr><td colspan="3"><div class="tbl-empty">Đang tải...</div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:20px;">
      <button onclick="closeRequestsModal()">Đóng</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="reasonModal">
  <div class="modal" style="text-align:left;max-width:440px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div class="modal-ic" style="margin:0;width:40px;height:40px;font-size:18px;background:var(--info-bg);color:var(--info);display:grid;place-items:center;border-radius:10px">✏️</div>
      <div>
        <h3 style="margin:0;font-size:16px">Cập nhật điểm danh</h3>
        <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted)" id="reasonStudentInfo">—</p>
      </div>
    </div>
    
    <div class="form-field" style="margin-bottom:12px">
      <label for="reasonModalSelect" style="display:block;font-size:11.5px;font-weight:700;margin-bottom:5px;color:var(--muted)">TRẠNG THÁI MỚI:</label>
      <select id="reasonModalSelect" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-size:13.5px;font-weight:600;outline:none;font-family:inherit;background:var(--surface)">
        <option value="có mặt">🟢 Có mặt</option>
        <option value="đi muộn">🟡 Đi muộn</option>
        <option value="vắng có phép">🟣 Vắng có phép</option>
        <option value="vắng không phép">🔴 Vắng không phép</option>
      </select>
    </div>

    <div class="form-field" style="margin-bottom:14px">
      <label for="reasonInput" style="display:block;font-size:11.5px;font-weight:700;margin-bottom:5px;color:var(--muted)">LÝ DO THAY ĐỔI (LƯU VÀO AUDIT LOG):</label>
      <input type="text" id="reasonInput" placeholder="VD: SV xin vào muộn, điểm danh bù, nhầm lẫn..." style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-size:13px;outline:none;font-family:inherit">
    </div>

    <div class="modal-actions" style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
      <button onclick="closeReasonModal()" style="padding:10px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);cursor:pointer;font-family:inherit;font-weight:600">Huỷ</button>
      <button id="reasonConfirmBtn" onclick="executeStatusChange()" style="background:var(--text);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit">Lưu thay đổi</button>
    </div>
  </div>
</div>
"""

# Script controller functions to inject into original JS
controllers_js = """
<script>
/* ==========================================================
   VIEW ROUTING & SIDEBAR DRAWER CONTROLLER
   ========================================================== */
let currentView = 'overview';

const viewTitlesMap = {
  overview: 'Tổng quan hệ thống',
  attendance: 'Phiên điểm danh',
  teams: 'Quản lý nhóm',
  tasks: 'Nhiệm vụ xưởng & Đội Robocon',
  schedules: 'Lịch học & rảnh/bận',
  feedback: 'Phản hồi ẩn danh',
  zalo: 'Lịch gửi Zalo',
  history: 'Lịch sử'
};

function navTo(viewName) {
  currentView = viewName;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.classList.add('active');
  const targetNav = document.getElementById('nav-' + viewName);
  if (targetNav) targetNav.classList.add('active');

  const pageTitle = document.getElementById('pageCurrentSection');
  if (pageTitle) pageTitle.textContent = viewTitlesMap[viewName] || 'Tổng quan';

  closeSidebar();

  if (viewName === 'teams' && typeof loadTeamGroups === 'function') loadTeamGroups();
  else if (viewName === 'schedules' && typeof loadTodaySchoolSchedule === 'function') loadTodaySchoolSchedule();
  else if (viewName === 'history' && typeof loadTodayHistory === 'function') loadTodayHistory();
  else if (viewName === 'requests' && typeof fetchResetRequests === 'function') fetchResetRequests();
}

function toggleSidebar() {
  const drawer = document.getElementById('sidebarDrawer');
  const overlay = document.getElementById('sidebarOverlay');
  if (!drawer) return;
  drawer.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
  const drawer = document.getElementById('sidebarDrawer');
  const overlay = document.getElementById('sidebarOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

/* ==========================================================
   ROBOCON RULES & NOTES (TẠO, ĐIỀN, SỬA, XÓA)
   ========================================================== */
const DEFAULT_ROBOCON_RULES = [
  {
    id: 'r_1',
    title: '⏰ Giờ giấc điểm danh chuẩn',
    desc: 'Có mặt tại xưởng C503 đúng 07:30 (ca sáng) và 13:00 (ca chiều). Quét mã QR trong 45 phút đầu ca.'
  },
  {
    id: 'r_2',
    title: '⏱ Quy định Đi muộn & Vắng không phép',
    desc: 'Quét QR trễ từ 15 đến 45 phút tính "Đi muộn". Sau 45 phút không có lý do chính đáng sẽ tính "Vắng không phép".'
  },
  {
    id: 'r_3',
    title: '📝 Quy trình Xin phép nghỉ & Bù ca',
    desc: 'Thành viên bận học trường hoặc việc đột xuất phải báo đội trưởng/admin trước ít nhất 2 giờ và chủ động bù ca vào ngày rảnh.'
  },
  {
    id: 'r_4',
    title: '🛡️ An toàn lao động & Thiết bị xưởng',
    desc: 'Bắt buộc mang giày bít mũi và đeo kính bảo hộ khi hàn cắt phay tiện. Không bật nguồn robot khi chưa kiểm tra dây dẫn.'
  },
  {
    id: 'r_5',
    title: '🧹 Vệ sinh xưởng cuối mỗi ca',
    desc: '15 phút trước khi kết thúc ca: Thu dọn phoi nhôm, cuộn gọn dây cắm, cất dụng cụ về đúng vị trí và tắt thiết bị điện.'
  }
];

function getRoboconRules() {
  try {
    const saved = localStorage.getItem('robocon_rules_notes');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('Cannot parse robocon rules', e);
  }
  return DEFAULT_ROBOCON_RULES;
}

function saveRoboconRulesArray(arr) {
  localStorage.setItem('robocon_rules_notes', JSON.stringify(arr));
  renderRoboconRules();
}

function renderRoboconRules() {
  const container = document.getElementById('roboconRulesList');
  if (!container) return;
  const rules = getRoboconRules();

  if (!rules || rules.length === 0) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
        <div style="font-size:24px;margin-bottom:6px">📝</div>
        <b>Chưa có quy định nào được ghi lại.</b>
        <p style="font-size:12px;margin-top:2px;color:var(--faint)">Bấm "+ Thêm quy định / Ghi chú" để tạo mới.</p>
      </div>`;
    return;
  }

  container.innerHTML = rules.map((r, idx) => `
    <div class="rule-item" id="rule_item_${r.id}">
      <div class="rule-item-content">
        <div class="rule-item-title">${escapeHtml(r.title)}</div>
        <div class="rule-item-desc">${escapeHtml(r.desc)}</div>
      </div>
      <div class="rule-item-actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditRuleModal('${r.id}')" title="Chỉnh sửa">✏️ Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRoboconRule('${r.id}')" title="Xóa">🗑 Xóa</button>
      </div>
    </div>
  `).join('');
}

function openAddRuleModal() {
  document.getElementById('editRuleId').value = '';
  document.getElementById('ruleModalHeading').textContent = 'Thêm quy định / ghi chú mới';
  document.getElementById('ruleTitleInput').value = '';
  document.getElementById('ruleContentInput').value = '';
  document.getElementById('ruleEditModal')?.classList.add('show');
}

function openEditRuleModal(ruleId) {
  const rules = getRoboconRules();
  const rule = rules.find(x => x.id === ruleId);
  if (!rule) return;
  document.getElementById('editRuleId').value = rule.id;
  document.getElementById('ruleModalHeading').textContent = 'Chỉnh sửa quy định / ghi chú';
  document.getElementById('ruleTitleInput').value = rule.title;
  document.getElementById('ruleContentInput').value = rule.desc;
  document.getElementById('ruleEditModal')?.classList.add('show');
}

function closeRuleEditModal() {
  document.getElementById('ruleEditModal')?.classList.remove('show');
}

function saveRoboconRule() {
  const id = document.getElementById('editRuleId').value.trim();
  const title = document.getElementById('ruleTitleInput').value.trim();
  const desc = document.getElementById('ruleContentInput').value.trim();

  if (!title || !desc) {
    toast('warn', 'Thiếu thông tin', 'Vui lòng điền đầy đủ tiêu đề và nội dung quy định.');
    return;
  }

  let rules = getRoboconRules();
  if (id) {
    const idx = rules.findIndex(x => x.id === id);
    if (idx !== -1) {
      rules[idx].title = title;
      rules[idx].desc = desc;
    }
    toast('ok', 'Đã lưu', 'Cập nhật quy định điểm danh thành công.');
  } else {
    const newId = 'r_' + Date.now().toString(36);
    rules.unshift({ id: newId, title, desc });
    toast('ok', 'Đã thêm mới', 'Quy định / Ghi chú mới đã được thêm vào bảng.');
  }

  saveRoboconRulesArray(rules);
  closeRuleEditModal();
}

function deleteRoboconRule(ruleId) {
  if (!confirm('Bạn có chắc muốn xóa quy định / ghi chú này?')) return;
  let rules = getRoboconRules();
  rules = rules.filter(x => x.id !== ruleId);
  saveRoboconRulesArray(rules);
  toast('ok', 'Đã xóa', 'Đã xóa quy định khỏi bảng.');
}

function resetDefaultRoboconRules() {
  if (!confirm('Khôi phục lại 5 quy định điểm danh mẫu của xưởng Robocon?')) return;
  saveRoboconRulesArray(DEFAULT_ROBOCON_RULES);
  toast('ok', 'Đã khôi phục', 'Đã nạp lại nội quy điểm danh Robocon mặc định.');
}

/* ==========================================================
   TASK WORKSPACE CONTROLLERS
   ========================================================== */
function switchTaskTab(tabType) {
  document.getElementById('tabTaskGroup')?.classList.toggle('active', tabType === 'group');
  document.getElementById('tabTaskPersonal')?.classList.toggle('active', tabType === 'personal');
  
  const cards = document.querySelectorAll('#tasksListGrid .task-card');
  cards.forEach(c => {
    if (tabType === 'group') {
      c.style.display = (c.dataset.type === 'group') ? 'flex' : 'none';
    } else {
      c.style.display = (c.dataset.type === 'personal') ? 'flex' : 'none';
    }
  });
}

function applyTaskFilters() {
  const grp = document.getElementById('taskFilterGroup')?.value || 'all';
  const st = document.getElementById('taskFilterStatus')?.value || 'all';
  const pri = document.getElementById('taskFilterPriority')?.value || 'all';
  const search = (document.getElementById('taskSearchInput')?.value || '').toLowerCase().trim();

  const cards = document.querySelectorAll('#tasksListGrid .task-card');
  cards.forEach(c => {
    const matchGrp = (grp === 'all' || c.dataset.group === grp);
    const matchSt = (st === 'all' || c.dataset.status === st);
    const matchPri = (pri === 'all' || c.dataset.priority === pri);
    const matchSearch = (!search || c.innerText.toLowerCase().includes(search));
    
    c.style.display = (matchGrp && matchSt && matchPri && matchSearch) ? 'flex' : 'none';
  });
}

function openCreateTaskModal() {
  document.getElementById('taskCreateModal')?.classList.add('show');
}
function closeTaskCreateModal() {
  document.getElementById('taskCreateModal')?.classList.remove('show');
}

function toggleTaskAssigneeSelect(val) {
  const field = document.getElementById('taskAssigneeField');
  if (field) field.style.display = (val === 'personal') ? 'flex' : 'none';
}

function submitCreateTask() {
  const title = document.getElementById('taskNewTitle')?.value?.trim();
  if (!title) { toast('warn', 'Thiếu thông tin', 'Vui lòng nhập tiêu đề nhiệm vụ.'); return; }
  
  const type = document.getElementById('taskNewType')?.value || 'group';
  const group = document.getElementById('taskNewGroup')?.value || 'Cơ khí';
  const assignee = (type === 'personal') ? document.getElementById('taskNewAssignee')?.value : 'Toàn đội ' + group;
  const desc = document.getElementById('taskNewDesc')?.value || 'Thực hiện đúng yêu cầu xưởng.';
  const pri = document.getElementById('taskNewPriority')?.value || 'med';
  const due = document.getElementById('taskNewDueDate')?.value || '15/10/2026';

  const priLabel = pri === 'high' ? 'Cao 🔥' : (pri === 'med' ? 'Trung bình' : 'Thấp');
  const priClass = pri === 'high' ? 'priority-high' : (pri === 'med' ? 'priority-med' : 'priority-low');

  const newCard = document.createElement('div');
  newCard.className = 'task-card';
  newCard.dataset.type = type;
  newCard.dataset.group = group;
  newCard.dataset.status = 'todo';
  newCard.dataset.priority = pri;
  newCard.innerHTML = `
    <div class="task-card-top">
      <span class="task-title">${escapeHtml(title)}</span>
      <span class="task-badge-priority ${priClass}">${priLabel}</span>
    </div>
    <p class="task-desc">${escapeHtml(desc)}</p>
    <div class="task-meta-grid">
      <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val">${escapeHtml(group)}</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">${escapeHtml(assignee)}</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">${escapeHtml(due)}</span></div>
    </div>
    <div class="task-card-footer">
      <span class="task-status-chip status-todo">⚪ Chưa bắt đầu</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="showTaskDetail('${escapeHtml(title)}', '${escapeHtml(desc)}', '${escapeHtml(group)}', '${escapeHtml(assignee)}', '${priLabel}', '${escapeHtml(due)}', 'Chưa bắt đầu')">Chi tiết</button>
        <button class="btn btn-sm btn-primary" onclick="quickUpdateTaskStatus(this, 'doing')">▶ Bắt đầu</button>
      </div>
    </div>
  `;

  document.getElementById('tasksListGrid')?.prepend(newCard);
  closeTaskCreateModal();
  toast('ok', 'Đã giao nhiệm vụ', 'Nhiệm vụ mới đã được thêm vào danh sách.');
}

function showTaskDetail(title, desc, group, assignee, pri, due, status) {
  document.getElementById('taskDetailTitle').textContent = title;
  document.getElementById('taskDetailDesc').textContent = desc;
  document.getElementById('taskDetailGroup').textContent = group;
  document.getElementById('taskDetailAssignee').textContent = assignee;
  document.getElementById('taskDetailDue').textContent = due;
  document.getElementById('taskDetailStatus').textContent = status;
  document.getElementById('taskDetailModal')?.classList.add('show');
}
function closeTaskDetailModal() {
  document.getElementById('taskDetailModal')?.classList.remove('show');
}

function quickUpdateTaskStatus(btn, newStatus) {
  const card = btn.closest('.task-card');
  if (!card) return;
  card.dataset.status = newStatus;
  const chip = card.querySelector('.task-status-chip');
  if (newStatus === 'done') {
    if (chip) { chip.className = 'task-status-chip status-done'; chip.innerHTML = '✓ Đã hoàn thành'; }
    btn.remove();
    toast('ok', 'Cập nhật tiến độ', 'Đã đánh dấu hoàn thành nhiệm vụ.');
  } else if (newStatus === 'doing') {
    if (chip) { chip.className = 'task-status-chip status-doing'; chip.innerHTML = '⏳ Đang làm'; }
    btn.className = 'btn btn-sm btn-success';
    btn.textContent = '✓ Hoàn tất';
    btn.onclick = () => quickUpdateTaskStatus(btn, 'done');
    toast('info', 'Bắt đầu làm', 'Nhiệm vụ đã chuyển sang trạng thái đang thực hiện.');
  }
}

/* ==========================================================
   FEEDBACK & ZALO CONTROLLERS
   ========================================================== */
function openStudentFeedbackModal() {
  document.getElementById('studentFeedbackModal')?.classList.add('show');
}
function closeStudentFeedbackModal() {
  document.getElementById('studentFeedbackModal')?.classList.remove('show');
}
function submitStudentFeedback() {
  const text = document.getElementById('fbSendContent')?.value?.trim();
  if (!text) { toast('warn', 'Thiếu nội dung', 'Vui lòng nhập nội dung góp ý.'); return; }
  const type = document.getElementById('fbSendType')?.value || 'gopy';
  
  const typeLabels = { gopy: '💡 Góp ý', suco: '⚠️ Sự cố', muasam: '🛠 Mua sắm', khac: '💬 Khác' };
  const typeClass = { gopy: 'type-gopy', suco: 'type-suco', muasam: 'type-muasam', khac: 'type-khac' };
  const randId = Math.floor(1000 + Math.random() * 9000);

  const newFb = document.createElement('div');
  newFb.className = 'fb-item';
  newFb.dataset.type = type;
  newFb.dataset.status = 'new';
  newFb.innerHTML = `
    <div class="fb-item-top">
      <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-${randId}</span>
      <span class="fb-type-badge ${typeClass[type] || 'type-gopy'}">${typeLabels[type]}</span>
    </div>
    <div class="fb-text">${escapeHtml(text)}</div>
    <div class="fb-item-bottom">
      <span>📅 Vừa gửi (Ẩn danh)</span>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="task-status-chip status-doing">🔵 Mới nhận</span>
        <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
      </div>
    </div>
  `;

  document.getElementById('feedbackList')?.prepend(newFb);
  closeStudentFeedbackModal();
  document.getElementById('fbSendContent').value = '';
  toast('ok', 'Đã gửi ẩn danh', 'Ý kiến của bạn đã được chuyển đến ban quản lý mà không lưu danh tính.');
}

function markFeedbackResolved(btn) {
  const item = btn.closest('.fb-item');
  if (!item) return;
  item.dataset.status = 'resolved';
  const bottom = item.querySelector('.fb-item-bottom div');
  if (bottom) {
    bottom.innerHTML = '<span class="task-status-chip status-done">🟢 Đã xử lý</span>';
  }
  toast('ok', 'Đã xử lý', 'Đã lưu trạng thái xử lý phản hồi.');
}

function applyFeedbackFilters() {
  const type = document.getElementById('fbFilterType')?.value || 'all';
  const st = document.getElementById('fbFilterStatus')?.value || 'all';
  const items = document.querySelectorAll('#feedbackList .fb-item');
  items.forEach(it => {
    const matchType = (type === 'all' || it.dataset.type === type);
    const matchSt = (st === 'all' || it.dataset.status === st);
    it.style.display = (matchType && matchSt) ? 'flex' : 'none';
  });
}

function toggleZaloAuto(isOn) {
  const lbl = document.getElementById('zaloSwitchLabel');
  if (lbl) lbl.textContent = isOn ? 'Tự động gửi lịch hàng ngày: ĐANG BẬT' : 'Tự động gửi lịch hàng ngày: ĐÃ TẮT';
  toast(isOn ? 'ok' : 'warn', isOn ? 'Đã bật tự động gửi Zalo' : 'Đã tắt gửi Zalo', 'Thời gian gửi: ' + (document.getElementById('zaloSendHour')?.value || '20:00'));
}

function simulateZaloSend() {
  toast('info', 'Đang tạo tin nhắn...', 'Đang tổng hợp danh sách lịch rảnh ngày mai...');
  setTimeout(() => {
    toast('ok', 'Gửi Zalo thành công!', 'Đã gửi mẫu lịch rảnh lên nhóm Robocon 2026.');
    const tbody = document.getElementById('zaloHistoryTbody');
    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>Vừa xong</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (Gửi thử)</span></td>`;
      tbody.prepend(row);
    }
  }, 900);
}

function generateZaloPreviewText() {
  const tm = new Date();
  tm.setDate(tm.getDate() + 1);
  const dStr = tm.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const preview = `[THÔNG BÁO LỊCH RẢNH NGÀY MAI - ${dStr.toUpperCase()}]
🤖 Xưởng Robocon LH-NaviX (Phòng C503)

✅ THÀNH VIÊN RẢNH CẢ NGÀY:
 • Võ Duy Khang (123001058)
 • Dương Công Mạnh (125001343)
 • Nguyễn Văn Trung (123000651)
 • ... và các thành viên khác

⚠️ THÀNH VIÊN CÓ LỊCH HỌC TRƯỜNG:
 • Huỳnh Tuấn Tú (123000078): Bận Tiết 1-4 (G306)

📌 Đề nghị các bạn có mặt đúng 07:30 tại xưởng!`;
  const el = document.getElementById('zaloMessagePreview');
  if (el) el.textContent = preview;
  toast('ok', 'Đã cập nhật', 'Khung xem trước tin nhắn Zalo đã được làm mới.');
}

setTimeout(() => { if (typeof renderRoboconRules === 'function') renderRoboconRules(); }, 200);
"""

# Now let's integrate orig_js with controllers_js
# In orig_js, remove the leading <script> tag since controllers_js already starts with <script>
orig_js_body = orig_js[len('<script>'):]

# Update showEmpty and showDashboard to also update Hero card
orig_js_body = orig_js_body.replace(
"""function showEmpty(){
  document.getElementById('emptyState').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  clearInterval(countdownTimer);
  loadTodayHistory();
  loadTodaySchoolSchedule();
}""",
"""function showEmpty(){
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đã đóng'; navBadge.style.background = 'rgba(0,0,0,0.06)'; navBadge.style.color = 'var(--muted)'; }
  
  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard) {
    document.getElementById('heroSessionIcon').textContent = '⏹';
    document.getElementById('heroSessionTitle').textContent = 'Chưa có phiên điểm danh nào đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Mở phiên mới bên dưới để bắt đầu điểm danh xưởng.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="document.getElementById(\\'quickName\\').focus()">＋ Mở phiên mới</button>';
  }
  const createBox = document.getElementById('overviewSessionCreateBox');
  if (createBox) createBox.style.display = 'block';

  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  clearInterval(countdownTimer);
  loadTodayHistory();
  loadTodaySchoolSchedule();
}""")

orig_js_body = orig_js_body.replace(
"""function showDashboard(){
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-on';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đang mở</span>';
}""",
"""function showDashboard(){
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-on';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đang mở</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đang mở'; navBadge.style.background = 'var(--ok-bg)'; navBadge.style.color = 'var(--ok)'; }

  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard && currentSession) {
    document.getElementById('heroSessionIcon').textContent = '🟢';
    document.getElementById('heroSessionTitle').textContent = currentSession.session_name || 'Phiên điểm danh đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Phiên đang hoạt động. Mã QR đang chiếu cho sinh viên.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="navTo(\\'attendance\\')">Vào màn hình điểm danh →</button><button class="btn btn-danger" onclick="openCloseModal()">■ Đóng phiên</button>';
  }
  const createBox = document.getElementById('overviewSessionCreateBox');
  if (createBox) createBox.style.display = 'none';
}""")

# Avatar syncing in checkAuth
orig_js_body = orig_js_body.replace(
"""  document.getElementById('adminName').textContent = name;
  document.getElementById('adminMssv').textContent = (profile?.mssv || '').trim();""",
"""  document.getElementById('adminName').textContent = name;
  document.getElementById('adminMssv').textContent = (profile?.mssv || '').trim();
  const firstInitial = (name || 'A').trim().charAt(0).toUpperCase();
  const topAvatar = document.getElementById('topbarAvatar');
  if (topAvatar) topAvatar.textContent = firstInitial;
  const sideAvatar = document.getElementById('sidebarAvatar');
  if (sideAvatar) sideAvatar.textContent = firstInitial;
  const sideName = document.getElementById('sidebarAdminName');
  if (sideName) sideName.textContent = name;
  const sideMssv = document.getElementById('sidebarAdminMssv');
  if (sideMssv) sideMssv.textContent = (profile?.mssv || '').trim() || 'Admin';""")

final_clean_html = full_template + "\n" + controllers_js + "\n" + orig_js_body

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(final_clean_html)

print("SUCCESS: Pristine clean admin.html built!")
