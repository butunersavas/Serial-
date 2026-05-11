import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert, AppBar, Box, Button, Card, CardContent, Checkbox, Chip, Container, CssBaseline, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Drawer, FormControl, FormControlLabel, Grid, InputLabel, List,
  ListItemButton, ListItemText, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, ThemeProvider, Toolbar, Tooltip, Typography,
} from '@mui/material';
import theme, { severityColors } from './theme';
import {
  addAction, closeFindingApi, convertDefenderCve, convertDefenderMachine, createFinding, defenderExportUrl,
  deleteFinding, exportUrl, getActions, getDashboard, getDefenderDashboard, getDefenderMachines,
  getDefenderRecommendations, getDefenderSettings, getDefenderVulnerabilities, getFindingFilterOptions, getFindings, getLogs,
  importExcel, importTemplateUrl, previewExcel, reopenFindingApi, syncDefenderAll, testDefenderConnection, updateDefenderSettings,
  updateFinding,
} from './api';

const LOGO_SRC = '/assets/surat-logo.svg';
const DRAWER_WIDTH = 252;
const severities = ['Acil', 'Kritik', 'Yüksek', 'Orta', 'Düşük'];
const statuses = ['Devam Ediyor', 'Kapatıldı'];
const navigationItems = ['Gösterge Paneli', 'Bulgular', 'Bulgu Ekle', 'Microsoft CVE / MSRC', 'Defender Zafiyetleri', 'Raporlar', 'Ayarlar'];
const emptyFinding = { record_no: '', title: '', severity: 'Orta', impact: '', description: '', recommendation: '', related_unit: '', related_person: '', status: 'Devam Ediyor', due_date: '', new_due_date: '', note: '', source: 'Manuel' };

