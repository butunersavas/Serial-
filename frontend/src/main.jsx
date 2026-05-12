import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert, AppBar, Box, Button, Card, CardContent, Checkbox, Chip, Container, CssBaseline, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Drawer, FormControl, FormControlLabel, Grid, InputLabel, List,
  ListItemButton, ListItemText, Menu, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, ThemeProvider, Toolbar, Tooltip, Typography,
} from '@mui/material';
import theme, { severityColors } from './theme';
import {
  addAction, closeFindingApi, convertDefenderCve, convertDefenderMachine, createFinding, defenderAffectedDevicesExportUrl, defenderExportUrl,
  deleteFinding, exportUrl, getActions, getDashboard, getDefenderAffectedDevices, getDefenderDashboard, getDefenderMachines,
  getDefenderRecommendations, getDefenderSettings, getDefenderVulnerabilities, getFindingFilterOptions, getFindings, getLogs,
  getMsrcMonths, getMsrcSummary, getMsrcVulnerabilities,
  convertMsrcVulnerability, importExcel, importTemplateUrl, msrcExportUrl, previewExcel, reopenFindingApi, syncDefenderAll, syncMsrcMonth, testDefenderConnection, updateDefenderSettings,
  updateFinding,
} from './api';

const LOGO_SRC = '/assets/surat-logo.svg';
const DRAWER_WIDTH = 252;
const severities = ['Acil', 'Kritik', 'Yüksek', 'Orta', 'Düşük'];
const statuses = ['Devam Ediyor', 'Kapatıldı'];
const navigationItems = ['Dashboard', 'Bulgular', 'Bulgu Ekle', 'Microsoft CVE / MSRC', 'Defender Zafiyetleri', 'Raporlar', 'Ayarlar'];
const emptyFinding = { record_no: '', title: '', severity: 'Orta', impact: '', description: '', recommendation: '', related_unit: '', related_person: '', status: 'Devam Ediyor', due_date: '', new_due_date: '', note: '', source: 'Manuel' };
const CARD_ACCENTS = {
  total: '#0f2f57',
  open: '#64748b',
  closed: '#16a34a',
  urgent: '#7f1d1d',
  critical: '#b91c1c',
  high: '#f97316',
  medium: '#eab308',
  low: '#16a34a',
  overdue: '#991b1b',
  dueSoon: '#f59e0b',
  info: '#2563eb',
};
const gridSx = (min = 180) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 2, alignItems: 'stretch' });
const dashboardGridSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2, alignItems: 'stretch' };
const panelSx = { p: 2.5, height: '100%', border: '1px solid rgba(15, 47, 87, 0.08)' };

function isValidDate(value) { if (!value) return false; const d = new Date(value); return !Number.isNaN(d.getTime()); }
function formatDate(value) { return isValidDate(value) ? new Date(value).toLocaleString('tr-TR') : '-'; }
function formatShortDateTime(value) { if (!isValidDate(value)) return '-'; const d = new Date(value); return <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}><span>{d.toLocaleDateString('tr-TR')}</span><span>{d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></Box>; }
function formatDay(value) { return isValidDate(value) ? new Date(value).toLocaleDateString('tr-TR') : '-'; }
function displayRecordNo(value) { return String(value || '').trim().replace(/^IMPORT-/i, '') || '-'; }
function recordNoNumber(value) { const match = displayRecordNo(value).match(/\d+/); return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER; }
function displayDeviceName(row) { return row?.device_name || row?.computerDnsName || row?.machine_name || row?.machine_id || row?.device_id || '-'; }
function sampleDeviceText(row) { return (row?.sample_devices || []).map((name) => name || '-').join(', ') || '-'; }
function isOverdue(row) { return row.status !== 'Kapatıldı' && row.active_due_date && new Date(row.active_due_date) < new Date(new Date().toDateString()); }
function isDueSoon(row) { const today = new Date(new Date().toDateString()); const due = row.active_due_date ? new Date(row.active_due_date) : null; return row.status !== 'Kapatıldı' && due && due >= today && due <= new Date(today.getTime() + 7 * 86400000); }
function BrandLogo({ height = 40 }) { return <Box component="img" src={LOGO_SRC} alt="Sürat Kargo" sx={{ display: 'block', height, maxHeight: height, maxWidth: '100%', objectFit: 'contain' }} />; }
function SeverityChip({ severity }) { return <Chip label={severity || '-'} size="small" sx={{ minWidth: 72, bgcolor: severityColors[severity] || { Critical: '#991b1b', High: '#dc2626', Medium: '#f59e0b', Low: '#16a34a' }[severity] || 'primary.main', color: severity === 'Orta' || severity === 'Medium' ? '#1f2937' : '#fff', fontWeight: 800 }} />; }
function SummaryCard({ label, value, helper, accent = 'primary.main', onClick, selected = false }) { return <Card onClick={onClick} sx={{ height: '100%', minHeight: 126, cursor: onClick ? 'pointer' : 'default', borderColor: selected ? accent : 'rgba(15, 47, 87, 0.08)', boxShadow: selected ? `0 0 0 2px ${accent}22, 0 14px 36px rgba(15, 47, 87, 0.10)` : undefined, transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease', '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: '0 16px 34px rgba(15, 47, 87, 0.14)' } : undefined }}><CardContent sx={{ height: '100%', p: 2.25, '&:last-child': { pb: 2.25 } }}><Stack direction="row" justifyContent="space-between" spacing={2} sx={{ height: '100%' }}><Box sx={{ minWidth: 0 }}><Typography color="text.secondary" variant="body2" fontWeight={700}>{label}</Typography><Typography variant="h4" fontWeight={800} sx={{ mt: .5, letterSpacing: '-0.03em' }}>{value ?? '-'}</Typography>{helper && <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1.25 }}>{helper}</Typography>}</Box><Box sx={{ width: 10, alignSelf: 'stretch', minHeight: 58, borderRadius: 10, bgcolor: accent, flexShrink: 0 }} /></Stack></CardContent></Card>; }
function SectionHeader({ title, description }) { return <Box sx={{ mb: 2.5 }}><Typography variant="h5" color="primary.dark">{title}</Typography>{description ? <Typography color="text.secondary" sx={{ mt: .5 }}>{description}</Typography> : null}</Box>; }

function DataTable({ title, rows = [], columns, actions }) {
  return <Paper sx={panelSx}><Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography><TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}><Table size="small" sx={{ '& th': { bgcolor: '#f8fafc', fontWeight: 800, whiteSpace: 'nowrap' }, '& td': { verticalAlign: 'middle' } }}><TableHead><TableRow>{columns.map((c) => <TableCell key={c.key}>{c.label}</TableCell>)}{actions && <TableCell>İşlem</TableCell>}</TableRow></TableHead><TableBody>{rows.length ? rows.map((row, i) => <TableRow hover key={row.id || row.cve_id || row.recommendation_id || i}>{columns.map((c) => <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '-')}</TableCell>)}{actions && <TableCell>{actions(row)}</TableCell>}</TableRow>) : <TableRow><TableCell colSpan={columns.length + (actions ? 1 : 0)}>Kayıt yok.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>;
}

function Dashboard({ summary, onFindingsFilter }) {
  const d = summary || {};
  const defender = d.defender_summary || {};
  const cards = [
    ['Toplam Bulgu', d.total, '', CARD_ACCENTS.total, {}],
    ['Açık Kalan', d.open, '', CARD_ACCENTS.open, { status: 'Devam Ediyor' }],
    ['Kapatılan', d.closed, '', CARD_ACCENTS.closed, { status: 'Kapatıldı' }],
    ['Acil', d.severity_counts?.Acil || 0, '', CARD_ACCENTS.urgent, { severity: 'Acil' }],
    ['Kritik', d.severity_counts?.Kritik || 0, '', severityColors.Kritik, { severity: 'Kritik' }],
    ['Yüksek', d.severity_counts?.Yüksek || 0, '', severityColors.Yüksek, { severity: 'Yüksek' }],
    ['Orta', d.severity_counts?.Orta || 0, '', severityColors.Orta, { severity: 'Orta' }],
    ['Düşük', d.severity_counts?.Düşük || 0, '', severityColors.Düşük, { severity: 'Düşük' }],
  ];
  return <Stack spacing={3}><SectionHeader title="Dashboard" />
    <Box sx={dashboardGridSx}>{cards.map(([label, value, helper, accent, filters]) => <SummaryCard key={label} label={label} value={value} helper={helper} accent={accent} onClick={() => onFindingsFilter(filters)} />)}</Box>
    <Paper sx={panelSx}><Typography variant="h6" sx={{ mb: 2 }}>Microsoft Defender Özeti</Typography><Box sx={gridSx(190)}>{[
      ['Defender Toplam CVE', defender.total_cve || 0], ['Kritik Defender CVE', defender.critical_cve || 0], ['Yüksek Defender CVE', defender.high_cve || 0], ['Etkilenen Cihaz Sayısı', defender.affected_machines || 0], ['Public Exploit', defender.public_exploit || 0], ['Bulguya Dönüştürülen Defender CVE', defender.converted_findings || 0],
    ].map(([label, value]) => <SummaryCard key={label} label={label} value={value} accent={CARD_ACCENTS.info} />)}</Box></Paper>
    <Box sx={gridSx(420)}><DataTable title="Geciken Bulgular" rows={d.overdue_findings || []} columns={[{ key: 'record_no', label: 'Kayıt No', render: (r) => displayRecordNo(r.record_no) }, { key: 'title', label: 'Başlık' }, { key: 'severity', label: 'Seviye', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'active_due_date', label: 'Termin', render: (r) => formatDay(r.active_due_date) }]} /><DataTable title="Termin Yaklaşanlar" rows={d.approaching_due || []} columns={[{ key: 'record_no', label: 'Kayıt No', render: (r) => displayRecordNo(r.record_no) }, { key: 'title', label: 'Başlık' }, { key: 'severity', label: 'Seviye', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'active_due_date', label: 'Termin', render: (r) => formatDay(r.active_due_date) }]} /></Box>
  </Stack>;
}

