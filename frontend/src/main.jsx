import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  List,
  ListItemButton,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import { exportUrl, getDashboard, getFindings, getLogs, importExcel, updateFinding } from './api';

const LOGO_SRC = '/assets/surat-logo.svg';
const DRAWER_WIDTH = 260;

const severities = ['Acil', 'Kritik', 'Yüksek', 'Orta', 'Düşük'];
const statuses = ['Devam Ediyor', 'Kapatıldı'];

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR');
}

function BrandLogo({ height = 38 }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="Sürat Kargo"
      sx={{
        display: 'block',
        height,
        maxWidth: '100%',
        objectFit: 'contain',
      }}
    />
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card elevation={2}>
      <CardContent>
        <Typography color="text.secondary" variant="body2">{label}</Typography>
        <Typography variant="h4" fontWeight={700}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

function Dashboard({ summary, logs }) {
  if (!summary) return null;
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={2.4}><SummaryCard label="Toplam Bulgu" value={summary.total} /></Grid>
      <Grid item xs={12} md={2.4}><SummaryCard label="Kapatılan" value={summary.closed} /></Grid>
      <Grid item xs={12} md={2.4}><SummaryCard label="Açık Kalan" value={summary.open} /></Grid>
      <Grid item xs={12} md={2.4}><SummaryCard label="Kapanma Oranı" value={`%${summary.closure_rate}`} /></Grid>
      <Grid item xs={12} md={2.4}><SummaryCard label="Son Çalışma Saati" value={formatDate(summary.last_work_time) || '-'} /></Grid>
      <Grid item xs={12} md={7}>
        <Typography variant="h6" gutterBottom>Durum Seviyesi Özeti</Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Durum Seviyesi</TableCell><TableCell>Toplam</TableCell><TableCell>Kapatılan</TableCell><TableCell>Açık Kalan</TableCell></TableRow></TableHead>
            <TableBody>{summary.severity_rows.map((row) => <TableRow key={row.severity}><TableCell>{row.severity}</TableCell><TableCell>{row.total}</TableCell><TableCell>{row.closed}</TableCell><TableCell>{row.open}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Grid>
      <Grid item xs={12} md={5}>
        <Typography variant="h6" gutterBottom>Son Loglar</Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Zaman</TableCell><TableCell>Kullanıcı</TableCell><TableCell>İşlem</TableCell></TableRow></TableHead>
            <TableBody>{logs.slice(0, 8).map((log) => <TableRow key={log.id}><TableCell>{formatDate(log.created_at)}</TableCell><TableCell>{log.actor}</TableCell><TableCell>{log.detail || log.action}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Grid>
    </Grid>
  );
}

function FilterBar({ filters, setFilters, refresh }) {
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={2}>
          <FormControl fullWidth size="small"><InputLabel>Durum Seviyesi</InputLabel><Select label="Durum Seviyesi" value={filters.severity} onChange={(e) => set('severity', e.target.value)}><MenuItem value="">Tümü</MenuItem>{severities.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></FormControl>
        </Grid>
        <Grid item xs={12} md={2}>
          <FormControl fullWidth size="small"><InputLabel>Durum</InputLabel><Select label="Durum" value={filters.status} onChange={(e) => set('status', e.target.value)}><MenuItem value="">Tümü</MenuItem>{statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></FormControl>
        </Grid>
        <Grid item xs={12} md={2}><TextField fullWidth size="small" label="İlgili Birim / Kurum" value={filters.related_unit} onChange={(e) => set('related_unit', e.target.value)} /></Grid>
        <Grid item xs={12} md={2}><TextField fullWidth size="small" label="İlgili Kişi" value={filters.related_person} onChange={(e) => set('related_person', e.target.value)} /></Grid>
        <Grid item xs={12} md={3}>
          <FormControlLabel control={<Checkbox checked={filters.approaching_due} onChange={(e) => set('approaching_due', e.target.checked)} />} label="Termin yaklaşanlar" />
          <FormControlLabel control={<Checkbox checked={filters.open_only} onChange={(e) => set('open_only', e.target.checked)} />} label="Açık kalanlar" />
          <FormControlLabel control={<Checkbox checked={filters.closed_only} onChange={(e) => set('closed_only', e.target.checked)} />} label="Kapatılanlar" />
        </Grid>
        <Grid item xs={12} md={1}><Button fullWidth variant="outlined" startIcon={<RefreshIcon />} onClick={refresh}>Yenile</Button></Grid>
      </Grid>
    </Paper>
  );
}

function FindingsTable({ findings, onChange }) {
  const editable = useMemo(() => ['impact', 'description', 'recommendation', 'related_unit', 'related_person', 'note'], []);
  const update = async (finding, key, value) => onChange(finding.id, { [key]: value });
  return (
    <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            {['Kayıt No', 'Bulgu Başlığı', 'Durum Seviyesi', 'Bulgunun Etkisi', 'Bulgunun Açıklaması', 'Çözüm Önerisi', 'İlgili Birim / Kurum', 'İlgili Kişi', 'Durum', 'Termin Tarih', 'Yeni Termin', 'Not', 'Son Güncelleme'].map((header) => <TableCell key={header} sx={{ fontWeight: 700 }}>{header}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={finding.id} sx={{ backgroundColor: finding.status === 'Kapatıldı' ? '#d9ead3' : 'inherit' }}>
              <TableCell>{finding.record_no}</TableCell>
              <TableCell><TextField size="small" value={finding.title || ''} onChange={(e) => update(finding, 'title', e.target.value)} /></TableCell>
              <TableCell><Select size="small" value={finding.severity} onChange={(e) => update(finding, 'severity', e.target.value)}>{severities.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></TableCell>
              {editable.slice(0, 5).map((field) => <TableCell key={field}><TextField size="small" multiline maxRows={3} value={finding[field] || ''} onChange={(e) => update(finding, field, e.target.value)} /></TableCell>)}
              <TableCell><Select size="small" value={finding.status} onChange={(e) => update(finding, 'status', e.target.value)}>{statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></TableCell>
              <TableCell><TextField size="small" type="date" value={finding.due_date || ''} onChange={(e) => update(finding, 'due_date', e.target.value || null)} /></TableCell>
              <TableCell><TextField size="small" type="date" value={finding.new_due_date || ''} onChange={(e) => update(finding, 'new_due_date', e.target.value || null)} /></TableCell>
              <TableCell><TextField size="small" multiline maxRows={3} value={finding.note || ''} onChange={(e) => update(finding, 'note', e.target.value)} /></TableCell>
              <TableCell>{formatDate(finding.updated_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function App() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [findings, setFindings] = useState([]);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ severity: '', status: '', related_unit: '', related_person: '', approaching_due: false, open_only: false, closed_only: false });

  const refresh = async () => {
    const [dashboard, findingRows, logRows] = await Promise.all([getDashboard(), getFindings(filters), getLogs()]);
    setSummary(dashboard);
    setFindings(findingRows);
    setLogs(logRows);
  };

  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, [filters]);

  const handleUpdate = async (id, payload) => {
    await updateFinding(id, payload);
    await refresh();
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await importExcel(file);
    setMessage(`${result.message}: ${result.created} yeni, ${result.updated} güncellendi`);
    await refresh();
  };

  return (
    <Box sx={{ bgcolor: '#f5f7fb', display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 2 }}>
          <BrandLogo height={38} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Kurumsal Güvenlik Bulgu Takip</Typography>
          <Button color="inherit" component="label" startIcon={<UploadFileIcon />}>Excel İçe Aktar<input hidden type="file" accept=".xlsx,.xlsm" onChange={handleImport} /></Button>
          <Button color="inherit" href={exportUrl()} startIcon={<FileDownloadIcon />}>Excel Dışa Aktar</Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: '#ffffff',
          },
        }}
      >
        <Toolbar sx={{ justifyContent: 'center' }}>
          <BrandLogo height={38} />
        </Toolbar>
        <Divider />
        <List sx={{ px: 1.5 }}>
          <ListItemButton selected={tab === 0} onClick={() => setTab(0)} sx={{ borderRadius: 2, mb: 1 }}>
            <ListItemText primary="Özet / Dashboard" />
          </ListItemButton>
          <ListItemButton selected={tab === 1} onClick={() => setTab(1)} sx={{ borderRadius: 2 }}>
            <ListItemText
              primary="Bulgular"
              secondary={`${findings.length} kayıt`}
            />
          </ListItemButton>
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {tab === 0 && <Dashboard summary={summary} logs={logs} />}
          {tab === 1 && <><FilterBar filters={filters} setFilters={setFilters} refresh={refresh} /><FindingsTable findings={findings} onChange={handleUpdate} /></>}
        </Container>
      </Box>
      <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage('')}><Alert severity="info" onClose={() => setMessage('')}>{message}</Alert></Snackbar>
    </Box>
  );
}

createRoot(document.getElementById('root')).render(<App />);