function formatDate(value) { return value ? new Date(value).toLocaleString('tr-TR') : '-'; }
function formatDay(value) { return value ? new Date(value).toLocaleDateString('tr-TR') : '-'; }
function isOverdue(row) { return row.status !== 'Kapatıldı' && row.active_due_date && new Date(row.active_due_date) < new Date(new Date().toDateString()); }
function isDueSoon(row) { const today = new Date(new Date().toDateString()); const due = row.active_due_date ? new Date(row.active_due_date) : null; return row.status !== 'Kapatıldı' && due && due >= today && due <= new Date(today.getTime() + 7 * 86400000); }
function BrandLogo({ height = 40 }) { return <Box component="img" src={LOGO_SRC} alt="Sürat Kargo" sx={{ display: 'block', height, maxHeight: height, maxWidth: '100%', objectFit: 'contain' }} />; }
function SeverityChip({ severity }) { return <Chip label={severity || '-'} size="small" sx={{ minWidth: 72, bgcolor: severityColors[severity] || { Critical: '#991b1b', High: '#dc2626', Medium: '#f59e0b', Low: '#16a34a' }[severity] || 'primary.main', color: severity === 'Orta' || severity === 'Medium' ? '#1f2937' : '#fff', fontWeight: 800 }} />; }
function SummaryCard({ label, value, helper, accent = 'primary.main', onClick }) { return <Card onClick={onClick} sx={{ height: '100%', cursor: onClick ? 'pointer' : 'default', transition: 'transform .15s ease, box-shadow .15s ease', '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 5 } : undefined }}><CardContent><Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography color="text.secondary" variant="body2" fontWeight={700}>{label}</Typography><Typography variant="h4" fontWeight={900} sx={{ mt: .5 }}>{value ?? '-'}</Typography></Box><Box sx={{ width: 10, height: 54, borderRadius: 10, bgcolor: accent }} /></Stack>{helper && <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1.5 }}>{helper}</Typography>}</CardContent></Card>; }
function SectionHeader({ title, description }) { return <Box sx={{ mb: 2.5 }}><Typography variant="h5" color="primary.dark">{title}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{description}</Typography></Box>; }

function DataTable({ title, rows = [], columns, actions }) {
  return <Paper sx={{ p: 2.5, height: '100%', border: '1px solid rgba(15, 47, 87, 0.08)' }}><Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography><TableContainer><Table size="small"><TableHead><TableRow>{columns.map((c) => <TableCell key={c.key}>{c.label}</TableCell>)}{actions && <TableCell>İşlem</TableCell>}</TableRow></TableHead><TableBody>{rows.length ? rows.map((row, i) => <TableRow hover key={row.id || row.cve_id || row.recommendation_id || i}>{columns.map((c) => <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '-')}</TableCell>)}{actions && <TableCell>{actions(row)}</TableCell>}</TableRow>) : <TableRow><TableCell colSpan={columns.length + (actions ? 1 : 0)}>Kayıt yok.</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>;
}

function Dashboard({ summary, onFindingsFilter }) {
  const d = summary || {};
  const defender = d.defender_summary || {};
  const cards = [
    ['Toplam Bulgu', d.total, 'Tüm kayıtlar', 'primary.main', {}],
    ['Açık Kalan', d.open, 'Kapatılmamış kayıtlar', '#64748b', { status: 'Devam Ediyor' }],
    ['Kapatılan', d.closed, 'Tamamlanan kayıtlar', '#16a34a', { status: 'Kapatıldı' }],
    ['Acil', d.severity_counts?.Acil || 0, 'Acil seviye', severityColors.Acil, { severity: 'Acil' }],
    ['Kritik', d.severity_counts?.Kritik || 0, 'Kritik seviye', severityColors.Kritik, { severity: 'Kritik' }],
    ['Yüksek', d.severity_counts?.Yüksek || 0, 'Yüksek seviye', severityColors.Yüksek, { severity: 'Yüksek' }],
    ['Orta', d.severity_counts?.Orta || 0, 'Orta seviye', severityColors.Orta, { severity: 'Orta' }],
    ['Düşük', d.severity_counts?.Düşük || 0, 'Düşük seviye', severityColors.Düşük, { severity: 'Düşük' }],
    ['Geciken Bulgular', d.overdue || d.delayed || 0, 'Aktif termini geçmiş', '#dc2626', { due_state: 'overdue' }],
    ['Termin Yaklaşan', d.due_soon || 0, '7 gün içinde', '#f59e0b', { due_state: 'due_soon' }],
  ];
  return <Stack spacing={3}><SectionHeader title="Gösterge Paneli" description="Bulgular, SLA durumu ve Defender zafiyet özetleri." />
    <Grid container spacing={2}>{cards.map(([label, value, helper, accent, filters]) => <Grid item xs={12} sm={6} md={4} lg={12 / 7} key={label}><SummaryCard label={label} value={value} helper={helper} accent={accent} onClick={() => onFindingsFilter(filters)} /></Grid>)}</Grid>
    <Paper sx={{ p: 2.5 }}><Typography variant="h6" sx={{ mb: 2 }}>Microsoft Defender Özeti</Typography><Grid container spacing={2}>{[
      ['Defender Toplam CVE', defender.total_cve || 0], ['Kritik Defender CVE', defender.critical_cve || 0], ['Yüksek Defender CVE', defender.high_cve || 0], ['Etkilenen Cihaz Sayısı', defender.affected_machines || 0], ['Public Exploit', defender.public_exploit || 0], ['Bulguya Dönüştürülen Defender CVE', defender.converted_findings || 0],
    ].map(([label, value]) => <Grid item xs={12} md={2} key={label}><SummaryCard label={label} value={value} /></Grid>)}</Grid></Paper>
    <Grid container spacing={2}><Grid item xs={12} md={6}><DataTable title="Geciken Bulgular" rows={d.overdue_findings || []} columns={[{ key: 'record_no', label: 'Kayıt No' }, { key: 'title', label: 'Başlık' }, { key: 'severity', label: 'Seviye', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'active_due_date', label: 'Termin', render: (r) => formatDay(r.active_due_date) }]} /></Grid><Grid item xs={12} md={6}><DataTable title="Termin Yaklaşanlar" rows={d.approaching_due || []} columns={[{ key: 'record_no', label: 'Kayıt No' }, { key: 'title', label: 'Başlık' }, { key: 'severity', label: 'Seviye', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'active_due_date', label: 'Termin', render: (r) => formatDay(r.active_due_date) }]} /></Grid></Grid>
  </Stack>;
}

function FindingForm({ initial = emptyFinding, onSubmit, submitLabel = 'Kaydet' }) {
  const [form, setForm] = useState({ ...emptyFinding, ...initial });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = (e) => { e.preventDefault(); onSubmit({ ...form, due_date: form.due_date || null, new_due_date: form.new_due_date || null }); };
  return <Box component="form" onSubmit={submit}><Grid container spacing={2}>{[
    ['record_no', 'Kayıt No'], ['title', 'Bulgu Başlığı'], ['related_unit', 'İlgili Birim / Kurum'], ['related_person', 'İlgili Kişi'], ['due_date', 'Termin Tarih', 'date'], ['new_due_date', 'Yeni Termin', 'date'],
  ].map(([key, label, type]) => <Grid item xs={12} md={6} key={key}><TextField fullWidth required={key === 'record_no'} type={type || 'text'} label={label} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} InputLabelProps={type ? { shrink: true } : undefined} /></Grid>)}
    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>Durum Seviyesi</InputLabel><Select label="Durum Seviyesi" value={form.severity} onChange={(e) => set('severity', e.target.value)}>{severities.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl></Grid>
    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>Durum</InputLabel><Select label="Durum" value={form.status} onChange={(e) => set('status', e.target.value)}>{statuses.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl></Grid>
    {['impact', 'description', 'recommendation', 'note'].map((key) => <Grid item xs={12} key={key}><TextField fullWidth multiline minRows={2} label={{ impact: 'Bulgunun Etkisi', description: 'Bulgunun Açıklaması', recommendation: 'Çözüm Önerisi', note: 'Notlar' }[key]} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} /></Grid>)}
    <Grid item xs={12}><Button type="submit" variant="contained">{submitLabel}</Button></Grid></Grid></Box>;
}

const emptyFilters = { search: '', severity: '', status: '', related_unit: '', related_person: '', due_state: '', source: '' };

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
  const labels = { search: 'Arama', severity: 'Seviye', status: 'Durum', related_unit: 'Birim', related_person: 'İlgili Kişi', due_state: 'Termin', source: 'Kaynak' };
  return `${labels[key] || key}: ${value}`;
}

function isSameFilter(a, b) {
  return Object.keys(emptyFilters).every((key) => (a[key] || '') === (b[key] || ''));
}

function FindingsPage({ summary, refresh, show }) {
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({ related_units: [], related_people: [], sources: [], severities, statuses });
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const readFilters = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      ...emptyFilters,
      ...Object.fromEntries(Object.keys(emptyFilters).map((key) => [key, filterValueFromUrl(key, params.get(key) || '')])),
    };
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
    } catch (e) {
      show(e.message, 'error');
    }
  };
  useEffect(() => { const initial = readFilters(); setFilters(initial); load(initial); }, []);

  const applyFilters = (next) => {
    setFilters(next);
    setPage(0);
    writeFilters(next);
    load(next);
  };
  const setFilter = (key, value) => applyFilters({ ...filters, [key]: value });
  const clearFilters = () => applyFilters(emptyFilters);
  const reloadAll = () => { load(filters); refresh(); };
  const saveEdit = async (payload) => { try { await updateFinding(editing.id, payload); setEditing(null); show('Bulgu güncellendi.', 'success'); reloadAll(); } catch (e) { show(e.message, 'error'); } };

  const miniCards = [
    ['Toplam Bulgu', summary?.total || 0, {}, 'primary.main'],
    ['Açık Kalan', summary?.open || 0, { status: 'Devam Ediyor' }, '#64748b'],
    ['Kapatılan', summary?.closed || 0, { status: 'Kapatıldı' }, '#16a34a'],
    ['Kritik', summary?.severity_counts?.Kritik || 0, { severity: 'Kritik' }, severityColors.Kritik],
    ['Yüksek', summary?.severity_counts?.Yüksek || 0, { severity: 'Yüksek' }, severityColors.Yüksek],
    ['Geciken', summary?.overdue || summary?.delayed || 0, { due_state: 'Geciken' }, '#dc2626'],
    ['Termin Yaklaşan', summary?.due_soon || 0, { due_state: 'Termin Yaklaşan' }, '#f59e0b'],
  ];
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));
  const visible = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const actionCellSx = {
    width: 260,
    minWidth: 260,
    maxWidth: 260,
    position: 'sticky',
    right: 0,
    zIndex: 2,
    bgcolor: '#fff',
    boxShadow: '-10px 0 18px -18px rgba(15,47,87,.85)',
  };

  return <Stack spacing={2.25} sx={{ minWidth: 0 }}><SectionHeader title="Bulgular" description="İç bulgu kayıtları, durum, sorumlu kişi ve aksiyon takibi." />
    <Grid container spacing={1.25}>{miniCards.map(([label, value, cardFilters, accent]) => {
      const selected = isSameFilter(filters, { ...emptyFilters, ...cardFilters });
      return <Grid item xs={6} md={3} lg={12 / 7} key={label}><Paper onClick={() => applyFilters({ ...emptyFilters, ...cardFilters })} sx={{ p: 1.25, border: selected ? `2px solid ${accent}` : '1px solid rgba(15,47,87,.08)', cursor: 'pointer', bgcolor: selected ? 'rgba(15,47,87,.06)' : '#fff', transition: 'all .15s ease', '&:hover': { transform: 'translateY(-1px)', boxShadow: 3 } }}><Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography><Typography variant="h6" fontWeight={900}>{value}</Typography></Paper></Grid>;
    })}</Grid>
    <Paper sx={{ p: 2, border: '1px solid rgba(15,47,87,.08)', overflow: 'hidden' }}><Grid container spacing={1.5} alignItems="center"><Grid item xs={12} md={3}><TextField size="small" fullWidth label="Arama" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Başlık, kayıt no, açıklama..." /></Grid>{[
      ['severity', 'Durum Seviyesi', options.severities || severities], ['status', 'Durum', options.statuses || statuses], ['related_unit', 'İlgili Birim / Kurum', options.related_units || []], ['related_person', 'İlgili Kişi', options.related_people || []], ['due_state', 'Termin Durumu', ['Geciken', 'Termin Yaklaşan', 'Terminsiz']], ['source', 'Kaynak', options.sources || ['Manuel', 'Excel', 'MSRC', 'Defender']],
    ].map(([key, label, list]) => <Grid item xs={12} sm={6} md={key === 'related_unit' || key === 'related_person' ? 2 : 1.5} key={key}><FormControl size="small" fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}><MenuItem value="">Tümü</MenuItem>{list.map((x) => <MenuItem value={x} key={x}>{x}</MenuItem>)}</Select></FormControl></Grid>)}<Grid item xs={12} md="auto"><Button onClick={clearFilters} variant={activeFilters.length ? 'contained' : 'text'}>Filtreleri Temizle</Button></Grid>{activeFilters.length ? <Grid item xs={12}><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{activeFilters.map(([key, value]) => <Chip key={key} label={filterLabel(key, value)} onDelete={() => setFilter(key, '')} color="primary" variant="outlined" />)}</Stack></Grid> : null}</Grid></Paper>
    <Paper sx={{ border: '1px solid rgba(15,47,87,.08)', overflow: 'hidden', maxWidth: '100%' }}><TableContainer sx={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 1590, tableLayout: 'fixed', '& th': { bgcolor: '#f8fafc', fontWeight: 900, whiteSpace: 'nowrap' }, '& td': { py: .85, verticalAlign: 'middle' }, '& tbody tr:hover td': { bgcolor: '#eef6ff' }, '& tbody tr:hover td:last-of-type': { bgcolor: '#eef6ff' } }}><TableHead><TableRow>{[
      ['Kayıt No', 90], ['Başlık', 310], ['Seviye', 100], ['Birim', 180], ['İlgili Kişi', 160], ['Durum', 130], ['Termin', 120], ['Termin Değişim Sayısı', 150], ['Son Güncelleme', 150],
    ].map(([h, width]) => <TableCell key={h} sx={{ width, minWidth: width }}>{h}</TableCell>)}<TableCell sx={{ ...actionCellSx, zIndex: 4 }}>İşlem</TableCell></TableRow></TableHead><TableBody>{visible.length ? visible.map((r) => <TableRow key={r.id} sx={{ '& td': { bgcolor: isOverdue(r) ? '#fff1f2' : isDueSoon(r) ? '#fffbeb' : r.status === 'Kapatıldı' ? '#f0fdf4' : '#fff' } }}><TableCell sx={{ width: 90 }}>{r.record_no || '-'}</TableCell><TableCell sx={{ width: 310 }}><Tooltip title={r.title || '-'}><Typography noWrap fontWeight={700}>{r.title || '-'}</Typography></Tooltip></TableCell><TableCell sx={{ width: 100 }}><SeverityChip severity={r.severity} /></TableCell><TableCell sx={{ width: 180 }}><Tooltip title={r.related_unit || '-'}><Typography sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{r.related_unit || '-'}</Typography></Tooltip></TableCell><TableCell sx={{ width: 160 }}>{r.related_person || '-'}</TableCell><TableCell sx={{ width: 130 }}><StatusChip status={r.status} /></TableCell><TableCell sx={{ width: 120 }}>{formatDay(r.active_due_date)}</TableCell><TableCell sx={{ width: 150 }}>{r.due_date_change_count ?? 0}</TableCell><TableCell sx={{ width: 150 }}>{formatDate(r.updated_at)}</TableCell><TableCell sx={actionCellSx}><Stack direction="row" spacing={.5} useFlexGap flexWrap="wrap"><Tooltip title="Bulgu detayını göster"><Button size="small" variant="text" onClick={() => setDetail(r)}>Detay</Button></Tooltip><Tooltip title="Bulgu bilgilerini düzenle"><Button size="small" variant="text" onClick={() => setEditing(r)}>Düzenle</Button></Tooltip><Tooltip title={r.status === 'Kapatıldı' ? 'Bulguyu tekrar aç' : 'Bulguyu kapat'}><Button size="small" variant="outlined" onClick={async () => { await (r.status === 'Kapatıldı' ? reopenFindingApi(r.id) : closeFindingApi(r.id)); reloadAll(); }}>{r.status === 'Kapatıldı' ? 'Aç' : 'Kapat'}</Button></Tooltip><Tooltip title="Bulguyu sil"><Button size="small" color="error" variant="contained" onClick={async () => { await deleteFinding(r.id); reloadAll(); }}>Sil</Button></Tooltip></Stack></TableCell></TableRow>) : <TableRow><TableCell colSpan={10} align="center">Kayıt yok.</TableCell></TableRow>}</TableBody></Table></TableContainer><TablePagination component="div" count={rows.length} page={page} rowsPerPage={rowsPerPage} onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[10, 25, 50, 100]} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} labelRowsPerPage="Sayfa başına" /></Paper>
    <FindingDetail finding={detail} onClose={() => setDetail(null)} show={show} />
    <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="md" fullWidth><DialogTitle>Bulgu Düzenle</DialogTitle><DialogContent dividers>{editing && <FindingForm initial={editing} onSubmit={saveEdit} submitLabel="Güncelle" />}</DialogContent></Dialog>
  </Stack>;
}