function FindingForm({ initial = emptyFinding, onSubmit, submitLabel = 'Kaydet' }) {
  const [form, setForm] = useState({ ...emptyFinding, ...initial, record_no: initial?.record_no ? displayRecordNo(initial.record_no) : (initial?.record_no || '') });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = (e) => { e.preventDefault(); onSubmit({ ...form, due_date: form.due_date || null, new_due_date: form.new_due_date || null }); };
  return <Box component="form" onSubmit={submit}><Grid container spacing={2}>{[
    ['record_no', 'Kayıt No'], ['title', 'Bulgu Başlığı'], ['related_unit', 'İlgili Birim / Kurum'], ['related_person', 'İlgili Kişi (virgül, noktalı virgül veya yeni satır ile çoklu kişi)'], ['due_date', 'Termin Tarih', 'date'], ['new_due_date', 'Yeni Termin', 'date'],
  ].map(([key, label, type]) => <Grid item xs={12} md={6} key={key}><TextField fullWidth multiline={key === 'related_person'} minRows={key === 'related_person' ? 2 : undefined} type={type || 'text'} label={label} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} InputLabelProps={type ? { shrink: true } : undefined} /></Grid>)}
    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>Durum Seviyesi</InputLabel><Select label="Durum Seviyesi" value={form.severity} onChange={(e) => set('severity', e.target.value)}>{severities.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl></Grid>
    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>Durum</InputLabel><Select label="Durum" value={form.status} onChange={(e) => set('status', e.target.value)}>{statuses.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl></Grid>
    {['impact', 'description', 'recommendation', 'note'].map((key) => <Grid item xs={12} key={key}><TextField fullWidth multiline minRows={2} label={{ impact: 'Bulgunun Etkisi', description: 'Bulgunun Açıklaması', recommendation: 'Çözüm Önerisi', note: 'Notlar' }[key]} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} /></Grid>)}
    <Grid item xs={12}><Button type="submit" variant="contained">{submitLabel}</Button></Grid></Grid></Box>;
}

const emptyFilters = { search: '', severity: '', status: '', related_unit: '', related_person: '', due_state: '' };
const personSeparators = /[,;\n]+/;
const defaultFindingColumnWidths = { record_no: 78, title: 190, severity: 86, related_unit: 125, related_person: 118, status: 108, due: 96, due_rev: 82, closed_at: 118, actions: 175 };
const defaultMsrcColumnWidths = { cve_id: 130, title: 260, severity: 120, product: 280, kb_article: 105, impact: 260, exploited: 170, publicly_disclosed: 145, release_month: 120, release_date: 125, actions: 190 };
const msrcEmptyFilters = { search: '', cve: '', severity: '', product: '', kb: '', exploited: '', publicly_disclosed: '' };

function splitRelatedPeople(value = '') { return String(value || '').split(personSeparators).map((x) => x.trim()).filter(Boolean); }
function summarizeRelatedPeople(value = '') { const people = splitRelatedPeople(value); if (!people.length) return '-'; return people.length === 1 ? people[0] : `${people[0]} +${people.length - 1}`; }
function normalizedRelatedPerson(value = '') { return splitRelatedPeople(value).join(', '); }
function StatusChip({ status }) { return <Chip size="small" label={status || '-'} color={status === 'Kapatıldı' ? 'success' : 'default'} sx={{ bgcolor: status === 'Kapatıldı' ? '#dcfce7' : '#e0f2fe', color: status === 'Kapatıldı' ? '#166534' : '#075985', fontWeight: 800 }} />; }

function filterValueForUrl(key, value) {
  if (key === 'due_state') return { Geciken: 'overdue', 'Termin Yaklaşan': 'due_soon', Terminsiz: 'no_due' }[value] || value;
  return value;
}

function filterValueFromUrl(key, value) {
  if (key === 'due_state') return { overdue: 'Geciken', due_soon: 'Termin Yaklaşan', approaching: 'Termin Yaklaşan', no_due: 'Terminsiz' }[value] || value;
  return value;
}

function filtersForApi(next) {
  return { ...next, due_state: filterValueFromUrl('due_state', next.due_state) };
}

function filterLabel(key, value) {
  const labels = { search: 'Arama', severity: 'Seviye', status: 'Durum', related_unit: 'Birim', related_person: 'İlgili Kişi', due_state: 'Termin' };
  return `${labels[key] || key}: ${value}`;
}

function isSameFilter(a, b) {
  return Object.keys(emptyFilters).every((key) => (a[key] || '') === (b[key] || ''));
}

function DetailField({ label, value, children }) {
  return <Box><Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography><Box sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children ?? value ?? '-'}</Box></Box>;
}

function ResizableHeaderCell({ column, width, onResizeStart, sort, onSort }) {
  const active = sort?.key === column.key;
  const sortable = Boolean(column.sortable);
  return <TableCell onClick={sortable ? () => onSort(column.key) : undefined} sx={{ width, minWidth: width, maxWidth: width, position: 'relative', userSelect: 'none', cursor: sortable ? 'pointer' : 'default', pr: 2.25 }}>
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: .5 }}>{column.label}{active ? (sort.direction === 'asc' ? '▲' : '▼') : null}</Box>
    <Box onMouseDown={(e) => onResizeStart(e, column.key)} onClick={(e) => e.stopPropagation()} sx={{ position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 5, '&:hover': { bgcolor: 'rgba(15,47,87,.12)' } }} />
  </TableCell>;
}

