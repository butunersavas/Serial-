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
  Chip,
  Container,
  CssBaseline,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
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
  ThemeProvider,
  Toolbar,
  Typography,
} from '@mui/material';
import { exportUrl, getDashboard, getFindings, getLogs, importExcel, updateFinding } from './api';
import theme, { severityColors } from './theme';

const LOGO_SRC = '/assets/surat-logo.svg';
const DRAWER_WIDTH = 292;

const severities = ['Acil', 'Kritik', 'Yüksek', 'Orta', 'Düşük'];
const statuses = ['Devam Ediyor', 'Kapatıldı'];

const demoSummary = {
  total: 48,
  closed: 19,
  open: 29,
  closure_rate: 40,
  last_work_time: new Date().toISOString(),
  severity_rows: [
    { severity: 'Acil', total: 3, closed: 1, open: 2 },
    { severity: 'Kritik', total: 8, closed: 2, open: 6 },
    { severity: 'Yüksek', total: 14, closed: 5, open: 9 },
    { severity: 'Orta', total: 17, closed: 8, open: 9 },
    { severity: 'Düşük', total: 6, closed: 3, open: 3 },
  ],
};

const demoLogs = [
  { id: 'demo-1', created_at: new Date().toISOString(), actor: 'Sistem', detail: 'Dashboard kurumsal görünüm ön izlemesi hazırlandı' },
  { id: 'demo-2', created_at: new Date(Date.now() - 1000 * 60 * 52).toISOString(), actor: 'Güvenlik Ekibi', detail: 'Excel içe aktarma beklemede' },
  { id: 'demo-3', created_at: new Date(Date.now() - 1000 * 60 * 115).toISOString(), actor: 'MSRC', detail: 'CVE gündemi takip ediliyor' },
];

const navigationItems = [
  'Dashboard',
  'Bulgular',
  'Bulgu Ekle',
  'Excel ile Bulgu Ekle',
  'Microsoft CVE / MSRC',
  'Raporlar',
  'Ayarlar',
];

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR');
}

function BrandLogo({ height = 40 }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="Sürat Kargo"
      sx={{
        display: 'block',
        height,
        maxHeight: height,
        maxWidth: '100%',
        objectFit: 'contain',
      }}
    />
  );
}

function SummaryCard({ label, value, helper, accent = 'primary.main' }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography color="text.secondary" variant="body2" fontWeight={700}>{label}</Typography>
            <Typography variant="h4" fontWeight={900} sx={{ mt: 0.5 }}>{value}</Typography>
          </Box>
          <Box sx={{ width: 10, height: 54, borderRadius: 10, bgcolor: accent }} />
        </Stack>
        {helper && <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1.5 }}>{helper}</Typography>}
      </CardContent>
    </Card>
  );
}

function SeverityChip({ severity }) {
  return (
    <Chip
      label={severity}
      size="small"
      sx={{
        minWidth: 72,
        bgcolor: severityColors[severity] || 'primary.main',
        color: severity === 'Orta' ? '#1f2937' : '#ffffff',
        fontWeight: 800,
      }}
    />
  );
}

function SectionHeader({ title, description }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="h5" color="primary.dark">{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
    </Box>
  );
}