function FindingDetail({ finding, onClose, show }) {
  const [actions, setActions] = useState([]);
  useEffect(() => { if (finding) getActions(finding.id).then(setActions).catch((e) => show(e.message, 'error')); }, [finding?.id]);
  return <Dialog open={Boolean(finding)} onClose={onClose} maxWidth="md" fullWidth><DialogTitle>{finding?.record_no} Detayı</DialogTitle><DialogContent dividers><Stack spacing={2}><Typography variant="h6">{finding?.title}</Typography><Typography>{finding?.description}</Typography><DataTable title="Aksiyon Geçmişi" rows={actions} columns={[{ key: 'created_at', label: 'Tarih', render: (r) => formatDate(r.created_at) }, { key: 'action_type', label: 'Tip' }, { key: 'old_value', label: 'Eski Değer' }, { key: 'new_value', label: 'Yeni Değer' }, { key: 'note', label: 'Not' }, { key: 'created_by', label: 'Kullanıcı' }]} /></Stack></DialogContent><DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions></Dialog>;
}

function ExcelImportPanel({ onImported, show }) {
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [result, setResult] = useState(null);
  return <Stack spacing={2}><Alert severity="info">Import şablonu kullanıcıdaki import.xlsx yapısıyla uyumludur. Örnek satırları içe aktarmadan önce silebilirsiniz.</Alert><Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap"><Button variant="outlined" component="label">Excel Dosyası Seç<input hidden type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files?.[0]); setPreview(null); setResult(null); }} /></Button><Typography>{file?.name || 'Dosya seçilmedi'}</Typography><Button disabled={!file} onClick={async () => { try { setPreview(await previewExcel(file)); } catch (e) { show(e.message, 'error'); } }}>Önizle</Button><Button variant="contained" disabled={!file} onClick={async () => { try { const r = await importExcel(file); setResult(r); onImported(r); } catch (e) { show(e.message, 'error'); } }}>İçe Aktar</Button><Button variant="outlined" href={importTemplateUrl()}>Örnek Import Şablonu İndir</Button></Stack>{preview && <Alert severity={preview.failed ? 'warning' : 'info'}>{preview.total} kayıt önizlendi, {preview.failed} hatalı satır.</Alert>}{result && <Grid container spacing={1.5}>{[['Eklenen', result.created], ['Güncellenen', result.updated], ['Hatalı', result.failed]].map(([label, value]) => <Grid item xs={12} md={4} key={label}><SummaryCard label={label} value={value} /></Grid>)}</Grid>}{(preview?.errors?.length || result?.errors?.length) ? <DataTable title="Hatalı Satırlar" rows={(result?.errors || preview?.errors || []).map((x, i) => ({ id: i, ...x }))} columns={[{ key: 'row', label: 'Satır' }, { key: 'message', label: 'Hata' }]} /> : null}</Stack>;
}