function FindingsPage({ summary, refresh, show }) {
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({ related_units: [], related_people: [], severities, statuses });
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sort, setSort] = useState({ key: 'record_no', direction: 'asc' });
  const [actionMenu, setActionMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [columnWidths, setColumnWidths] = useState(() => {
    try { return { ...defaultFindingColumnWidths, ...JSON.parse(localStorage.getItem('findingColumnWidths') || '{}') }; } catch { return defaultFindingColumnWidths; }
  });

  const readFilters = () => {
    const params = new URLSearchParams(window.location.search);
    return { ...emptyFilters, ...Object.fromEntries(Object.keys(emptyFilters).map((key) => [key, filterValueFromUrl(key, params.get(key) || '')])) };
  };
  const writeFilters = (next) => {
    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => { if (value) params.set(key, filterValueForUrl(key, value)); });
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
  };
  const load = async (next = filters) => {
    try {
      const [data, opts] = await Promise.all([getFindings(filtersForApi(next)), getFindingFilterOptions()]);
      setRows(data);
      setOptions(opts);
    } catch (e) { show(e.message, 'error'); }
  };
  useEffect(() => { const initial = readFilters(); setFilters(initial); load(initial); }, []);
  useEffect(() => { localStorage.setItem('findingColumnWidths', JSON.stringify(columnWidths)); }, [columnWidths]);

  const applyFilters = (next) => { setFilters(next); setPage(0); writeFilters(next); load(next); };
  const setFilter = (key, value) => applyFilters({ ...filters, [key]: value });
  const clearFilters = () => applyFilters(emptyFilters);
  const reloadAll = () => { load(filters); refresh(); };
  const saveEdit = async (payload) => { try { await updateFinding(editing.id, { ...payload, related_person: normalizedRelatedPerson(payload.related_person) }); setEditing(null); show('Bulgu güncellendi.', 'success'); reloadAll(); } catch (e) { show(e.message, 'error'); } };
  const confirmDelete = async () => { if (!deleteTarget) return; try { await deleteFinding(deleteTarget.id); setDeleteTarget(null); show('Bulgu kaydı silindi.', 'success'); reloadAll(); } catch (e) { show(e.message, 'error'); } };
  const openStatusDialog = (row) => { setStatusTarget(row); setStatusNote(''); setActionMenu(null); };
  const submitStatusChange = async () => { if (!statusTarget) return; try { await (statusTarget.status === 'Kapatıldı' ? reopenFindingApi(statusTarget.id, statusNote) : closeFindingApi(statusTarget.id, statusNote)); show(statusTarget.status === 'Kapatıldı' ? 'Bulgu yeniden açıldı.' : 'Bulgu kapatıldı.', 'success'); setStatusTarget(null); setStatusNote(''); reloadAll(); } catch (e) { show(e.message, 'error'); } };
  const startResize = (event, key) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX; const startWidth = columnWidths[key] || defaultFindingColumnWidths[key];
    const onMove = (moveEvent) => setColumnWidths((current) => ({ ...current, [key]: Math.max(72, startWidth + moveEvent.clientX - startX) }));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  };

  const miniCards = [
    ['Toplam Bulgu', summary?.total || 0, {}, CARD_ACCENTS.total], ['Açık Kalan', summary?.open || 0, { status: 'Devam Ediyor' }, CARD_ACCENTS.open], ['Kapatılan', summary?.closed || 0, { status: 'Kapatıldı' }, CARD_ACCENTS.closed], ['Kritik', summary?.severity_counts?.Kritik || 0, { severity: 'Kritik' }, severityColors.Kritik], ['Yüksek', summary?.severity_counts?.Yüksek || 0, { severity: 'Yüksek' }, severityColors.Yüksek], ['Geciken', summary?.overdue || summary?.delayed || 0, { due_state: 'Geciken' }, CARD_ACCENTS.overdue], ['Termin Yaklaşan', summary?.due_soon || 0, { due_state: 'Termin Yaklaşan' }, CARD_ACCENTS.dueSoon],
  ];
  const columns = [
    { key: 'record_no', label: 'Kayıt No', sortable: true }, { key: 'title', label: 'Başlık', sortable: true }, { key: 'severity', label: 'Seviye', sortable: true }, { key: 'related_unit', label: 'Birim', sortable: true }, { key: 'related_person', label: 'İlgili Kişi', sortable: true }, { key: 'status', label: 'Durum', sortable: true }, { key: 'due', label: 'Termin', sortable: true }, { key: 'due_rev', label: 'Termin Rev.', sortable: true }, { key: 'closed_at', label: 'Kapanış Tarihi', sortable: true }, { key: 'actions', label: 'İşlem' },
  ];
  const totalTableWidth = columns.reduce((sum, c) => sum + (columnWidths[c.key] || defaultFindingColumnWidths[c.key]), 0);
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));
  const sortValue = (row, key) => {
    if (key === 'record_no') return recordNoNumber(row.record_no);
    if (key === 'due') return row.active_due_date ? new Date(row.active_due_date).getTime() : 0;
    if (key === 'due_rev') return Number(row.due_date_change_count || 0);
    if (key === 'closed_at') return row.status === 'Kapatıldı' && row.closed_at ? new Date(row.closed_at).getTime() : 0;
    return String(row[key] || '').toLocaleLowerCase('tr-TR');
  };
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'tr');
    return sort.direction === 'asc' ? result : -result;
  }), [rows, sort]);
  const handleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const visible = sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const rowBg = (r) => (isOverdue(r) ? '#fff1f2' : isDueSoon(r) ? '#fffbeb' : r.status === 'Kapatıldı' ? '#f0fdf4' : '#fff');

  return <Stack spacing={2.25} sx={{ minWidth: 0 }}><SectionHeader title="Bulgular" />
    <Box sx={gridSx(155)}>{miniCards.map(([label, value, cardFilters, accent]) => <SummaryCard key={label} label={label} value={value} accent={accent} selected={isSameFilter(filters, { ...emptyFilters, ...cardFilters })} onClick={() => applyFilters({ ...emptyFilters, ...cardFilters })} />)}</Box>
    <Paper sx={{ p: 2, border: '1px solid rgba(15,47,87,.08)', overflow: 'hidden' }}><Grid container spacing={1.5} alignItems="center"><Grid item xs={12} md={3}><TextField size="small" fullWidth label="Arama" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Başlık, kayıt no, açıklama..." /></Grid>{[
      ['severity', 'Durum Seviyesi', options.severities || severities], ['status', 'Durum', options.statuses || statuses], ['related_unit', 'İlgili Birim / Kurum', options.related_units || []], ['related_person', 'İlgili Kişi', options.related_people || []], ['due_state', 'Termin Durumu', ['Geciken', 'Termin Yaklaşan', 'Terminsiz']],
    ].map(([key, label, list]) => <Grid item xs={12} sm={6} md={key === 'related_unit' || key === 'related_person' ? 2 : 1.5} key={key}><FormControl size="small" fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}><MenuItem value="">Tümü</MenuItem>{list.map((x) => <MenuItem value={x} key={x}>{x}</MenuItem>)}</Select></FormControl></Grid>)}<Grid item xs={12} md="auto"><Button onClick={clearFilters} variant={activeFilters.length ? 'contained' : 'text'}>Filtreleri Temizle</Button></Grid>{activeFilters.length ? <Grid item xs={12}><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{activeFilters.map(([key, value]) => <Chip key={key} label={filterLabel(key, value)} onDelete={() => setFilter(key, '')} color="primary" variant="outlined" />)}</Stack></Grid> : null}</Grid></Paper>
    <Paper sx={{ border: '1px solid rgba(15,47,87,.08)', overflow: 'hidden', maxWidth: '100%' }}><TableContainer sx={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}><Table size="small" sx={{ width: '100%', minWidth: Math.min(totalTableWidth, 1280), tableLayout: 'fixed', '& th': { bgcolor: '#f8fafc', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.15, px: .75 }, '& td': { py: .75, px: .75, verticalAlign: 'top', overflow: 'visible', whiteSpace: 'normal', wordBreak: 'break-word' }, '& tbody tr': { cursor: 'pointer' }, '& tbody tr:hover td': { bgcolor: '#eef6ff' } }}><TableHead><TableRow>{columns.map((column) => <ResizableHeaderCell key={column.key} column={column} width={columnWidths[column.key]} onResizeStart={startResize} sort={sort} onSort={handleSort} />)}</TableRow></TableHead><TableBody>{visible.length ? visible.map((r) => <TableRow hover key={r.id} onClick={() => setDetail(r)} sx={{ '& td': { bgcolor: rowBg(r) } }}><TableCell><Typography variant="body2" fontWeight={700}>{displayRecordNo(r.record_no)}</Typography></TableCell><TableCell><Tooltip title={r.title || '-'}><Typography fontWeight={700} sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.title || '-'}</Typography></Tooltip></TableCell><TableCell><SeverityChip severity={r.severity} /></TableCell><TableCell><Tooltip title={r.related_unit || '-'}><Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{r.related_unit || '-'}</Typography></Tooltip></TableCell><TableCell><Tooltip title={splitRelatedPeople(r.related_person).join(', ') || '-'}><Typography variant="body2" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{summarizeRelatedPeople(r.related_person)}</Typography></Tooltip></TableCell><TableCell><StatusChip status={r.status} /></TableCell><TableCell>{formatDay(r.active_due_date)}</TableCell><TableCell>{r.due_date_change_count ?? 0}</TableCell><TableCell>{r.status === 'Kapatıldı' ? formatShortDateTime(r.closed_at) : '-'}</TableCell><TableCell onClick={(e) => e.stopPropagation()}><Stack direction="row" spacing={.5} useFlexGap alignItems="center" sx={{ flexWrap: 'nowrap' }}><Tooltip title="Bulgu detayını göster"><Button size="small" variant="text" sx={{ minWidth: 0, px: .55, fontSize: 12 }} onClick={() => setDetail(r)}>Detay</Button></Tooltip><Tooltip title="Bulgu bilgilerini düzenle"><Button size="small" variant="text" sx={{ minWidth: 0, px: .55, fontSize: 12 }} onClick={() => setEditing(r)}>Düzenle</Button></Tooltip><Button size="small" variant="outlined" sx={{ minWidth: 0, px: .55, fontSize: 12 }} onClick={(e) => setActionMenu({ anchor: e.currentTarget, row: r })}>İşlemler</Button></Stack></TableCell></TableRow>) : <TableRow><TableCell colSpan={10} align="center">Kayıt yok.</TableCell></TableRow>}</TableBody></Table></TableContainer><Menu anchorEl={actionMenu?.anchor} open={Boolean(actionMenu)} onClose={() => setActionMenu(null)}><MenuItem onClick={() => openStatusDialog(actionMenu.row)}>{actionMenu?.row?.status === 'Kapatıldı' ? 'Yeniden Aç' : 'Kapatıldı Yap'}</MenuItem><MenuItem sx={{ color: 'error.main', fontWeight: 700 }} onClick={() => { setDeleteTarget(actionMenu.row); setActionMenu(null); }}>Sil</MenuItem></Menu><TablePagination component="div" count={sortedRows.length} page={page} rowsPerPage={rowsPerPage} onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[10, 25, 50, 100]} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} labelRowsPerPage="Sayfa başına" /></Paper>
    <FindingDetail finding={detail} onClose={() => setDetail(null)} show={show} />
    <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="md" fullWidth><DialogTitle>Bulgu Düzenle</DialogTitle><DialogContent dividers>{editing && <FindingForm initial={editing} onSubmit={saveEdit} submitLabel="Güncelle" />}</DialogContent></Dialog>
    <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth><DialogTitle>Kaydı silmek istediğinize emin misiniz?</DialogTitle><DialogContent><Typography color="text.secondary">Bu işlem geri alınamayabilir.</Typography></DialogContent><DialogActions><Button onClick={() => setDeleteTarget(null)}>Vazgeç</Button><Button color="error" variant="contained" onClick={confirmDelete}>Evet, Sil</Button></DialogActions></Dialog>
    <Dialog open={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} maxWidth="sm" fullWidth><DialogTitle>{statusTarget?.status === 'Kapatıldı' ? 'Bulgu Yeniden Açılıyor' : 'Bulgu Kapatılıyor'}</DialogTitle><DialogContent dividers><TextField fullWidth multiline minRows={3} label={statusTarget?.status === 'Kapatıldı' ? 'Yeniden Açma Yorumu' : 'Kapatma Yorumu'} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="İsteğe bağlı" /></DialogContent><DialogActions><Button onClick={() => setStatusTarget(null)}>Vazgeç</Button><Button variant="contained" onClick={submitStatusChange}>{statusTarget?.status === 'Kapatıldı' ? 'Yeniden Aç' : 'Kapatıldı Yap'}</Button></DialogActions></Dialog>
  </Stack>;
}

function FindingDetail({ finding, onClose, show }) {
  const [actions, setActions] = useState([]);
  useEffect(() => { if (finding) getActions(finding.id).then(setActions).catch((e) => show(e.message, 'error')); }, [finding?.id]);
  const people = splitRelatedPeople(finding?.related_person).join(', ');
  return <Dialog open={Boolean(finding)} onClose={onClose} maxWidth="md" fullWidth><DialogTitle>{displayRecordNo(finding?.record_no)} Detayı</DialogTitle><DialogContent dividers><Stack spacing={2.25}>
    <Box sx={gridSx(260)}><DetailField label="Bulgu Başlığı" value={finding?.title} /><DetailField label="Durum Seviyesi"><SeverityChip severity={finding?.severity} /></DetailField><DetailField label="İlgili Birim / Kurum" value={finding?.related_unit} /><DetailField label="İlgili Kişi" value={people} /><DetailField label="Durum"><StatusChip status={finding?.status} /></DetailField><DetailField label="Termin Tarih" value={formatDay(finding?.due_date)} /><DetailField label="Yeni Termin" value={formatDay(finding?.new_due_date)} /></Box>
    <DetailField label="Bulgunun Etkisi" value={finding?.impact} />
    <DetailField label="Bulgunun Açıklaması" value={finding?.description} />
    <DetailField label="Çözüm Önerisi" value={finding?.recommendation} />
    <DetailField label="Not" value={finding?.note} />
    <DataTable title="Aksiyon Geçmişi" rows={actions} columns={[{ key: 'created_at', label: 'Tarih', render: (r) => formatDate(r.created_at) }, { key: 'action_type', label: 'Tip' }, { key: 'old_value', label: 'Eski Değer' }, { key: 'new_value', label: 'Yeni Değer' }, { key: 'note', label: 'Not' }, { key: 'created_by', label: 'Kullanıcı' }]} />
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions></Dialog>;
}