function Dashboard({ summary, logs }) {
  const data = summary || demoSummary;
  const logRows = logs.length ? logs : demoLogs;
  const closureRate = Number(data.closure_rate) || 0;

  return (
    <Stack spacing={3}>
      <Paper
        sx={{
          p: 3,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(15, 47, 87, 0.08)',
          background: 'linear-gradient(135deg, rgba(15, 47, 87, 0.96), rgba(31, 90, 149, 0.9))',
          color: '#ffffff',
        }}
      >
        <Typography variant="overline" sx={{ opacity: 0.82, letterSpacing: 1.4 }}>Kurumsal Güvenlik Operasyon Paneli</Typography>
        <Typography variant="h5" sx={{ mt: 0.5 }}>Bulgu takibi, termin yönetimi ve aksiyon görünürlüğü tek ekranda.</Typography>
        <Typography sx={{ mt: 1.5, maxWidth: 820, opacity: 0.82 }}>
          Kritik güvenlik bulgularını önceliklendirmek, Excel süreçlerini yönetmek ve kapanma performansını toplantı ekranına uygun şekilde izlemek için hazırlanmış marka iskeleti.
        </Typography>
      </Paper>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={2.4}><SummaryCard label="Toplam Bulgu" value={data.total} helper="Tüm kayıt havuzu" accent="primary.dark" /></Grid>
        <Grid item xs={12} md={2.4}><SummaryCard label="Kapatılan" value={data.closed} helper="Aksiyon tamamlandı" accent="success.main" /></Grid>
        <Grid item xs={12} md={2.4}><SummaryCard label="Açık Kalan" value={data.open} helper="Takip gerektiriyor" accent="warning.main" /></Grid>
        <Grid item xs={12} md={2.4}><SummaryCard label="Kapanma Oranı" value={`%${data.closure_rate}`} helper="Hedef: sürdürülebilir kapanış" accent="secondary.main" /></Grid>
        <Grid item xs={12} md={2.4}><SummaryCard label="Son Çalışma Saati" value={formatDate(data.last_work_time) || '-'} helper="En güncel işlem zamanı" accent="primary.light" /></Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2.5, height: '100%', border: '1px solid rgba(15, 47, 87, 0.08)' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Typography variant="h6">Durum Seviyesi Özeti</Typography>
              <Chip label={`Kapanma %${closureRate}`} color="primary" variant="outlined" />
            </Stack>
            <LinearProgress variant="determinate" value={Math.min(closureRate, 100)} sx={{ height: 10, borderRadius: 20, mb: 2.5 }} />
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Durum Seviyesi</TableCell><TableCell>Toplam</TableCell><TableCell>Kapatılan</TableCell><TableCell>Açık Kalan</TableCell></TableRow></TableHead>
                <TableBody>{data.severity_rows.map((row) => <TableRow key={row.severity}><TableCell><SeverityChip severity={row.severity} /></TableCell><TableCell>{row.total}</TableCell><TableCell>{row.closed}</TableCell><TableCell>{row.open}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2.5, height: '100%', border: '1px solid rgba(15, 47, 87, 0.08)' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Son İşlemler</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Zaman</TableCell><TableCell>Kullanıcı</TableCell><TableCell>İşlem</TableCell></TableRow></TableHead>
                <TableBody>{logRows.slice(0, 8).map((log) => <TableRow key={log.id}><TableCell>{formatDate(log.created_at)}</TableCell><TableCell>{log.actor}</TableCell><TableCell>{log.detail || log.action}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function FilterBar({ filters, setFilters, refresh }) {
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <Paper sx={{ p: 2, mb: 2, border: '1px solid rgba(15, 47, 87, 0.08)' }}>
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
        <Grid item xs={12} md={1}><Button fullWidth variant="outlined" onClick={refresh}>Yenile</Button></Grid>
      </Grid>
    </Paper>
  );
}

function FindingsTable({ findings, onChange }) {
  const editable = useMemo(() => ['impact', 'description', 'recommendation', 'related_unit', 'related_person', 'note'], []);
  const update = async (finding, key, value) => onChange(finding.id, { [key]: value });
  return (
    <TableContainer component={Paper} sx={{ maxHeight: '70vh', border: '1px solid rgba(15, 47, 87, 0.08)' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            {['Kayıt No', 'Bulgu Başlığı', 'Durum Seviyesi', 'Bulgunun Etkisi', 'Bulgunun Açıklaması', 'Çözüm Önerisi', 'İlgili Birim / Kurum', 'İlgili Kişi', 'Durum', 'Termin Tarih', 'Yeni Termin', 'Not', 'Son Güncelleme'].map((header) => <TableCell key={header} sx={{ fontWeight: 800, color: 'primary.dark' }}>{header}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={finding.id} sx={{ backgroundColor: finding.status === 'Kapatıldı' ? 'success.light' : 'inherit' }}>
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

function PlaceholderPage({ title, description }) {
  return (
    <Paper sx={{ p: 4, border: '1px solid rgba(15, 47, 87, 0.08)' }}>
      <SectionHeader title={title} description={description} />
      <Grid container spacing={2.5}>
        {['Süreç tasarımı', 'Yetkilendirme', 'Raporlama'].map((item) => (
          <Grid item xs={12} md={4} key={item}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" color="primary.dark">{item}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>Bu alan marka ve navigasyon iskeleti kapsamında hazırlandı; mevcut API akışları korunarak sonraki aşamalarda detaylandırılabilir.</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}

function MainContent({ tab, summary, logs, findings, filters, setFilters, refresh, handleUpdate }) {
  if (tab === 0) return <Dashboard summary={summary} logs={logs} />;
  if (tab === 1) {
    return (
      <>
        <SectionHeader title="Bulgular" description="Filtreleme, satır içi güncelleme ve termin takibi için mevcut API bağlantıları korunmuştur." />
        <FilterBar filters={filters} setFilters={setFilters} refresh={refresh} />
        <FindingsTable findings={findings} onChange={handleUpdate} />
      </>
    );
  }
  const pages = {
    2: ['Bulgu Ekle', 'Yeni güvenlik bulgularını standart alan seti ile kaydetmek için hazırlanan kurumsal sayfa iskeleti.'],
    3: ['Excel ile Bulgu Ekle', 'Toplu bulgu yükleme operasyonları için Excel odaklı işlem alanı.'],
    4: ['Microsoft CVE / MSRC', 'Microsoft CVE ve MSRC duyurularını takip etmek için ayrılan güvenlik gündemi ekranı.'],
    5: ['Raporlar', 'Yönetim ve güvenlik toplantıları için özet, dışa aktarım ve performans görünümü.'],
    6: ['Ayarlar', 'Uygulama tercihleri, kurum standartları ve kullanıcı yetkileri için ayar iskeleti.'],
  };
  const [title, description] = pages[tab];
  return <PlaceholderPage title={title} description={description} />;
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

  const lastWorkTime = formatDate(summary?.last_work_time) || formatDate(demoSummary.last_work_time);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ bgcolor: 'background.default', display: 'flex', minHeight: '100vh' }}>
        <AppBar position="fixed" sx={{ zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1 }}>
          <Toolbar sx={{ gap: 2, minHeight: 72 }}>
            <BrandLogo height={40} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" noWrap>Kurumsal Güvenlik Bulgu Takip</Typography>
              <Typography variant="caption" sx={{ opacity: 0.78 }}>Sürat Kargo güvenlik bulgu takip ve raporlama paneli</Typography>
            </Box>
            <Chip label={`Son Çalışma Saati: ${lastWorkTime}`} sx={{ display: { xs: 'none', lg: 'inline-flex' }, color: '#ffffff', borderColor: 'rgba(255,255,255,0.42)' }} variant="outlined" />
            <Button color="inherit" component="label" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.42)' }}>Excel İçe Aktar<input hidden type="file" accept=".xlsx,.xlsm" onChange={handleImport} /></Button>
            <Button color="inherit" href={exportUrl()} variant="contained" sx={{ bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' } }}>Excel Dışa Aktar</Button>
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
              borderRight: '1px solid rgba(15, 47, 87, 0.10)',
            },
          }}
        >
          <Toolbar sx={{ minHeight: 88, justifyContent: 'center', px: 3 }}>
            <BrandLogo height={40} />
          </Toolbar>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ px: 1.5, letterSpacing: 0.8 }}>MENÜ</Typography>
            <List sx={{ mt: 1 }}>
              {navigationItems.map((item, index) => (
                <ListItemButton
                  key={item}
                  selected={tab === index}
                  onClick={() => setTab(index)}
                  sx={{
                    borderRadius: 2.5,
                    mb: 0.75,
                    py: 1.15,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      boxShadow: '0 10px 22px rgba(15, 47, 87, 0.20)',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '& .MuiListItemText-secondary': { color: 'rgba(255,255,255,0.78)' },
                    },
                  }}
                >
                  <ListItemText
                    primary={item}
                    secondary={index === 1 ? `${findings.length} kayıt` : index === 0 ? 'Genel görünüm' : null}
                    primaryTypographyProps={{ fontWeight: 800 }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          <Toolbar sx={{ minHeight: 72 }} />
          <Container maxWidth="xl" sx={{ py: 3.5 }}>
            <MainContent
              tab={tab}
              summary={summary}
              logs={logs}
              findings={findings}
              filters={filters}
              setFilters={setFilters}
              refresh={refresh}
              handleUpdate={handleUpdate}
            />
          </Container>
        </Box>
        <Snackbar open={Boolean(message)} autoHideDuration={5000} onClose={() => setMessage('')}><Alert severity="info" onClose={() => setMessage('')}>{message}</Alert></Snackbar>
      </Box>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