function AddFindingPage({ onSave, onImported, show }) {
  const [tab, setTab] = useState(0);
  return <Paper sx={{ p: 3 }}><SectionHeader title="Bulgu Ekle" description="Manuel kayıt veya Excel ile toplu bulgu ekleme." /><Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}><Tab label="Manuel Bulgu Ekle" /><Tab label="Excel ile Toplu Bulgu Ekle" /><Tab label="Örnek Import Şablonu İndir" /></Tabs>{tab === 0 ? <FindingForm onSubmit={onSave} /> : tab === 1 ? <ExcelImportPanel show={show} onImported={onImported} /> : <Stack spacing={2}><Alert severity="info">Toplu import için kullanılacak güncel örnek şablonu indirebilirsiniz.</Alert><Button variant="contained" href={importTemplateUrl()}>Örnek Import Şablonu İndir</Button></Stack>}</Paper>;
}

function MsrcPage() { return <Paper sx={{ p: 3 }}><SectionHeader title="Microsoft CVE / MSRC" description="Mevcut MSRC entegrasyonu korunmuştur. Defender eşleştirmeleri CVE ID üzerinden Defender detay ekranında gösterilir." /><Alert severity="info">Bu aşama Defender Vulnerability Management entegrasyonudur; MSRC ekranı mevcut yapıyı bozmamak için ayrı tutuldu.</Alert></Paper>; }