function ExcelImportPanel({ onImported, show }) {
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [result, setResult] = useState(null);
  return <Stack spacing={2}><Alert severity="info">Import şablonu kullanıcıdaki import.xlsx yapısıyla uyumludur. Örnek satırları içe aktarmadan önce silebilirsiniz.</Alert><Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap"><Button variant="outlined" component="label">Excel Dosyası Seç<input hidden type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files?.[0]); setPreview(null); setResult(null); }} /></Button><Typography>{file?.name || 'Dosya seçilmedi'}</Typography><Button disabled={!file} onClick={async () => { try { setPreview(await previewExcel(file)); } catch (e) { show(e.message, 'error'); } }}>Önizle</Button><Button variant="contained" disabled={!file} onClick={async () => { try { const r = await importExcel(file); setResult(r); onImported(r); } catch (e) { show(e.message, 'error'); } }}>İçe Aktar</Button><Button variant="outlined" href={importTemplateUrl()}>Örnek Import Şablonu İndir</Button></Stack>{preview && <Alert severity={preview.failed ? 'warning' : 'info'}>{preview.total} kayıt önizlendi, {preview.failed} hatalı satır.</Alert>}{result && <Grid container spacing={1.5}>{[['Eklenen', result.created], ['Güncellenen', result.updated], ['Hatalı', result.failed]].map(([label, value]) => <Grid item xs={12} md={4} key={label}><SummaryCard label={label} value={value} /></Grid>)}</Grid>}{(preview?.errors?.length || result?.errors?.length) ? <DataTable title="Hatalı Satırlar" rows={(result?.errors || preview?.errors || []).map((x, i) => ({ id: i, ...x }))} columns={[{ key: 'row', label: 'Satır' }, { key: 'message', label: 'Hata' }]} /> : null}</Stack>;
}

function AddFindingPage({ onSave, onImported, show }) {
  const [tab, setTab] = useState(0);
  return <Paper sx={{ p: 3 }}><SectionHeader title="Bulgu Ekle" description="Manuel kayıt veya Excel ile toplu bulgu ekleme." /><Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}><Tab label="Manuel Bulgu Ekle" /><Tab label="Excel ile Toplu Bulgu Ekle" /><Tab label="Örnek Import Şablonu İndir" /></Tabs>{tab === 0 ? <FindingForm onSubmit={onSave} /> : tab === 1 ? <ExcelImportPanel show={show} onImported={onImported} /> : <Stack spacing={2}><Alert severity="info">Toplu import için kullanılacak güncel örnek şablonu indirebilirsiniz.</Alert><Button variant="contained" href={importTemplateUrl()}>Örnek Import Şablonu İndir</Button></Stack>}</Paper>;
}

function boolText(value) { return value ? 'Evet' : 'Hayır'; }
function truncateText(value, lines = 2) { return <Tooltip title={value || '-'}><Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{value || '-'}</Typography></Tooltip>; }

function MsrcPage({ show, refreshApp }) {
  const [months, setMonths] = useState([]); const [selectedMonth, setSelectedMonth] = useState(''); const [summary, setSummary] = useState({}); const [rows, setRows] = useState([]); const [filters, setFilters] = useState(msrcEmptyFilters); const [activeCard, setActiveCard] = useState(''); const [loading, setLoading] = useState(false); const [detail, setDetail] = useState(null);
  const [columnWidths, setColumnWidths] = useState(() => { try { return { ...defaultMsrcColumnWidths, ...JSON.parse(localStorage.getItem('msrcColumnWidths') || '{}') }; } catch { return defaultMsrcColumnWidths; } });
  const activeFilters = useMemo(() => ({ ...filters, month: selectedMonth, card_filter: activeCard }), [filters, selectedMonth, activeCard]);
  const load = async (payload = activeFilters) => { const [sum, list] = await Promise.all([getMsrcSummary(payload), getMsrcVulnerabilities(payload)]); setSummary(sum || {}); setRows(list.items || []); };
  useEffect(() => { (async () => { try { const res = await getMsrcMonths(); setMonths(res.items || []); const month = res.default || res.items?.[0] || ''; setSelectedMonth(month); await load({ ...msrcEmptyFilters, month, card_filter: '' }); } catch (e) { show(e.message, 'error'); } })(); }, []);
  useEffect(() => { if (selectedMonth) load(activeFilters).catch((e) => show(e.message, 'error')); }, [selectedMonth, filters.search, filters.cve, filters.severity, filters.product, filters.kb, filters.exploited, filters.publicly_disclosed, activeCard]);
  useEffect(() => { localStorage.setItem('msrcColumnWidths', JSON.stringify(columnWidths)); }, [columnWidths]);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearCardFilter = () => setActiveCard('');
  const sync = async () => { try { setLoading(true); const res = await syncMsrcMonth(selectedMonth); if (res?.ok === false) { show(`${res.message || 'MSRC verisi işlenemedi.'}${res.detail ? ` Detay: ${res.detail}` : ''}`, 'error'); return; } show(`${res.message || 'MSRC senkronizasyonu tamamlandı.'} Yeni: ${res.inserted ?? res.created ?? 0}, Güncellenen: ${res.updated || 0}`, res.status === 'empty' ? 'warning' : 'success'); await load(activeFilters); } catch (e) { show(e.message, 'error'); } finally { setLoading(false); } };
  const convert = async (row) => { try { const res = await convertMsrcVulnerability(row.id); show(res.message || 'MSRC kaydı bulguya dönüştürüldü.', res.status === 'duplicate' ? 'warning' : 'success'); refreshApp?.(); } catch (e) { show(e.message, 'error'); } };
  const exportExcel = () => { window.location.href = msrcExportUrl(activeFilters); };
  const startResize = (event, key) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX; const startWidth = columnWidths[key] || defaultMsrcColumnWidths[key];
    const onMove = (moveEvent) => setColumnWidths((current) => ({ ...current, [key]: Math.max(80, startWidth + moveEvent.clientX - startX) }));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  };
  const cards = [
    { key: 'total', label: 'Toplam CVE', value: summary.total_cve, accent: CARD_ACCENTS.total },
    { key: 'critical', label: 'Critical', value: summary.critical, accent: CARD_ACCENTS.critical },
    { key: 'high_important', label: 'High / Important', value: summary.high_important, accent: CARD_ACCENTS.high },
    { key: 'moderate', label: 'Medium / Moderate', value: summary.moderate, accent: CARD_ACCENTS.medium },
    { key: 'low', label: 'Low', value: summary.low, accent: CARD_ACCENTS.low },
    { key: 'exploited', label: 'Exploited', value: summary.exploited, accent: CARD_ACCENTS.urgent },
    { key: 'publicly_disclosed', label: 'Publicly Disclosed', value: summary.publicly_disclosed, accent: CARD_ACCENTS.info },
    { key: 'kb_count', label: 'KB Sayısı', value: summary.kb_count, accent: CARD_ACCENTS.open },
  ];
  const activeCardLabel = cards.find((card) => card.key === activeCard)?.label;
  const columns = [
    { key: 'cve_id', label: 'CVE' }, { key: 'title', label: 'Başlık' }, { key: 'severity', label: 'Seviye' }, { key: 'product', label: 'Etkilenen Ürün / Uygulama' }, { key: 'kb_article', label: 'KB' }, { key: 'impact', label: 'Etki' }, { key: 'exploited', label: 'İstismar Ediliyor mu?' }, { key: 'publicly_disclosed', label: 'Kamuya Açık mı?' }, { key: 'release_month', label: 'Yayın Ayı' }, { key: 'release_date', label: 'Yayın Tarihi' }, { key: 'actions', label: 'İşlem' },
  ];
  const totalTableWidth = columns.reduce((sum, column) => sum + (columnWidths[column.key] || defaultMsrcColumnWidths[column.key]), 0);
  return <Stack spacing={2.5} sx={{ fontFamily: 'Segoe UI, Arial, Helvetica, sans-serif', minWidth: 0 }}><SectionHeader title="Microsoft CVE / MSRC" description="Microsoft Security Update Guide / CVRF API verilerini seçilen aya göre çekin, filtreleyin ve bulguya dönüştürün." />
    <Box sx={gridSx(170)}>{cards.map((card) => <SummaryCard key={card.label} label={card.label} value={card.value || 0} accent={card.accent} selected={activeCard === card.key} onClick={() => setActiveCard(card.key)} />)}</Box>
    {activeCard ? <Alert severity="info" action={<Button color="inherit" size="small" onClick={clearCardFilter}>Filtreyi Temizle</Button>}>Aktif filtre: {activeCardLabel}</Alert> : null}
    <Paper sx={panelSx}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between"><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}><FormControl size="small" sx={{ minWidth: 190 }}><InputLabel>Ay</InputLabel><Select label="Ay" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>{months.map((month) => <MenuItem key={month} value={month}>{month}</MenuItem>)}</Select></FormControl><Button variant="contained" onClick={sync} disabled={!selectedMonth || loading}>{loading ? 'Veri çekiliyor...' : 'MSRC Verisini Çek'}</Button><Button variant="outlined" onClick={exportExcel} disabled={!rows.length}>Excel’e Aktar</Button></Stack><Typography color="text.secondary" variant="body2">{rows.length} kayıt listeleniyor</Typography></Stack></Paper>
    <Paper sx={panelSx}><Grid container spacing={1.5}>{[['search', 'Arama'], ['cve', 'CVE'], ['product', 'Ürün / Uygulama'], ['kb', 'KB']].map(([key, label]) => <Grid item xs={12} md={key === 'search' ? 3 : 2} key={key}><TextField fullWidth size="small" label={label} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)} /></Grid>)}<Grid item xs={12} md={1.5}><FormControl size="small" fullWidth><InputLabel>Seviye</InputLabel><Select label="Seviye" value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}><MenuItem value="">Tümü</MenuItem>{['Critical', 'Important', 'High', 'Moderate', 'Medium', 'Low'].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12} md={1.5}><FormControl size="small" fullWidth><InputLabel>İstismar Durumu</InputLabel><Select label="İstismar Durumu" value={filters.exploited} onChange={(e) => setFilter('exploited', e.target.value)}><MenuItem value="">Tümü</MenuItem><MenuItem value="true">Evet</MenuItem><MenuItem value="false">Hayır</MenuItem></Select></FormControl></Grid><Grid item xs={12} md={2}><FormControl size="small" fullWidth><InputLabel>Kamuya Açıklanma Durumu</InputLabel><Select label="Kamuya Açıklanma Durumu" value={filters.publicly_disclosed} onChange={(e) => setFilter('publicly_disclosed', e.target.value)}><MenuItem value="">Tümü</MenuItem><MenuItem value="true">Evet</MenuItem><MenuItem value="false">Hayır</MenuItem></Select></FormControl></Grid></Grid></Paper>
    <Paper sx={{ ...panelSx, overflow: 'hidden' }}><TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}><Table size="small" sx={{ width: totalTableWidth, minWidth: '100%', tableLayout: 'fixed', '& th': { bgcolor: '#f8fafc', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.15 }, '& td': { verticalAlign: 'middle', overflow: 'hidden' }, '& tbody tr': { cursor: 'pointer' }, '& tbody tr:hover td': { bgcolor: '#eef6ff' } }}><TableHead><TableRow>{columns.map((column) => <ResizableHeaderCell key={column.key} column={column} width={columnWidths[column.key]} onResizeStart={startResize} />)}</TableRow></TableHead><TableBody>{rows.length ? rows.map((row) => <TableRow hover key={row.id} onClick={() => setDetail(row)}><TableCell><Tooltip title={row.cve_id || '-'}><Typography noWrap fontWeight={800}>{row.cve_id || '-'}</Typography></Tooltip></TableCell><TableCell>{truncateText(row.title)}</TableCell><TableCell><SeverityChip severity={row.severity || row.max_severity} /></TableCell><TableCell>{truncateText(row.product)}</TableCell><TableCell><Tooltip title={row.kb_article || '-'}><Typography noWrap variant="body2">{row.kb_article || '-'}</Typography></Tooltip></TableCell><TableCell>{truncateText(row.impact)}</TableCell><TableCell><Chip size="small" label={boolText(row.exploited)} color={row.exploited ? 'error' : 'default'} /></TableCell><TableCell><Chip size="small" label={boolText(row.publicly_disclosed)} color={row.publicly_disclosed ? 'warning' : 'default'} /></TableCell><TableCell>{row.release_month || '-'}</TableCell><TableCell>{formatDay(row.release_date)}</TableCell><TableCell onClick={(e) => e.stopPropagation()}><Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail(row)}>Detay</Button><Button size="small" variant="outlined" onClick={() => convert(row)}>Bulguya Dönüştür</Button></Stack></TableCell></TableRow>) : <TableRow><TableCell colSpan={columns.length} align="center">Kayıt yok. Ay seçip “MSRC Verisini Çek” butonunu kullanabilirsiniz.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
    <MsrcDetail row={detail} onClose={() => setDetail(null)} onConvert={convert} />
  </Stack>;
}