function DefenderPage({ show, refreshApp }) {
  const [tab, setTab] = useState(0); const [dashboard, setDashboard] = useState({}); const [vulns, setVulns] = useState([]); const [machines, setMachines] = useState([]); const [recs, setRecs] = useState([]); const [detail, setDetail] = useState(null);
  const load = async () => { const [d, v, m, r] = await Promise.all([getDefenderDashboard(), getDefenderVulnerabilities(), getDefenderMachines(), getDefenderRecommendations()]); setDashboard(d); setVulns(v.items || []); setMachines(m.items || []); setRecs(r.items || []); };
  useEffect(() => { load().catch((e) => show(e.message, 'error')); }, []);
  const convertCve = async (row) => { try { const res = await convertDefenderCve(row.cve_id); show(res.message || 'Defender CVE bulguya dönüştürüldü.', res.status === 'duplicate' ? 'warning' : 'success'); refreshApp(); } catch (e) { show(e.message, 'error'); } };
  const convertMachine = async (row) => { try { const res = await convertDefenderMachine({ cve_id: row.cve_id, machine_id: row.machine_id }); show(res.message || 'Defender cihaz zafiyeti bulguya dönüştürüldü.', res.status === 'duplicate' ? 'warning' : 'success'); refreshApp(); } catch (e) { show(e.message, 'error'); } };
  const topCards = [['Toplam CVE', dashboard.total_cve], ['Kritik CVE', dashboard.critical_cve], ['Yüksek CVE', dashboard.high_cve], ['Etkilenen Cihaz', dashboard.affected_machines], ['Açıkta Olan Uygulama', dashboard.exposed_applications], ['Public Exploit Olanlar', dashboard.public_exploit], ['Verified Exploit Olanlar', dashboard.verified_exploit], ['Remediation Bekleyenler', dashboard.pending_remediation], ['Son Sync', dashboard.last_sync ? formatDate(dashboard.last_sync) : '-']];
  return <Stack spacing={2.5}><SectionHeader title="Defender Zafiyetleri" description="Microsoft Defender Vulnerability Management CVE, cihaz/yazılım ve remediation görünümü." />{dashboard.demo && <Alert severity="warning">Defender entegrasyonu yapılandırılmadı. Gösterilen veriler demo amaçlıdır.</Alert>}<Stack direction="row" spacing={1}><Button variant="contained" onClick={() => load().then(() => show('Defender verileri yenilendi.', 'success'))}>Yenile</Button><Button variant="outlined" href={defenderExportUrl()}>Excel Export</Button></Stack><Grid container spacing={2}>{topCards.map(([label, value]) => <Grid item xs={12} sm={6} md={4} lg={2.4} key={label}><SummaryCard label={label} value={value ?? 0} /></Grid>)}</Grid>
    <Grid container spacing={2}><Grid item xs={12} md={4}><DataTable title="Severity Dağılımı" rows={dashboard.severity_distribution || []} columns={[{ key: 'name', label: 'Severity' }, { key: 'count', label: 'Adet' }]} /></Grid><Grid item xs={12} md={4}><DataTable title="En Çok Açık Görülen Uygulamalar" rows={dashboard.top_applications || []} columns={[{ key: 'name', label: 'Uygulama' }, { key: 'count', label: 'Adet' }]} /></Grid><Grid item xs={12} md={4}><DataTable title="En Çok Etkilenen Cihazlar" rows={dashboard.top_machines || []} columns={[{ key: 'name', label: 'Cihaz' }, { key: 'count', label: 'Adet' }]} /></Grid><Grid item xs={12} md={4}><DataTable title="Üretici Bazlı Açık Dağılımı" rows={dashboard.vendor_distribution || []} columns={[{ key: 'name', label: 'Üretici' }, { key: 'count', label: 'Adet' }]} /></Grid><Grid item xs={12} md={4}><DataTable title="CVE Trendi" rows={dashboard.cve_trend || []} columns={[{ key: 'name', label: 'Tarih' }, { key: 'count', label: 'Adet' }]} /></Grid><Grid item xs={12} md={4}><DataTable title="Remediation Önerileri Dağılımı" rows={dashboard.recommendation_distribution || []} columns={[{ key: 'name', label: 'Tip' }, { key: 'count', label: 'Adet' }]} /></Grid></Grid>
    <Paper><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"><Tab label="CVE Listesi" /><Tab label="Cihaz/Yazılım Zafiyetleri" /><Tab label="Öneriler" /></Tabs></Paper>
    {tab === 0 && <DataTable title="Defender CVE Listesi" rows={vulns} columns={[{ key: 'cve_id', label: 'CVE ID' }, { key: 'description', label: 'Açıklama' }, { key: 'severity', label: 'Severity', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'cvss_v3', label: 'CVSS' }, { key: 'exposed_machines', label: 'Etkilenen Cihaz' }, { key: 'public_exploit', label: 'Public Exploit', render: (r) => r.public_exploit ? 'Evet' : 'Hayır' }, { key: 'exploit_verified', label: 'Verified Exploit', render: (r) => r.exploit_verified ? 'Evet' : 'Hayır' }, { key: 'epss', label: 'EPSS' }, { key: 'published_on', label: 'Yayınlanma', render: (r) => formatDay(r.published_on) }, { key: 'updated_on', label: 'Güncellenme', render: (r) => formatDay(r.updated_on) }, { key: 'status', label: 'Durum' }, { key: 'msrc_match', label: 'MSRC', render: (r) => r.msrc_match ? <Chip label="MSRC Var" color="success" size="small" /> : <Chip label="MSRC kaydı bulunamadı" size="small" /> }]} actions={(r) => <Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail({ type: 'cve', row: r })}>Detay Gör</Button><Button size="small" onClick={() => convertCve(r)}>Bulguya Dönüştür</Button><Button size="small" onClick={() => setDetail({ type: 'msrc', row: r })}>MSRC ile Eşleştir</Button></Stack>} />}
    {tab === 1 && <DataTable title="Cihaz/Yazılım Zafiyetleri" rows={machines} columns={[{ key: 'machine_name', label: 'Cihaz Adı' }, { key: 'machine_id', label: 'Cihaz ID' }, { key: 'cve_id', label: 'CVE ID' }, { key: 'product_vendor', label: 'Üretici' }, { key: 'product_name', label: 'Uygulama' }, { key: 'product_version', label: 'Versiyon' }, { key: 'severity', label: 'Severity', render: (r) => <SeverityChip severity={r.severity} /> }, { key: 'fixing_kb_id', label: 'Fixing KB' }, { key: 'recommendation_id', label: 'Recommendation ID' }, { key: 'remediation_status', label: 'Remediation Status' }, { key: 'first_seen', label: 'İlk Görülme', render: (r) => formatDay(r.first_seen) }, { key: 'last_seen', label: 'Son Görülme', render: (r) => formatDay(r.last_seen) }]} actions={(r) => <Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail({ type: 'machine', row: r })}>Detay Gör</Button><Button size="small" onClick={() => convertMachine(r)}>Bulguya Dönüştür</Button></Stack>} />}
    {tab === 2 && <DataTable title="Defender Önerileri" rows={recs} columns={[{ key: 'recommendation_id', label: 'Recommendation ID' }, { key: 'recommendation_name', label: 'Öneri Adı' }, { key: 'product_name', label: 'Ürün' }, { key: 'vendor', label: 'Üretici' }, { key: 'recommendation_category', label: 'Kategori' }, { key: 'severity_score', label: 'Severity Score' }, { key: 'exposed_machines', label: 'Etkilenen Cihaz' }, { key: 'remediation_type', label: 'Remediation Type' }, { key: 'status', label: 'Status' }, { key: 'exposure_impact', label: 'Exposure Impact' }]} actions={() => <Button size="small">Detay Gör</Button>} />}
    <DefenderDetail detail={detail} onClose={() => setDetail(null)} machines={machines} recommendations={recs} />
  </Stack>;
}