function MsrcDetail({ row, onClose, onConvert }) {
  return <Dialog open={Boolean(row)} onClose={onClose} maxWidth="lg" fullWidth><DialogTitle>MSRC CVE Detayı - {row?.cve_id}</DialogTitle><DialogContent dividers><Stack spacing={2}>{row && <><Box sx={gridSx(240)}><DetailField label="CVE" value={row.cve_id} /><DetailField label="Başlık" value={row.title} /><DetailField label="Seviye"><SeverityChip severity={row.severity || row.max_severity} /></DetailField><DetailField label="KB" value={row.kb_article} /><DetailField label="Etki" value={row.impact} /><DetailField label="İstismar Ediliyor mu?" value={boolText(row.exploited)} /><DetailField label="Kamuya Açık mı?" value={boolText(row.publicly_disclosed)} /><DetailField label="Yayın Ayı" value={row.release_month} /><DetailField label="Yayın Tarihi" value={formatDay(row.release_date)} /></Box><DetailField label="Etkilenen Ürün / Uygulama"><Box sx={{ maxHeight: 180, overflow: 'auto', p: 1.25, bgcolor: '#f8fafc', borderRadius: 1, whiteSpace: 'pre-wrap' }}>{row.product || '-'}</Box></DetailField><DetailField label="Microsoft URL">{row.url ? <Button href={row.url} target="_blank" rel="noreferrer">Microsoft bağlantısını aç</Button> : '-'}</DetailField></>}</Stack></DialogContent><DialogActions><Button onClick={() => onConvert(row)} disabled={!row}>Bulguya Dönüştür</Button><Button onClick={onClose}>Kapat</Button></DialogActions></Dialog>;
}

function DefenderPage({ show, refreshApp }) {
  const [tab, setTab] = useState(0); const [dashboard, setDashboard] = useState({}); const [vulns, setVulns] = useState([]); const [machines, setMachines] = useState([]); const [recs, setRecs] = useState([]); const [detail, setDetail] = useState(null);
  const load = async () => { const [d, v, m, r] = await Promise.all([getDefenderDashboard(), getDefenderVulnerabilities(), getDefenderMachines(), getDefenderRecommendations()]); setDashboard(d); setVulns(v.items || []); setMachines(m.items || []); setRecs(r.items || []); };
  useEffect(() => { load().catch((e) => show(e.message, 'error')); }, []);
  const convertCve = async (row) => { try { const res = await convertDefenderCve(row.cve_id); show(res.message || 'Defender CVE bulguya dönüştürüldü.', res.status === 'duplicate' ? 'warning' : 'success'); refreshApp(); } catch (e) { show(e.message, 'error'); } };
  const convertMachine = async (row) => { try { const res = await convertDefenderMachine({ cve_id: row.cve_id, machine_id: row.machine_id }); show(res.message || 'Defender cihaz zafiyeti bulguya dönüştürüldü.', res.status === 'duplicate' ? 'warning' : 'success'); refreshApp(); } catch (e) { show(e.message, 'error'); } };
  const topCards = [['Toplam CVE', dashboard.total_cve], ['Kritik CVE', dashboard.critical_cve], ['Yüksek CVE', dashboard.high_cve], ['Etkilenen Cihaz', dashboard.affected_machines], ['Açıkta Olan Uygulama', dashboard.exposed_applications], ['Public Exploit Olanlar', dashboard.public_exploit], ['Verified Exploit Olanlar', dashboard.verified_exploit], ['Remediation Bekleyenler', dashboard.pending_remediation], ['Son Sync', dashboard.last_sync ? formatDate(dashboard.last_sync) : '-']];
  return <Stack spacing={2.5}><SectionHeader title="Defender Zafiyetleri" description="Microsoft Defender Vulnerability Management CVE, cihaz/yazılım ve remediation görünümü." />{dashboard.demo && <Alert severity="warning">Defender entegrasyonu yapılandırılmadı. Gösterilen veriler demo amaçlıdır.</Alert>}<Stack direction="row" spacing={1}><Button variant="contained" onClick={() => load().then(() => show('Defender verileri yenilendi.', 'success'))}>Yenile</Button><Button variant="outlined" href={defenderExportUrl()}>Excel Export</Button></Stack><Box sx={gridSx(190)}>{topCards.map(([label, value], index) => <SummaryCard key={label} label={label} value={value ?? 0} accent={[CARD_ACCENTS.total, CARD_ACCENTS.critical, CARD_ACCENTS.high, CARD_ACCENTS.info, CARD_ACCENTS.info, CARD_ACCENTS.overdue, CARD_ACCENTS.urgent, CARD_ACCENTS.dueSoon, CARD_ACCENTS.closed][index] || CARD_ACCENTS.info} />)}</Box>
    <Box sx={gridSx(320)}><DataTable title="Severity Dağılımı" rows={dashboard.severity_distribution || []} columns={[{ key: 'name', label: 'Severity' }, { key: 'count', label: 'Adet' }]} /><DataTable title="En Çok Açık Görülen Uygulamalar" rows={dashboard.top_applications || []} columns={[{ key: 'name', label: 'Uygulama' }, { key: 'count', label: 'Adet' }]} /><DataTable title="En Çok Etkilenen Cihazlar" rows={dashboard.top_machines || []} columns={[{ key: 'name', label: 'Cihaz' }, { key: 'count', label: 'Adet' }]} /><DataTable title="Üretici Bazlı Açık Dağılımı" rows={dashboard.vendor_distribution || []} columns={[{ key: 'name', label: 'Üretici' }, { key: 'count', label: 'Adet' }]} /><DataTable title="CVE Trendi" rows={dashboard.cve_trend || []} columns={[{ key: 'name', label: 'Tarih' }, { key: 'count', label: 'Adet' }]} /><DataTable title="Remediation Önerileri Dağılımı" rows={dashboard.recommendation_distribution || []} columns={[{ key: 'name', label: 'Tip' }, { key: 'count', label: 'Adet' }]} /></Box>
    <Paper><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"><Tab label="CVE Listesi" /><Tab label="Cihaz/Yazılım Zafiyetleri" /><Tab label="Öneriler" /></Tabs></Paper>
    {tab === 0 && <DataTable title="Defender CVE Listesi" rows={vulns} columns={[{ key: 'cve_id', label: 'CVE ID' }, { key: 'description', label: 'Açıklama' }, { key: 'severity', label: 'Severity', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'cvss_v3', label: 'CVSS' }, { key: 'exposed_machines', label: 'Etkilenen Cihaz' }, { key: 'sample_devices', label: 'Örnek Cihazlar', render: (r) => sampleDeviceText(r) }, { key: 'public_exploit', label: 'Public Exploit', render: (r) => r.public_exploit ? 'Evet' : 'Hayır' }, { key: 'exploit_verified', label: 'Verified Exploit', render: (r) => r.exploit_verified ? 'Evet' : 'Hayır' }, { key: 'epss', label: 'EPSS' }, { key: 'published_on', label: 'Yayınlanma', render: (r) => formatDay(r.published_on) }, { key: 'updated_on', label: 'Güncellenme', render: (r) => formatDay(r.updated_on) }, { key: 'status', label: 'Durum' }, { key: 'msrc_match', label: 'MSRC', render: (r) => r.msrc_match ? <Chip label="MSRC Var" color="success" size="small" /> : <Chip label="MSRC kaydı bulunamadı" size="small" /> }]} actions={(r) => <Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail({ type: 'cve', row: r })}>Detay Gör</Button><Button size="small" onClick={() => convertCve(r)}>Bulguya Dönüştür</Button><Button size="small" onClick={() => setDetail({ type: 'msrc', row: r })}>MSRC ile Eşleştir</Button></Stack>} />}
    {tab === 1 && <DataTable title="Cihaz/Yazılım Zafiyetleri" rows={machines} columns={[{ key: 'machine_name', label: 'Cihaz Adı' }, { key: 'machine_id', label: 'Cihaz ID' }, { key: 'cve_id', label: 'CVE ID' }, { key: 'product_vendor', label: 'Üretici' }, { key: 'product_name', label: 'Uygulama' }, { key: 'product_version', label: 'Versiyon' }, { key: 'severity', label: 'Severity', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'fixing_kb_id', label: 'Fixing KB' }, { key: 'recommendation_id', label: 'Recommendation ID' }, { key: 'remediation_status', label: 'Remediation Status' }, { key: 'first_seen', label: 'İlk Görülme', render: (r) => formatDay(r.first_seen) }, { key: 'last_seen', label: 'Son Görülme', render: (r) => formatDay(r.last_seen) }]} actions={(r) => <Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail({ type: 'machine', row: r })}>Detay Gör</Button><Button size="small" onClick={() => convertMachine(r)}>Bulguya Dönüştür</Button></Stack>} />}
    {tab === 2 && <DataTable title="Defender Önerileri" rows={recs} columns={[{ key: 'recommendation_id', label: 'Recommendation ID' }, { key: 'recommendation_name', label: 'Öneri Adı' }, { key: 'product_name', label: 'Ürün' }, { key: 'vendor', label: 'Üretici' }, { key: 'recommendation_category', label: 'Kategori' }, { key: 'severity_score', label: 'Severity Score' }, { key: 'exposed_machines', label: 'Etkilenen Cihaz' }, { key: 'remediation_type', label: 'Remediation Type' }, { key: 'status', label: 'Status' }, { key: 'exposure_impact', label: 'Exposure Impact' }]} actions={() => <Button size="small">Detay Gör</Button>} />}
    <DefenderDetail detail={detail} onClose={() => setDetail(null)} machines={machines} recommendations={recs} show={show} />
  </Stack>;
}

function DefenderDetail({ detail, onClose, machines, recommendations, show }) {
  const [tab, setTab] = useState(0); const [affectedDevices, setAffectedDevices] = useState([]); const [affectedWarning, setAffectedWarning] = useState(''); const [loadingAffected, setLoadingAffected] = useState(false);
  const row = detail?.row || {}; const cachedAffected = machines.filter((m) => m.cve_id === row.cve_id); const affected = affectedDevices.length ? affectedDevices : cachedAffected.map((m) => ({ ...m, device_id: m.machine_id, device_name: displayDeviceName(m), os_platform: m.os_platform || '-' })); const recs = recommendations.filter((r) => r.recommendation_id === row.recommendation_id || r.product_name === row.product_name);
  const productFilters = { product_vendor: row.product_vendor, product_name: row.product_name, product_version: row.product_version };
  useEffect(() => { setTab(0); setAffectedDevices([]); setAffectedWarning(''); }, [detail?.type, row.cve_id, row.product_vendor, row.product_name, row.product_version]);
  useEffect(() => {
    if (!detail || tab !== 1 || !row.cve_id || affectedDevices.length || loadingAffected) return;
    setLoadingAffected(true);
    getDefenderAffectedDevices(row.cve_id, productFilters).then((payload) => {
      setAffectedDevices(payload.items || []);
      setAffectedWarning(payload.warning || '');
      if (payload.warning && show) show(payload.warning, 'warning');
    }).catch((error) => {
      setAffectedWarning(error.message || 'Cihaz adları alınamadı, cihaz ID bilgisi gösteriliyor.');
      if (show) show(error.message || 'Cihaz adları alınamadı, cihaz ID bilgisi gösteriliyor.', 'warning');
    }).finally(() => setLoadingAffected(false));
  }, [detail, tab, row.cve_id, row.product_vendor, row.product_name, row.product_version]);
  return <Dialog open={Boolean(detail)} onClose={onClose} maxWidth="lg" fullWidth><DialogTitle>Defender Detayı - {row.cve_id || row.recommendation_id}</DialogTitle><DialogContent dividers><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"><Tab label="Genel Bilgi" /><Tab label="Etkilenen Cihazlar" /><Tab label="Etkilenen Yazılımlar" /><Tab label="Remediation" /><Tab label="MSRC Eşleşmesi" /><Tab label="Ham Veri" /></Tabs><Box sx={{ mt: 2 }}>{tab === 0 && <pre>{JSON.stringify(row, null, 2)}</pre>}{tab === 1 && <Stack spacing={1.5}>{affectedWarning && <Alert severity="warning">{affectedWarning}</Alert>}<Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={800}>{loadingAffected ? 'Cihazlar yükleniyor...' : `${affected.length} cihaz`}</Typography><Button size="small" variant="outlined" href={row.cve_id ? defenderAffectedDevicesExportUrl(row.cve_id, productFilters) : undefined} disabled={!row.cve_id || loadingAffected}>Cihazları Excel’e Aktar</Button></Stack><DataTable title="Etkilenen Cihazlar" rows={affected} columns={[{ key: 'device_name', label: 'Cihaz Adı', render: (r) => displayDeviceName(r) }, { key: 'device_id', label: 'ID' }, { key: 'os_platform', label: 'OS' }, { key: 'rbac_group_name', label: 'RBAC Grubu' }, { key: 'product_vendor', label: 'Vendor' }, { key: 'product_name', label: 'Ürün / Uygulama' }, { key: 'product_version', label: 'Ürün Versiyonu' }, { key: 'cve_id', label: 'CVE' }, { key: 'severity', label: 'Seviye' }, { key: 'fixing_kb_id', label: 'KB' }, { key: 'first_seen', label: 'İlk Görülme', render: (r) => formatDay(r.first_seen) }, { key: 'last_seen', label: 'Son Görülme', render: (r) => formatDay(r.last_seen) }]} /></Stack>}{tab === 2 && <DataTable title="Etkilenen Yazılımlar" rows={affected} columns={[{ key: 'product_vendor', label: 'Üretici' }, { key: 'product_name', label: 'Uygulama' }, { key: 'product_version', label: 'Versiyon' }]} />}{tab === 3 && <DataTable title="Remediation" rows={recs} columns={[{ key: 'recommendation_id', label: 'ID' }, { key: 'recommendation_name', label: 'Öneri' }, { key: 'remediation_type', label: 'Tip' }]} />}{tab === 4 && <Alert severity={row.msrc_match ? 'success' : 'info'}>{row.msrc_match ? 'MSRC Var' : 'MSRC kaydı bulunamadı'}</Alert>}{tab === 5 && <pre>{JSON.stringify(row.raw || row, null, 2)}</pre>}</Box></DialogContent><DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions></Dialog>;
}


const REPORT_DUE_SOON_DAYS = 15;
const reportTableColumns = [
  { key: 'record_no', label: 'Kayıt No', width: 120 },
  { key: 'title', label: 'Başlık', width: 260 },
  { key: 'severity', label: 'Seviye', width: 105 },
  { key: 'related_unit', label: 'Birim', width: 190 },
  { key: 'related_person', label: 'İlgili Kişi', width: 170 },
  { key: 'status', label: 'Durum', width: 130 },
  { key: 'active_due_date', label: 'Termin', width: 115 },
  { key: 'due_date_change_count', label: 'Termin Revize Sayısı', width: 150 },
  { key: 'closed_at', label: 'Kapanış Tarihi', width: 130 },
];