function DefenderDetail({ detail, onClose, machines, recommendations }) {
  const [tab, setTab] = useState(0); const row = detail?.row || {}; const affected = machines.filter((m) => m.cve_id === row.cve_id); const recs = recommendations.filter((r) => r.recommendation_id === row.recommendation_id || r.product_name === row.product_name);
  return <Dialog open={Boolean(detail)} onClose={onClose} maxWidth="lg" fullWidth><DialogTitle>Defender Detayı - {row.cve_id || row.recommendation_id}</DialogTitle><DialogContent dividers><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"><Tab label="Genel Bilgi" /><Tab label="Etkilenen Cihazlar" /><Tab label="Etkilenen Yazılımlar" /><Tab label="Remediation" /><Tab label="MSRC Eşleşmesi" /><Tab label="Ham Veri" /></Tabs><Box sx={{ mt: 2 }}>{tab === 0 && <pre>{JSON.stringify(row, null, 2)}</pre>}{tab === 1 && <DataTable title="Etkilenen Cihazlar" rows={affected} columns={[{ key: 'machine_name', label: 'Cihaz' }, { key: 'machine_id', label: 'ID' }, { key: 'severity', label: 'Severity' }]} />}{tab === 2 && <DataTable title="Etkilenen Yazılımlar" rows={affected} columns={[{ key: 'product_vendor', label: 'Üretici' }, { key: 'product_name', label: 'Uygulama' }, { key: 'product_version', label: 'Versiyon' }]} />}{tab === 3 && <DataTable title="Remediation" rows={recs} columns={[{ key: 'recommendation_id', label: 'ID' }, { key: 'recommendation_name', label: 'Öneri' }, { key: 'remediation_type', label: 'Tip' }]} />}{tab === 4 && <Alert severity={row.msrc_match ? 'success' : 'info'}>{row.msrc_match ? 'MSRC Var' : 'MSRC kaydı bulunamadı'}</Alert>}{tab === 5 && <pre>{JSON.stringify(row.raw || row, null, 2)}</pre>}</Box></DialogContent><DialogActions><Button onClick={onClose}>Kapat</Button></DialogActions></Dialog>;
}