function safeReportRows(rows) { return Array.isArray(rows) ? rows : []; }
function reportText(value) { return String(value || ''); }
function reportSearchText(value) { return reportText(value).toLocaleLowerCase('tr-TR'); }
function reportNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function reportDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function reportFormatDay(value) { const date = reportDateOnly(value); return date ? date.toLocaleDateString('tr-TR') : '-'; }
function reportFormatShortDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}><span>{date.toLocaleDateString('tr-TR')}</span><span>{date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></Box>;
}
function reportTodayStart(today = new Date()) { const date = today instanceof Date ? today : new Date(today); if (Number.isNaN(date.getTime())) return reportDateOnly(new Date()); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function isFindingOpen(row = {}) { return row?.status !== 'Kapatıldı'; }
function isReportOverdue(row = {}, today = new Date()) { const due = reportDateOnly(row?.active_due_date); const start = reportTodayStart(today); return Boolean(isFindingOpen(row) && due && due < start); }
function isReportDueSoon(row = {}, today = new Date()) { const due = reportDateOnly(row?.active_due_date); const start = reportTodayStart(today); const limit = new Date(start.getTime() + REPORT_DUE_SOON_DAYS * 86400000); return Boolean(isFindingOpen(row) && due && due >= start && due <= limit); }
const reportCardFilters = [
  { key: 'total', label: 'Toplam Bulgu', activeLabel: 'Toplam Bulgu', accent: CARD_ACCENTS.total, filename: 'tum-bulgular.xlsx', predicate: () => true },
  { key: 'open', label: 'Açık Bulgu', activeLabel: 'Açık Bulgular', accent: CARD_ACCENTS.open, filename: 'acik-bulgular.xlsx', predicate: isFindingOpen },
  { key: 'closed', label: 'Kapatılan Bulgu', activeLabel: 'Kapatılan Bulgular', accent: CARD_ACCENTS.closed, filename: 'kapatilan-bulgular.xlsx', predicate: (row = {}) => row?.status === 'Kapatıldı' },
  { key: 'urgentCritical', label: 'Acil + Kritik Açık', activeLabel: 'Acil + Kritik Açık', accent: CARD_ACCENTS.critical, filename: 'acil-kritik-acik-bulgular.xlsx', predicate: (row = {}) => isFindingOpen(row) && ['Acil', 'Kritik'].includes(row?.severity) },
  { key: 'high', label: 'Yüksek Açık', activeLabel: 'Yüksek Açık Bulgular', accent: CARD_ACCENTS.high, filename: 'yuksek-acik-bulgular.xlsx', predicate: (row = {}) => isFindingOpen(row) && row?.severity === 'Yüksek' },
  { key: 'overdue', label: 'Termin Geçen', activeLabel: 'Termin Geçen Bulgular', accent: CARD_ACCENTS.overdue, filename: 'termin-gecen-bulgular.xlsx', predicate: isReportOverdue },
  { key: 'dueSoon', label: 'Termin Yaklaşan', activeLabel: 'Termin Yaklaşan Bulgular', accent: CARD_ACCENTS.dueSoon, filename: 'termin-yaklasan-bulgular.xlsx', predicate: isReportDueSoon },
];
function reportDueState(row = {}) { if (!reportDateOnly(row?.active_due_date)) return 'Terminsiz'; if (isReportOverdue(row)) return 'Termin Geçen'; if (isReportDueSoon(row)) return 'Termin Yaklaşan'; return 'Zamanında'; }
function uniqueOptions(rows, key) { return [...new Set(safeReportRows(rows).flatMap((row = {}) => (key === 'related_person' ? splitRelatedPeople(row?.[key]) : [row?.[key]]).map((x) => reportText(x).trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'tr')); }
function includesText(value, search) { return reportSearchText(value).includes(reportSearchText(search)); }
const reportPredicateByKey = Object.fromEntries(reportCardFilters.map((card) => [card.key, card.predicate]));

async function downloadReportExcel(rows, filename, show) {
  const exportRows = safeReportRows(rows).filter((row) => row?.id);
  if (!exportRows.length) {
    show?.('Excel’e aktarılacak kayıt bulunmuyor.', 'warning');
    return;
  }
  try {
    const response = await fetch(exportUrl(exportRows.map((row) => row.id)));
    if (!response.ok) throw new Error('Excel export başarısız oldu');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    show?.(error.message || 'Excel export başarısız oldu', 'error');
  }
}

function ReportFindingTable({ title, rows, filename, onSelect, show }) {
  const safeRows = safeReportRows(rows);
  const tableWidth = reportTableColumns.reduce((sum, column) => sum + column.width, 0);
  return <Paper sx={{ ...panelSx, overflow: 'hidden' }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}><Typography variant="h6">{title} - {safeRows.length} kayıt</Typography><Button variant="outlined" onClick={() => downloadReportExcel(safeRows, filename, show)} disabled={!safeRows.length}>Excel’e Aktar</Button></Stack><TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}><Table size="small" sx={{ width: tableWidth, minWidth: '100%', tableLayout: 'fixed', '& th': { bgcolor: '#f8fafc', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.18 }, '& td': { verticalAlign: 'middle', overflow: 'hidden' }, '& tbody tr': { cursor: 'pointer' }, '& tbody tr:hover td': { bgcolor: '#eef6ff' } }}><TableHead><TableRow>{reportTableColumns.map((column) => <TableCell key={column.key} sx={{ width: column.width, minWidth: column.width }}>{column.label}</TableCell>)}</TableRow></TableHead><TableBody>{safeRows.length ? safeRows.map((row, index) => {
    const safeRow = row || {};
    return <TableRow hover key={safeRow.id || safeRow.record_no || index} onClick={() => onSelect?.(safeRow)}><TableCell><Tooltip title={displayRecordNo(safeRow.record_no)}><Typography noWrap variant="body2" fontWeight={700}>{displayRecordNo(safeRow.record_no)}</Typography></Tooltip></TableCell><TableCell><Tooltip title={safeRow.title || '-'}><Typography noWrap fontWeight={700}>{safeRow.title || '-'}</Typography></Tooltip></TableCell><TableCell><SeverityChip severity={safeRow.severity} /></TableCell><TableCell><Tooltip title={safeRow.related_unit || '-'}><Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{safeRow.related_unit || '-'}</Typography></Tooltip></TableCell><TableCell><Tooltip title={splitRelatedPeople(safeRow.related_person).join(', ') || '-'}><Typography noWrap variant="body2">{summarizeRelatedPeople(safeRow.related_person)}</Typography></Tooltip></TableCell><TableCell><StatusChip status={safeRow.status} /></TableCell><TableCell>{reportFormatDay(safeRow.active_due_date)}</TableCell><TableCell>{reportNumber(safeRow.due_date_change_count)}</TableCell><TableCell>{safeRow.status === 'Kapatıldı' ? reportFormatShortDateTime(safeRow.closed_at) : '-'}</TableCell></TableRow>;
  }) : <TableRow><TableCell colSpan={reportTableColumns.length} align="center">Kayıt yok.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>;
}

class ReportsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Raporlar ekranı hatası:', error, errorInfo);
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <Alert severity="error">Raporlar ekranı yüklenirken hata oluştu.</Alert>;
    }
    return this.props.children;
  }
}

function Reports({ findings, show }) {
  const safeFindings = safeReportRows(findings);
  const [detail, setDetail] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [activeReportCard, setActiveReportCard] = useState('');
  const options = useMemo(() => ({
    severities,
    statuses,
    related_units: uniqueOptions(safeFindings, 'related_unit'),
    related_people: uniqueOptions(safeFindings, 'related_person'),
  }), [safeFindings]);
  const generalFilteredFindings = useMemo(() => {
    const search = reportSearchText(filters?.search).trim();
    return safeFindings.filter((row = {}) => {
      const safeRow = row || {};
      if (search) {
        const haystack = [safeRow.record_no, displayRecordNo(safeRow.record_no), safeRow.title, safeRow.description, safeRow.recommendation, safeRow.related_unit, safeRow.related_person, safeRow.status, safeRow.severity].map(reportText).join(' ');
        if (!includesText(haystack, search)) return false;
      }
      if (filters.severity && safeRow.severity !== filters.severity) return false;
      if (filters.status && safeRow.status !== filters.status) return false;
      if (filters.related_unit && safeRow.related_unit !== filters.related_unit) return false;
      if (filters.related_person && !splitRelatedPeople(safeRow.related_person).includes(filters.related_person)) return false;
      if (filters.due_state && reportDueState(safeRow) !== filters.due_state) return false;
      return true;
    });
  }, [safeFindings, filters]);
  const activeCardDefinition = reportCardFilters.find((card) => card.key === activeReportCard);
  const filteredFindings = useMemo(() => {
    const rows = safeReportRows(generalFilteredFindings);
    return activeCardDefinition ? rows.filter(activeCardDefinition.predicate) : rows;
  }, [activeCardDefinition, generalFilteredFindings]);
  const reportGroups = useMemo(() => ({
    urgentCritical: filteredFindings.filter(reportPredicateByKey.urgentCritical),
    high: filteredFindings.filter(reportPredicateByKey.high),
    overdue: filteredFindings.filter(reportPredicateByKey.overdue),
    dueSoon: filteredFindings.filter(reportPredicateByKey.dueSoon),
  }), [filteredFindings]);
  const summaryCards = reportCardFilters.map((card) => ({ ...card, value: safeReportRows(generalFilteredFindings).filter(card.predicate).length }));
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));
  const clearGeneralFilters = () => setFilters(emptyFilters);
  const clearAllFilters = () => { setFilters(emptyFilters); setActiveReportCard(''); };
  const activeFilterTitle = activeCardDefinition ? activeCardDefinition.activeLabel : '';
  const activeResultsFilename = activeCardDefinition?.filename || 'filtrelenmis-bulgular.xlsx';

  return <Stack spacing={2.5} sx={{ minWidth: 0 }}><SectionHeader title="Raporlar" />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(7, minmax(0, 1fr))' }, gap: 2, alignItems: 'stretch' }}>{summaryCards.map((card) => <SummaryCard key={card.key} label={card.label} value={card.value} accent={card.accent} selected={activeReportCard === card.key} onClick={() => setActiveReportCard(card.key)} />)}</Box>
    {activeCardDefinition ? <Alert severity="info" action={<Button color="inherit" size="small" onClick={clearAllFilters}>Filtreyi Temizle</Button>} sx={{ alignItems: 'center' }}><b>Aktif filtre:</b> {activeFilterTitle}. Genel filtreler bu kart filtresinin üzerine uygulanır; temizleme butonu kart ve genel filtreleri kaldırır.</Alert> : null}
    <Paper sx={{ p: 2, border: '1px solid rgba(15,47,87,.08)', overflow: 'hidden' }}><Stack spacing={1.5}><Typography variant="h6">Genel Filtreler</Typography><Grid container spacing={1.5} alignItems="center"><Grid item xs={12} md={3}><TextField size="small" fullWidth label="Arama" value={filters.search || ''} onChange={(e) => setFilter('search', e.target.value)} placeholder="Başlık, kayıt no, açıklama..." /></Grid>{[
      ['severity', 'Seviye', options.severities], ['status', 'Durum', options.statuses], ['related_unit', 'Birim', options.related_units], ['related_person', 'İlgili Kişi', options.related_people], ['due_state', 'Termin Durumu', ['Termin Geçen', 'Termin Yaklaşan', 'Terminsiz', 'Zamanında']],
    ].map(([key, label, list]) => <Grid item xs={12} sm={6} md={key === 'related_unit' || key === 'related_person' ? 2 : 1.5} key={key}><FormControl size="small" fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}><MenuItem value="">Tümü</MenuItem>{safeReportRows(list).map((x) => <MenuItem value={x} key={x}>{x}</MenuItem>)}</Select></FormControl></Grid>)}<Grid item xs={12} md="auto"><Button onClick={clearGeneralFilters} variant={activeFilters.length ? 'contained' : 'text'}>Genel Filtreleri Temizle</Button></Grid>{activeFilters.length ? <Grid item xs={12}><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{activeFilters.map(([key, value]) => <Chip key={key} label={filterLabel(key, value)} onDelete={() => setFilter(key, '')} color="primary" variant="outlined" />)}</Stack></Grid> : null}</Grid></Stack></Paper>
    {activeCardDefinition ? <ReportFindingTable title={`Aktif Filtre Sonuçları: ${activeFilterTitle}`} rows={filteredFindings} filename={activeResultsFilename} onSelect={setDetail} show={show} /> : null}
    <ReportFindingTable title="Acil ve Kritik Açık Bulgular" rows={reportGroups.urgentCritical} filename="acil-kritik-acik-bulgular.xlsx" onSelect={setDetail} show={show} />
    <ReportFindingTable title="Yüksek Seviyeli Açık Bulgular" rows={reportGroups.high} filename="yuksek-acik-bulgular.xlsx" onSelect={setDetail} show={show} />
    <ReportFindingTable title="Termin Geçen Bulgular" rows={reportGroups.overdue} filename="termin-gecen-bulgular.xlsx" onSelect={setDetail} show={show} />
    <ReportFindingTable title="Termin Yaklaşan Bulgular" rows={reportGroups.dueSoon} filename="termin-yaklasan-bulgular.xlsx" onSelect={setDetail} show={show} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><Button variant="contained" onClick={() => downloadReportExcel(filteredFindings, activeCardDefinition ? activeResultsFilename : 'tum-rapor-bulgulari.xlsx', show)} disabled={!safeReportRows(filteredFindings).length}>{activeCardDefinition ? 'Aktif Filtre Excel Export' : 'Tüm Bulgular Excel Export'}</Button><Button variant="outlined" href={defenderExportUrl()}>Defender Excel Export</Button></Stack>
    <FindingDetail finding={detail} onClose={() => setDetail(null)} show={show} />
  </Stack>;
}

function SettingsPage({ show }) {
  const [settings, setSettings] = useState({ tenant_id: '', client_id: '', client_secret: '', api_base_url: 'https://api.security.microsoft.com', integration_enabled: false });
  const load = async () => setSettings(await getDefenderSettings());
  useEffect(() => { load().catch((e) => show(e.message, 'error')); }, []);
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  return <Paper sx={{ p: 3 }}><SectionHeader title="Ayarlar" description="Microsoft Defender entegrasyonu ve bağlantı bilgileri." /><Alert severity="info" sx={{ mb: 2 }}>Defender entegrasyonu için Microsoft Entra uygulaması ve gerekli API izinleri tanımlanmalıdır.</Alert><Grid container spacing={2}><Grid item xs={12} md={6}><TextField fullWidth label="Tenant ID" value={settings.tenant_id || ''} onChange={(e) => set('tenant_id', e.target.value)} /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Client ID" value={settings.client_id || ''} onChange={(e) => set('client_id', e.target.value)} /></Grid><Grid item xs={12} md={6}><TextField fullWidth type="password" label="Client Secret" placeholder={settings.client_secret || 'Client Secret'} onChange={(e) => set('client_secret', e.target.value)} helperText="Kaydedildikten sonra maskeli gösterilir; frontendde açık gösterilmez." /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Defender API Base URL" value={settings.api_base_url || ''} onChange={(e) => set('api_base_url', e.target.value)} /></Grid><Grid item xs={12}><FormControlLabel control={<Checkbox checked={Boolean(settings.integration_enabled)} onChange={(e) => set('integration_enabled', e.target.checked)} />} label="Entegrasyon Aktif / Pasif" /></Grid><Grid item xs={12}><Typography><b>Son Sync Zamanı:</b> {formatDate(settings.last_sync_time)}</Typography><Typography><b>Son Test:</b> {settings.last_test_status} - {settings.last_test_message}</Typography><Typography><b>Gerekli izinler:</b> Vulnerability.Read.All, SecurityRecommendation.Read.All</Typography></Grid><Grid item xs={12}><Stack direction="row" spacing={1}><Button variant="contained" onClick={async () => { try { await updateDefenderSettings(settings); show('Defender ayarları kaydedildi.', 'success'); load(); } catch (e) { show(e.message, 'error'); } }}>Kaydet</Button><Button variant="outlined" onClick={async () => { try { const r = await testDefenderConnection(); show(r.message, 'success'); load(); } catch (e) { show(e.message, 'error'); } }}>Bağlantıyı Test Et</Button><Button variant="outlined" onClick={async () => { try { await syncDefenderAll(); show('Tüm Defender verileri senkronize edildi.', 'success'); load(); } catch (e) { show(e.message, 'error'); } }}>Tüm Verileri Senkronize Et</Button></Stack></Grid></Grid></Paper>;
}

function LogsPage() { const [logs, setLogs] = useState([]); useEffect(() => { getLogs().then(setLogs).catch(() => setLogs([])); }, []); return <DataTable title="İşlem Logları" rows={logs} columns={[{ key: 'created_at', label: 'Tarih', render: (r) => formatDate(r.created_at) }, { key: 'event_type', label: 'İşlem Tipi' }, { key: 'message', label: 'Mesaj' }, { key: 'detail', label: 'Detay' }, { key: 'created_by', label: 'Kullanıcı' }]} />; }

function App() {
  const [tab, setTab] = useState(0); const [summary, setSummary] = useState(null); const [findings, setFindings] = useState([]); const [message, setMessage] = useState(''); const [severity, setSeverity] = useState('info');
  const show = (text, sev = 'info') => { setMessage(text); setSeverity(sev); };
  const refresh = async () => { try { const [dashboard, rows] = await Promise.all([getDashboard(), getFindings()]); setSummary(dashboard); setFindings(rows); } catch (e) { show(e.message, 'error'); } };
  useEffect(() => { refresh(); if (window.location.search) setTab(1); }, []);
  const saveNew = async (payload) => { try { await createFinding({ ...payload, related_person: normalizedRelatedPerson(payload.related_person) }); show('Bulgu başarıyla kaydedildi.', 'success'); setTab(1); refresh(); } catch (e) { show(e.message, 'error'); } };
  const goFindings = (filters = {}) => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`); setTab(1); };
  const imported = (r) => { show(`İçe aktarma tamamlandı: ${r.created} yeni, ${r.updated} güncellendi, ${r.failed} hatalı`, r.failed ? 'warning' : 'success'); refresh(); };
  const content = () => {
    if (tab === 0) return <Dashboard summary={summary} onFindingsFilter={goFindings} />;
    if (tab === 1) return <FindingsPage summary={summary} refresh={refresh} show={show} />;
    if (tab === 2) return <AddFindingPage onSave={saveNew} onImported={imported} show={show} />;
    if (tab === 3) return <MsrcPage show={show} refreshApp={refresh} />;
    if (tab === 4) return <DefenderPage show={show} refreshApp={refresh} />;
    if (tab === 5) return <ReportsErrorBoundary resetKey={safeReportRows(findings).length}><Reports findings={findings} show={show} /></ReportsErrorBoundary>;
    return <SettingsPage show={show} />;
  };
  return <ThemeProvider theme={theme}><CssBaseline /><Box sx={{ bgcolor: 'background.default', display: 'flex', minHeight: '100vh' }}><AppBar position="fixed" sx={{ zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1 }}><Toolbar sx={{ gap: 2, minHeight: 72 }}><BrandLogo height={40} /><Box sx={{ flexGrow: 1 }}><Typography variant="h6" noWrap>Risk ve Bulgu Yönetimi</Typography></Box><Button color="inherit" href={exportUrl()} variant="contained" sx={{ bgcolor: 'rgba(255,255,255,.15)' }}>Excel Dışa Aktar</Button></Toolbar></AppBar><Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box', bgcolor: '#fff', borderRight: '1px solid rgba(15, 47, 87, 0.10)', overflowX: 'hidden' } }}><Toolbar sx={{ minHeight: 76, justifyContent: 'center', px: 2 }}><BrandLogo height={36} /></Toolbar><Divider /><Box sx={{ p: 2 }}><Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ display: 'block', textAlign: 'center', letterSpacing: 1, fontSize: 11, mb: 1 }}>MENÜ</Typography><List disablePadding sx={{ display: 'grid', gap: .75 }}>{navigationItems.map((item, index) => <ListItemButton key={item} selected={tab === index} onClick={() => setTab(index)} sx={{ borderRadius: '18px', minHeight: 48, py: 1, px: 1.75, justifyContent: 'center', alignItems: 'center', textAlign: 'center', '&:hover': { bgcolor: '#f3f6fa' }, '&.Mui-selected': { bgcolor: '#0f2f57', color: 'primary.contrastText', boxShadow: '0 10px 22px rgba(15, 47, 87, .18)', '&:hover': { bgcolor: 'primary.dark' } } }}><ListItemText primary={item} sx={{ m: 0, textAlign: 'center' }} primaryTypographyProps={{ fontWeight: 800, textAlign: 'center', fontSize: 14, lineHeight: 1.2 }} secondaryTypographyProps={{ textAlign: 'center', fontSize: 11, lineHeight: 1.2, mt: .25, color: tab === index ? 'rgba(255,255,255,.76)' : 'text.secondary' }} /></ListItemButton>)}</List></Box></Drawer><Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}><Toolbar sx={{ minHeight: 72 }} /><Container maxWidth="xl" sx={{ py: 3.5 }}>{content()}</Container></Box><Snackbar open={Boolean(message)} autoHideDuration={6000} onClose={() => setMessage('')}><Alert severity={severity} onClose={() => setMessage('')}>{message}</Alert></Snackbar></Box></ThemeProvider>;
}

createRoot(document.getElementById('root')).render(<App />);