function Reports({ findings }) {
  const rows = [
    ['Kritik/Yüksek Defender CVE Raporu', 'Defender ekranından Excel export ile alınabilir.'], ['Uygulama Bazlı Zafiyet Raporu', 'Defender_Cihaz_Yazilim_CVE sayfası kullanılır.'], ['Cihaz Bazlı Zafiyet Raporu', 'Cihaz adına göre filtrelenmiş rapor.'], ['Public Exploit Olan CVE Raporu', 'Public exploit kolonu Evet olanlar.'], ['Remediation Bekleyenler Raporu', 'Remediation status açık/pending olanlar.'], ['Defender’dan Bulguya Dönüştürülenler Raporu', `${findings.filter((f) => f.source === 'Defender').length} kayıt`],
  ];
  return <Stack spacing={2}><SectionHeader title="Raporlar" description="Bulgular ve Defender raporları Excel’e aktarılabilir." /><Button variant="contained" href={exportUrl()}>Ana Bulgular Excel Export</Button><Button variant="outlined" href={defenderExportUrl()}>Defender Excel Export</Button><DataTable title="Defender Raporları" rows={rows.map(([name, desc], id) => ({ id, name, desc }))} columns={[{ key: 'name', label: 'Rapor' }, { key: 'desc', label: 'Açıklama' }]} /></Stack>;
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
  const saveNew = async (payload) => { try { await createFinding(payload); show('Bulgu başarıyla kaydedildi.', 'success'); setTab(1); refresh(); } catch (e) { show(e.message, 'error'); } };
  const goFindings = (filters = {}) => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`); setTab(1); };
  const imported = (r) => { show(`İçe aktarma tamamlandı: ${r.created} yeni, ${r.updated} güncellendi, ${r.failed} hatalı`, r.failed ? 'warning' : 'success'); refresh(); };
  const content = () => {
    if (tab === 0) return <Dashboard summary={summary} onFindingsFilter={goFindings} />;
    if (tab === 1) return <FindingsPage summary={summary} refresh={refresh} show={show} />;
    if (tab === 2) return <AddFindingPage onSave={saveNew} onImported={imported} show={show} />;
    if (tab === 3) return <MsrcPage />;
    if (tab === 4) return <DefenderPage show={show} refreshApp={refresh} />;
    if (tab === 5) return <Reports findings={findings} />;
    return <SettingsPage show={show} />;
  };
  return <ThemeProvider theme={theme}><CssBaseline /><Box sx={{ bgcolor: 'background.default', display: 'flex', minHeight: '100vh' }}><AppBar position="fixed" sx={{ zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1 }}><Toolbar sx={{ gap: 2, minHeight: 72 }}><BrandLogo height={40} /><Box sx={{ flexGrow: 1 }}><Typography variant="h6" noWrap>Siber Risk ve Bulgu Yönetimi</Typography></Box><Button color="inherit" href={exportUrl()} variant="contained" sx={{ bgcolor: 'rgba(255,255,255,.15)' }}>Excel Dışa Aktar</Button></Toolbar></AppBar><Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box', bgcolor: '#fff', borderRight: '1px solid rgba(15, 47, 87, 0.10)', overflowX: 'hidden' } }}><Toolbar sx={{ minHeight: 76, justifyContent: 'center', px: 2 }}><BrandLogo height={36} /></Toolbar><Divider /><Box sx={{ p: 2 }}><Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ display: 'block', textAlign: 'center', letterSpacing: 1, fontSize: 11, mb: 1 }}>MENÜ</Typography><List disablePadding sx={{ display: 'grid', gap: .75 }}>{navigationItems.map((item, index) => <ListItemButton key={item} selected={tab === index} onClick={() => setTab(index)} sx={{ borderRadius: '18px', minHeight: 48, py: 1, px: 1.75, justifyContent: 'center', alignItems: 'center', textAlign: 'center', '&:hover': { bgcolor: '#f3f6fa' }, '&.Mui-selected': { bgcolor: '#0f2f57', color: 'primary.contrastText', boxShadow: '0 10px 22px rgba(15, 47, 87, .18)', '&:hover': { bgcolor: 'primary.dark' } } }}><ListItemText primary={item} secondary={index === 1 ? `${findings.length} kayıt` : index === 0 ? 'Genel görünüm' : null} sx={{ m: 0, textAlign: 'center' }} primaryTypographyProps={{ fontWeight: 800, textAlign: 'center', fontSize: 14, lineHeight: 1.2 }} secondaryTypographyProps={{ textAlign: 'center', fontSize: 11, lineHeight: 1.2, mt: .25, color: tab === index ? 'rgba(255,255,255,.76)' : 'text.secondary' }} /></ListItemButton>)}</List></Box></Drawer><Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}><Toolbar sx={{ minHeight: 72 }} /><Container maxWidth="xl" sx={{ py: 3.5 }}>{content()}</Container></Box><Snackbar open={Boolean(message)} autoHideDuration={6000} onClose={() => setMessage('')}><Alert severity={severity} onClose={() => setMessage('')}>{message}</Alert></Snackbar></Box></ThemeProvider>;
}

createRoot(document.getElementById('root')).render(<App />);
